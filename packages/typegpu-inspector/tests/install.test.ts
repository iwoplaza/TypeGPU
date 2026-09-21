import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getInstalledInspector,
  installWebGPUInspector,
  type WebGPUInspector,
} from '../src/index.ts';
import {
  FAKE_PASS_DURATION_NS,
  FakeGPUAdapter,
  FakeGPUCanvasContext,
  FakeGPUCommandEncoder,
  FakeGPUDevice,
  installFakeWebGPU,
  type CallLog,
} from './fakeWebGPU.ts';

/** Lets pending promise callbacks (timestamp readbacks) run */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('installWebGPUInspector', () => {
  let fake: ReturnType<typeof installFakeWebGPU>;
  let inspector: WebGPUInspector;

  beforeEach(() => {
    fake = installFakeWebGPU();
    inspector = installWebGPUInspector({ ui: false, snapshotIntervalMs: 0 });
  });

  afterEach(() => {
    inspector.uninstall();
    fake.restore();
  });

  function createDevice(): FakeGPUDevice {
    return new FakeGPUDevice(['timestamp-query']);
  }

  /** Encodes and submits a frame, then closes it via the animation frame boundary */
  function submitFrame(device: FakeGPUDevice, encode: (encoder: GPUCommandEncoder) => void) {
    const encoder = (device as unknown as GPUDevice).createCommandEncoder();
    encode(encoder);
    (device as unknown as GPUDevice).queue.submit([encoder.finish()]);
    fake.frames.flush();
  }

  function rawLog(encoder: GPUCommandEncoder): CallLog[] {
    // The proxy forwards property reads to the fake encoder underneath.
    return (encoder as unknown as FakeGPUCommandEncoder).log;
  }

  it('is a singleton and can be uninstalled', () => {
    expect(installWebGPUInspector()).toBe(inspector);
    expect(getInstalledInspector()).toBe(inspector);

    const patched = GPUDevice.prototype.createCommandEncoder;
    inspector.uninstall();
    expect(getInstalledInspector()).toBeUndefined();
    expect(GPUDevice.prototype.createCommandEncoder).not.toBe(patched);
    expect(GPUDevice.prototype.createCommandEncoder).toBe(
      FakeGPUDevice.prototype.createCommandEncoder,
    );

    // Re-install so that afterEach can uninstall again without failing.
    inspector = installWebGPUInspector({ ui: false });
  });

  it('requests the timestamp-query feature when the adapter supports it', async () => {
    const adapter = new FakeGPUAdapter(['timestamp-query']);
    const device = await (adapter as unknown as GPUAdapter).requestDevice({
      requiredFeatures: ['shader-f16'],
    });
    expect([...(adapter.lastDescriptor?.requiredFeatures ?? [])].toSorted()).toEqual([
      'shader-f16',
      'timestamp-query',
    ]);
    expect(device.features.has('timestamp-query')).toBe(true);

    const plainAdapter = new FakeGPUAdapter([]);
    await (plainAdapter as unknown as GPUAdapter).requestDevice();
    expect(plainAdapter.lastDescriptor?.requiredFeatures ?? []).toEqual([]);
  });

  it('makes render attachments and canvases copyable', () => {
    const device = createDevice() as unknown as GPUDevice;

    const attachment = device.createTexture({
      size: [8, 8],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    expect(attachment.usage & GPUTextureUsage.COPY_SRC).not.toBe(0);

    const sampled = device.createTexture({
      size: [8, 8],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    expect(sampled.usage & GPUTextureUsage.COPY_SRC).toBe(0);

    const context = new FakeGPUCanvasContext();
    (context as unknown as GPUCanvasContext).configure({ device, format: 'bgra8unorm' });
    expect((context.configuration?.usage ?? 0) & GPUTextureUsage.COPY_SRC).not.toBe(0);
    expect((context.configuration?.usage ?? 0) & GPUTextureUsage.RENDER_ATTACHMENT).not.toBe(0);
  });

  it('records passes, their resources and GPU timings into frames', async () => {
    const fakeDevice = createDevice();
    const device = fakeDevice as unknown as GPUDevice;
    const events: string[] = [];
    inspector.session.subscribe((event) => events.push(event));

    const target = device.createTexture({
      label: 'target',
      size: [16, 16],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const particles = device.createBuffer({
      label: 'particles',
      size: 256,
      usage: GPUBufferUsage.STORAGE,
    });
    const vertices = device.createBuffer({
      label: 'vertices',
      size: 256,
      usage: GPUBufferUsage.VERTEX,
    });
    const bindGroup = device.createBindGroup({
      label: 'sim',
      layout: {} as GPUBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: particles } }],
    });

    let encoderLog: CallLog[] = [];
    submitFrame(fakeDevice, (encoder) => {
      encoderLog = rawLog(encoder);

      const compute = encoder.beginComputePass({ label: 'simulate' });
      compute.setPipeline({ label: 'sim pipeline' } as GPUComputePipeline);
      compute.setBindGroup(0, bindGroup);
      compute.dispatchWorkgroups(4, 2);
      compute.end();

      const render = encoder.beginRenderPass({
        colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store' }],
      });
      render.setPipeline({ label: 'draw pipeline' } as GPURenderPipeline);
      render.setBindGroup(0, bindGroup);
      render.setVertexBuffer(0, vertices);
      render.draw(3, 2);
      render.end();
    });

    expect(events).toEqual(['frame']);
    const frame = inspector.session.latestFrame;
    expect(frame).toBeDefined();
    expect(frame?.passes.map((p) => [p.kind, p.label])).toEqual([
      ['compute', 'simulate'],
      ['render', 'draw pipeline'],
    ]);

    const [compute, render] = frame?.passes ?? [];
    expect(compute).toMatchObject({ dispatches: 1, workgroups: 8 });
    expect(compute?.writes.map((w) => w.resource.label)).toEqual(['particles']);
    expect(compute?.bindGroups).toEqual(['@group(0) sim']);

    expect(render).toMatchObject({ draws: 1, vertices: 6, instances: 2 });
    // Storage buffers are treated as potential writes, since the layout is not known.
    expect(render?.writes.map((w) => w.resource.label)).toEqual(['target', 'particles']);
    expect(render?.reads.map((r) => `${r.resource.label}:${r.role}`).toSorted()).toEqual([
      'particles:storage',
      'vertices:vertex',
    ]);
    expect(render?.attachments).toEqual(['color0: clear / store']);

    // Timestamp writes were injected into both passes...
    const passDescriptors = encoderLog
      .filter((c) => c.method === 'beginComputePass' || c.method === 'beginRenderPass')
      .map((c) => c.args[0] as GPUComputePassDescriptor);
    expect(passDescriptors.map((d) => d.timestampWrites?.beginningOfPassWriteIndex)).toEqual([
      0, 2,
    ]);
    expect(passDescriptors.map((d) => d.timestampWrites?.endOfPassWriteIndex)).toEqual([1, 3]);

    // ...and resolved before finishing the encoder.
    const methods = encoderLog.map((c) => c.method);
    expect(methods.indexOf('resolveQuerySet')).toBeGreaterThan(methods.lastIndexOf('end'));
    expect(methods.indexOf('copyBufferToBuffer')).toBeLessThan(methods.indexOf('finish'));

    expect(compute?.timing).toBe('pending');
    await settle();
    expect(compute?.timing).toBe('ready');
    expect(compute?.gpuTime).toBeCloseTo(Number(FAKE_PASS_DURATION_NS) / 1e6);
    expect(render?.gpuTime).toBeCloseTo(Number(FAKE_PASS_DURATION_NS) / 1e6);
    expect(events).toEqual(['frame', 'timing', 'timing']);
    expect(inspector.session.getTimingHistory(compute as never)).toHaveLength(1);
  });

  it('reads timestamp writes that the app set up itself', async () => {
    const fakeDevice = createDevice();
    const device = fakeDevice as unknown as GPUDevice;
    const querySet = device.createQuerySet({ type: 'timestamp', count: 2 });

    submitFrame(fakeDevice, (encoder) => {
      const pass = encoder.beginComputePass({
        label: 'own timing',
        timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 },
      });
      pass.end();
    });

    const pass = inspector.session.latestFrame?.passes[0];
    expect(pass?.ownTimestamps).toBe(true);
    await settle();
    expect(pass?.timing).toBe('ready');
    expect(pass?.gpuTime).toBeCloseTo(Number(FAKE_PASS_DURATION_NS) / 1e6);
  });

  it('leaves passes untimed on devices without timestamp-query', () => {
    const fakeDevice = new FakeGPUDevice([]);
    let encoderLog: CallLog[] = [];

    submitFrame(fakeDevice, (encoder) => {
      encoderLog = rawLog(encoder);
      encoder.beginComputePass().end();
    });

    const descriptor = encoderLog[0]?.args[0] as GPUComputePassDescriptor | undefined;
    expect(descriptor?.timestampWrites).toBeUndefined();
    expect(encoderLog.some((c) => c.method === 'resolveQuerySet')).toBe(false);
    expect(inspector.session.latestFrame?.passes[0]?.timing).toBe('unavailable');
  });

  it('records copy commands as nodes', () => {
    const fakeDevice = createDevice();
    const device = fakeDevice as unknown as GPUDevice;
    const src = device.createBuffer({ label: 'src', size: 64, usage: GPUBufferUsage.COPY_SRC });
    const dst = device.createBuffer({ label: 'dst', size: 64, usage: GPUBufferUsage.COPY_DST });

    submitFrame(fakeDevice, (encoder) => {
      encoder.copyBufferToBuffer(src, 0, dst, 0, 64);
    });

    const pass = inspector.session.latestFrame?.passes[0];
    expect(pass?.kind).toBe('copy');
    expect(pass?.reads.map((r) => r.resource.label)).toEqual(['src']);
    expect(pass?.writes.map((w) => w.resource.label)).toEqual(['dst']);
  });

  it('snapshots written textures only while the UI asks for them', () => {
    const fakeDevice = createDevice();
    const device = fakeDevice as unknown as GPUDevice;
    const target = device.createTexture({
      label: 'target',
      size: [32, 16],
      format: 'bgra8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depth = device.createTexture({
      label: 'depth',
      size: [32, 16],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const drawFrame = () => {
      let log: CallLog[] = [];
      submitFrame(fakeDevice, (encoder) => {
        log = rawLog(encoder);
        const pass = encoder.beginRenderPass({
          colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store' }],
          depthStencilAttachment: {
            view: depth.createView(),
            depthLoadOp: 'clear',
            depthStoreOp: 'discard',
            depthClearValue: 1,
          },
        });
        pass.end();
      });
      return log;
    };

    // Overlay closed: no copies are recorded.
    let log = drawFrame();
    expect(log.some((c) => c.method === 'copyTextureToTexture')).toBe(false);
    expect(inspector.session.latestFrame?.hasSnapshots).toBe(false);

    // Overlay open: the decision is made at the frame boundary, so the next
    // frame gets snapshotted.
    inspector.session.snapshotsEnabled = true;
    fake.frames.flush();
    log = drawFrame();

    const copies = log.filter((c) => c.method === 'copyTextureToTexture');
    // The depth attachment is discarded, so only the color target is copied.
    expect(copies).toHaveLength(1);
    const frame = inspector.session.latestFrame;
    expect(frame?.hasSnapshots).toBe(true);
    const snapshot = frame?.passes[0]?.snapshots[0];
    expect(snapshot).toMatchObject({
      role: 'color',
      format: 'bgra8unorm',
      width: 32,
      height: 16,
    });
    expect((snapshot?.texture.usage ?? 0) & GPUTextureUsage.TEXTURE_BINDING).not.toBe(0);
    // Snapshot textures are created with the un-patched API, so they stay out of the records.
    expect(frame?.passes[0]?.writes.map((w) => w.resource.label)).toEqual(['target', 'depth']);
  });

  it('snapshots multisampled attachments into render-attachment-capable textures', () => {
    const fakeDevice = createDevice();
    const device = fakeDevice as unknown as GPUDevice;
    const msaa = device.createTexture({
      label: 'msaa',
      size: [8, 8],
      format: 'rgba8unorm',
      sampleCount: 4,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const depth = device.createTexture({
      label: 'depth',
      size: [8, 8],
      format: 'depth24plus',
      sampleCount: 4,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    const resolved = device.createTexture({
      label: 'resolved',
      size: [8, 8],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    inspector.session.snapshotsEnabled = true;
    fake.frames.flush();
    submitFrame(fakeDevice, (encoder) => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: msaa.createView(),
            resolveTarget: resolved.createView(),
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: depth.createView(),
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
          depthClearValue: 1,
        },
      });
      pass.end();
    });

    const snapshots = inspector.session.latestFrame?.passes[0]?.snapshots ?? [];
    // The multisampled color target is skipped in favour of its resolved version.
    expect(snapshots.map((s) => `${s.role}:${s.source.label}:${s.sampleCount}`)).toEqual([
      'resolve:resolved:1',
      'depth-stencil:depth:4',
    ]);
    const depthSnapshot = snapshots[1];
    expect(depthSnapshot?.texture.sampleCount).toBe(4);
    expect((depthSnapshot?.texture.usage ?? 0) & GPUTextureUsage.RENDER_ATTACHMENT).not.toBe(0);
    expect((snapshots[0]?.texture.usage ?? 0) & GPUTextureUsage.RENDER_ATTACHMENT).toBe(0);
  });

  it('keeps the frozen frame while paused', () => {
    const fakeDevice = createDevice();

    submitFrame(fakeDevice, (encoder) => {
      encoder.beginComputePass({ label: 'first' }).end();
    });
    const first = inspector.session.latestFrame;

    inspector.session.paused = true;
    submitFrame(fakeDevice, (encoder) => {
      encoder.beginComputePass({ label: 'second' }).end();
    });
    expect(inspector.session.latestFrame).toBe(first);

    inspector.session.paused = false;
    submitFrame(fakeDevice, (encoder) => {
      encoder.beginComputePass({ label: 'third' }).end();
    });
    expect(inspector.session.latestFrame?.passes[0]?.label).toBe('third');
  });
});
