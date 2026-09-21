import { idOf } from './ids.ts';
import type { BindGroupInfo, ViewInfo } from './registry.ts';
import type { InspectorSession } from './session.ts';
import { EncoderTimestamps, type TimestampRef, TimestampPool } from './timestamps.ts';
import type {
  DrawCall,
  PassKind,
  PassRecord,
  ResourceAccess,
  ResourceRole,
  ResourceUse,
} from './types.ts';

let nextPassId = 1;

function createPassRecord(kind: PassKind, label: string): PassRecord {
  return {
    id: nextPassId++,
    kind,
    label,
    reads: [],
    writes: [],
    pipelines: [],
    bindGroups: [],
    calls: [],
    draws: 0,
    vertices: 0,
    instances: 0,
    dispatches: 0,
    workgroups: 0,
    bundles: 0,
    snapshots: [],
    attachments: [],
    timing: 'unavailable',
    gpuTime: undefined,
    ownTimestamps: false,
  };
}

/** Attaches a resource use to the pass, merging with an existing use of the same resource and role */
function addUse(pass: PassRecord, use: ResourceUse): void {
  const list = use.access === 'read' ? pass.reads : pass.writes;
  const existing = list.find(
    (u) => u.resource.id === use.resource.id && u.role === use.role && u.slot === use.slot,
  );
  if (!existing) {
    list.push(use);
  }
  if (use.access === 'read-write') {
    if (!pass.reads.some((u) => u.resource.id === use.resource.id && u.role === use.role)) {
      pass.reads.push({ ...use, access: 'read' });
    }
  }
}

function describeOps(loadOp: string | undefined, storeOp: string | undefined): string {
  return `${loadOp ?? '-'} / ${storeOp ?? '-'}`;
}

/**
 * Bookkeeping for a single command encoder: the passes recorded on it, and
 * the timestamp queries used to time them.
 */
export class EncoderRecord {
  readonly session: InspectorSession;
  readonly device: GPUDevice;
  readonly raw: GPUCommandEncoder;
  readonly passes: PassRecord[] = [];
  submitted = false;

  #timestamps: EncoderTimestamps | undefined;
  #timestampsExhausted = false;
  #timedPasses: { pass: PassRecord; ref: TimestampRef }[] = [];
  #snapshotsWanted: boolean;

  constructor(session: InspectorSession, device: GPUDevice, raw: GPUCommandEncoder) {
    this.session = session;
    this.device = device;
    this.raw = raw;
    // Decided once per encoder, so that all passes of a frame are treated the same.
    this.#snapshotsWanted = session.shouldSnapshot;
  }

  // ----- Pass bookkeeping -----

  beginRenderPass(descriptor: GPURenderPassDescriptor): {
    descriptor: GPURenderPassDescriptor;
    pass: PassRecord;
  } {
    const pass = createPassRecord('render', descriptor.label ?? '');
    // Attachments may be given as a one-shot iterable, so materialize them
    // before both inspecting and forwarding them.
    const colorAttachments = Array.from(descriptor.colorAttachments);

    let colorIndex = 0;
    for (const attachment of colorAttachments) {
      if (!attachment) {
        colorIndex++;
        continue;
      }
      const slot = `color${colorIndex++}`;
      const access: ResourceAccess = attachment.loadOp === 'load' ? 'read-write' : 'write';
      const ops = describeOps(attachment.loadOp, attachment.storeOp);
      this.#addViewUse(pass, attachment.view, 'color', access, slot, ops);
      pass.attachments.push(`${slot}: ${ops}`);
      if (attachment.resolveTarget) {
        this.#addViewUse(pass, attachment.resolveTarget, 'resolve', 'write', `${slot} resolve`);
      }
    }

    const ds = descriptor.depthStencilAttachment;
    if (ds) {
      const readOnly = (ds.depthReadOnly ?? false) && (ds.stencilReadOnly ?? false);
      const loads = ds.depthLoadOp === 'load' || ds.stencilLoadOp === 'load';
      const access: ResourceAccess = readOnly ? 'read' : loads ? 'read-write' : 'write';
      const ops = `depth ${describeOps(ds.depthLoadOp, ds.depthStoreOp)}${
        ds.stencilLoadOp || ds.stencilStoreOp
          ? `, stencil ${describeOps(ds.stencilLoadOp, ds.stencilStoreOp)}`
          : ''
      }`;
      this.#addViewUse(pass, ds.view, 'depth-stencil', access, 'depth-stencil', ops);
      pass.attachments.push(ops);
    }

    const timestampWrites = this.#assignTimestamps(pass, descriptor.timestampWrites);
    this.passes.push(pass);
    return {
      descriptor: timestampWrites
        ? { ...descriptor, colorAttachments, timestampWrites }
        : { ...descriptor, colorAttachments },
      pass,
    };
  }

  beginComputePass(descriptor: GPUComputePassDescriptor | undefined): {
    descriptor: GPUComputePassDescriptor | undefined;
    pass: PassRecord;
  } {
    const pass = createPassRecord('compute', descriptor?.label ?? '');
    const timestampWrites = this.#assignTimestamps(pass, descriptor?.timestampWrites);
    this.passes.push(pass);
    return {
      descriptor: timestampWrites ? { ...descriptor, timestampWrites } : descriptor,
      pass,
    };
  }

  recordCopy(
    label: string,
    reads: { texture?: GPUTexture; buffer?: GPUBuffer }[],
    writes: { texture?: GPUTexture; buffer?: GPUBuffer }[],
  ): void {
    const pass = createPassRecord('copy', label);
    for (const r of reads) {
      if (r.texture) this.#addTextureUse(pass, r.texture, 'copy-src', 'read', undefined, undefined);
      if (r.buffer) this.#addBufferUse(pass, r.buffer, 'copy-src', 'read', undefined);
    }
    for (const w of writes) {
      if (w.texture)
        this.#addTextureUse(pass, w.texture, 'copy-dst', 'write', undefined, undefined);
      if (w.buffer) this.#addBufferUse(pass, w.buffer, 'copy-dst', 'write', undefined);
    }
    this.passes.push(pass);
  }

  onSetPipeline(pass: PassRecord, pipeline: GPURenderPipeline | GPUComputePipeline): void {
    const label = pipeline.label || `pipeline#${idOf(pipeline)}`;
    if (!pass.pipelines.includes(label)) {
      pass.pipelines.push(label);
    }
    if (!pass.label) {
      pass.label = label;
    }
  }

  onSetBindGroup(pass: PassRecord, index: number, bindGroup: GPUBindGroup | null): void {
    if (!bindGroup) {
      return;
    }
    const info: BindGroupInfo | undefined = this.session.registry.getBindGroup(bindGroup);
    const label = bindGroup.label || info?.label || `bindGroup#${idOf(bindGroup)}`;
    const groupLabel = `@group(${index}) ${label}`;
    if (!pass.bindGroups.includes(groupLabel)) {
      pass.bindGroups.push(groupLabel);
    }
    if (!info) {
      return;
    }
    for (const entry of info.entries) {
      const slot = `@group(${index}) @binding(${entry.binding})`;
      if (entry.kind === 'texture') {
        const view = this.session.registry.getView(entry.view);
        if (!view) {
          continue;
        }
        const isStorage = (view.texture.usage & GPUTextureUsage.STORAGE_BINDING) !== 0;
        this.#addTextureUse(
          pass,
          view.texture,
          isStorage ? 'storage' : 'binding',
          isStorage ? 'read-write' : 'read',
          slot,
          entry.view,
        );
      } else if (entry.kind === 'buffer') {
        const isStorage = (entry.buffer.usage & GPUBufferUsage.STORAGE) !== 0;
        this.#addBufferUse(
          pass,
          entry.buffer,
          isStorage ? 'storage' : 'binding',
          isStorage ? 'read-write' : 'read',
          slot,
        );
      }
    }
  }

  onSetVertexBuffer(pass: PassRecord, slot: number, buffer: GPUBuffer | null): void {
    if (buffer) {
      this.#addBufferUse(pass, buffer, 'vertex', 'read', `vertex slot ${slot}`);
    }
  }

  onSetIndexBuffer(pass: PassRecord, buffer: GPUBuffer): void {
    this.#addBufferUse(pass, buffer, 'index', 'read', 'index');
  }

  onIndirectBuffer(pass: PassRecord, buffer: GPUBuffer): void {
    this.#addBufferUse(pass, buffer, 'indirect', 'read', 'indirect');
  }

  onCall(pass: PassRecord, call: DrawCall): void {
    pass.calls.push(call);
    switch (call.kind) {
      case 'draw': {
        const [vertexCount = 0, instanceCount = 1] = call.args;
        pass.draws++;
        pass.vertices += vertexCount * instanceCount;
        pass.instances += instanceCount;
        break;
      }
      case 'drawIndexed': {
        const [indexCount = 0, instanceCount = 1] = call.args;
        pass.draws++;
        pass.vertices += indexCount * instanceCount;
        pass.instances += instanceCount;
        break;
      }
      case 'drawIndirect':
      case 'drawIndexedIndirect':
        pass.draws++;
        break;
      case 'executeBundles':
        pass.bundles += call.args[0] ?? 0;
        break;
      case 'dispatchWorkgroups': {
        const [x = 1, y = 1, z = 1] = call.args;
        pass.dispatches++;
        pass.workgroups += x * y * z;
        break;
      }
      case 'dispatchWorkgroupsIndirect':
        pass.dispatches++;
        break;
    }
  }

  /** Called right after a pass has ended, when the encoder can record copies again */
  afterPassEnd(pass: PassRecord): void {
    if (!this.#snapshotsWanted) {
      return;
    }
    const { snapshots } = this.session;
    const captured = new Set<number>();

    // If a color attachment is resolved into another texture, prefer showing
    // the resolved (single-sampled) result.
    const resolvedSlots = new Set(
      pass.writes.filter((w) => w.role === 'resolve').map((w) => w.slot?.replace(' resolve', '')),
    );

    for (const use of pass.writes) {
      if (use.resource.kind !== 'texture') {
        continue;
      }
      if (use.role === 'color' && resolvedSlots.has(use.slot)) {
        continue;
      }
      if (use.role === 'depth-stencil' && use.details?.includes('discard')) {
        continue;
      }
      const texture = textureHandles.get(use);
      if (!texture || captured.has(use.resource.id)) {
        continue;
      }
      try {
        const snapshot = snapshots.capture(
          this.device,
          this.raw,
          texture,
          use.resource,
          use.role,
          viewHandles.get(use),
        );
        if (snapshot) {
          captured.add(use.resource.id);
          pass.snapshots.push(snapshot);
        }
      } catch (err) {
        console.warn('[webgpu-inspector] could not snapshot texture', use.resource.label, err);
      }
    }
  }

  /** Called before the encoder is finished, outside of any pass */
  beforeFinish(): void {
    if (this.#timestamps && !this.#timestamps.isEmpty) {
      try {
        this.#timestamps.recordResolve(
          this.raw,
          this.#timedPasses.map((t) => t.ref),
        );
      } catch (err) {
        console.warn('[webgpu-inspector] could not resolve timestamps', err);
      }
    }
  }

  /** Called after the command buffer produced by this encoder has been submitted */
  afterSubmit(): void {
    const timestamps = this.#timestamps;
    if (!timestamps) {
      return;
    }
    const timed = this.#timedPasses;
    if (timed.length === 0) {
      this.session.timestamps.release(this.device, timestamps.entry);
      return;
    }
    timestamps
      .read(timed.map((t) => t.ref))
      .then((durations) => {
        if (!durations) {
          this.session.timestamps.discard(this.device, timestamps.entry);
          for (const { pass } of timed) {
            this.session.reportTiming(pass, undefined);
          }
          return;
        }
        this.session.timestamps.release(this.device, timestamps.entry);
        timed.forEach(({ pass }, i) => {
          this.session.reportTiming(pass, durations[i]);
        });
      })
      .catch(() => {
        this.session.timestamps.discard(this.device, timestamps.entry);
      });
  }

  // ----- Helpers -----

  #assignTimestamps(
    pass: PassRecord,
    existing: GPUComputePassTimestampWrites | GPURenderPassTimestampWrites | undefined,
  ): GPUComputePassTimestampWrites | undefined {
    if (!TimestampPool.supports(this.device)) {
      return undefined;
    }
    if (!this.#timestamps && !this.#timestampsExhausted) {
      const entry = this.session.timestamps.acquire(this.device);
      if (entry) {
        this.#timestamps = new EncoderTimestamps(entry);
      } else {
        this.#timestampsExhausted = true;
      }
    }
    const timestamps = this.#timestamps;
    if (!timestamps) {
      return undefined;
    }

    if (existing) {
      const ref = timestamps.adoptForeign(existing);
      if (ref) {
        pass.timing = 'pending';
        pass.ownTimestamps = true;
        this.#timedPasses.push({ pass, ref });
      }
      return undefined;
    }

    const own = timestamps.allocateOwn();
    if (!own) {
      return undefined;
    }
    pass.timing = 'pending';
    this.#timedPasses.push({ pass, ref: own.ref });
    return own.writes;
  }

  #addViewUse(
    pass: PassRecord,
    view: GPUTextureView | GPUTexture,
    role: ResourceRole,
    access: ResourceAccess,
    slot: string | undefined,
    details?: string,
  ): void {
    const asView = this.session.registry.getView(view as GPUTextureView);
    if (asView) {
      this.#addTextureUse(
        pass,
        asView.texture,
        role,
        access,
        slot,
        view as GPUTextureView,
        details,
      );
      return;
    }
    // Newer WebGPU allows passing textures directly as attachments.
    if (typeof GPUTexture !== 'undefined' && view instanceof GPUTexture) {
      this.#addTextureUse(pass, view, role, access, slot, undefined, details);
    }
  }

  #addTextureUse(
    pass: PassRecord,
    texture: GPUTexture,
    role: ResourceRole,
    access: ResourceAccess,
    slot: string | undefined,
    view: GPUTextureView | undefined,
    details?: string,
  ): void {
    const use: ResourceUse = {
      resource: this.session.registry.summarizeTexture(texture),
      role,
      access,
      slot,
      details,
    };
    textureHandles.set(use, texture);
    const viewInfo = view ? this.session.registry.getView(view) : undefined;
    if (viewInfo) {
      viewHandles.set(use, viewInfo);
    }
    addUse(pass, use);
  }

  #addBufferUse(
    pass: PassRecord,
    buffer: GPUBuffer,
    role: ResourceRole,
    access: ResourceAccess,
    slot: string | undefined,
  ): void {
    addUse(pass, {
      resource: this.session.registry.summarizeBuffer(buffer),
      role,
      access,
      slot,
    });
  }
}

/** Live texture handles behind resource uses; kept out of the records so they stay serializable */
const textureHandles = new WeakMap<ResourceUse, GPUTexture>();
const viewHandles = new WeakMap<ResourceUse, ViewInfo>();
