/**
 * A minimal, in-memory stand-in for the parts of the WebGPU API that the
 * inspector touches. Methods live on prototypes, as the inspector patches
 * those. Timestamp queries are simulated so that timing readback can be
 * tested end to end.
 */

export interface CallLog {
  readonly method: string;
  readonly args: readonly unknown[];
}

const constants = {
  GPUBufferUsage: {
    MAP_READ: 1,
    MAP_WRITE: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    INDEX: 16,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
    INDIRECT: 256,
    QUERY_RESOLVE: 512,
  },
  GPUMapMode: { READ: 1, WRITE: 2 },
  GPUTextureUsage: {
    COPY_SRC: 1,
    COPY_DST: 2,
    TEXTURE_BINDING: 4,
    STORAGE_BINDING: 8,
    RENDER_ATTACHMENT: 16,
  },
  GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
};

export class FakeGPUBuffer {
  label: string;
  readonly size: number;
  readonly usage: number;
  readonly data: ArrayBuffer;
  mapState: 'unmapped' | 'pending' | 'mapped' = 'unmapped';

  constructor(descriptor: GPUBufferDescriptor) {
    this.label = descriptor.label ?? '';
    this.size = descriptor.size;
    this.usage = descriptor.usage;
    this.data = new ArrayBuffer(descriptor.size);
  }

  mapAsync(): Promise<void> {
    this.mapState = 'mapped';
    return Promise.resolve();
  }

  getMappedRange(): ArrayBuffer {
    return this.data;
  }

  unmap(): void {
    this.mapState = 'unmapped';
  }

  destroy(): void {}
}

export class FakeGPUTextureView {
  readonly label = '';
}

export class FakeGPUTexture {
  label: string;
  readonly format: GPUTextureFormat;
  readonly width: number;
  readonly height: number;
  readonly depthOrArrayLayers: number;
  readonly mipLevelCount: number;
  readonly sampleCount: number;
  readonly dimension: GPUTextureDimension;
  readonly usage: number;

  constructor(descriptor: GPUTextureDescriptor) {
    this.label = descriptor.label ?? '';
    this.format = descriptor.format;
    const size = Array.isArray(descriptor.size)
      ? descriptor.size
      : [
          descriptor.size.width,
          descriptor.size.height ?? 1,
          descriptor.size.depthOrArrayLayers ?? 1,
        ];
    this.width = size[0] ?? 1;
    this.height = size[1] ?? 1;
    this.depthOrArrayLayers = size[2] ?? 1;
    this.mipLevelCount = descriptor.mipLevelCount ?? 1;
    this.sampleCount = descriptor.sampleCount ?? 1;
    this.dimension = descriptor.dimension ?? '2d';
    this.usage = descriptor.usage;
  }

  createView(): FakeGPUTextureView {
    return new FakeGPUTextureView();
  }

  destroy(): void {}
}

export class FakeGPUQuerySet {
  readonly type: GPUQueryType;
  readonly count: number;
  readonly values: bigint[];

  constructor(descriptor: GPUQuerySetDescriptor) {
    this.type = descriptor.type;
    this.count = descriptor.count;
    this.values = Array.from({ length: descriptor.count }, () => 0n);
  }

  destroy(): void {}
}

export class FakeGPUBindGroup {
  label: string;
  constructor(descriptor: GPUBindGroupDescriptor) {
    this.label = descriptor.label ?? '';
  }
}

export class FakeGPURenderPipeline {
  label: string;
  constructor(label = '') {
    this.label = label;
  }
}

export class FakeGPUComputePipeline {
  label: string;
  constructor(label = '') {
    this.label = label;
  }
}

export class FakeGPUCommandBuffer {
  readonly label = '';
}

/** Simulated GPU clock: every pass takes this many nanoseconds */
export const FAKE_PASS_DURATION_NS = 2_500_000n;
let clock = 1_000_000n;

class FakePassEncoder {
  readonly log: CallLog[];
  constructor(log: CallLog[]) {
    this.log = log;
  }

  setPipeline(...args: unknown[]): void {
    this.log.push({ method: 'setPipeline', args });
  }

  setBindGroup(...args: unknown[]): void {
    this.log.push({ method: 'setBindGroup', args });
  }

  end(): void {
    this.log.push({ method: 'end', args: [] });
  }
}

export class FakeGPURenderPassEncoder extends FakePassEncoder {
  setVertexBuffer(...args: unknown[]): void {
    this.log.push({ method: 'setVertexBuffer', args });
  }

  setIndexBuffer(...args: unknown[]): void {
    this.log.push({ method: 'setIndexBuffer', args });
  }

  draw(...args: unknown[]): void {
    this.log.push({ method: 'draw', args });
  }

  drawIndexed(...args: unknown[]): void {
    this.log.push({ method: 'drawIndexed', args });
  }

  drawIndirect(...args: unknown[]): void {
    this.log.push({ method: 'drawIndirect', args });
  }

  drawIndexedIndirect(...args: unknown[]): void {
    this.log.push({ method: 'drawIndexedIndirect', args });
  }

  executeBundles(...args: unknown[]): void {
    this.log.push({ method: 'executeBundles', args });
  }
}

export class FakeGPUComputePassEncoder extends FakePassEncoder {
  dispatchWorkgroups(...args: unknown[]): void {
    this.log.push({ method: 'dispatchWorkgroups', args });
  }

  dispatchWorkgroupsIndirect(...args: unknown[]): void {
    this.log.push({ method: 'dispatchWorkgroupsIndirect', args });
  }
}

function simulateTimestamps(writes: GPUComputePassTimestampWrites | undefined): void {
  if (!writes) {
    return;
  }
  const querySet = writes.querySet as unknown as FakeGPUQuerySet;
  if (writes.beginningOfPassWriteIndex !== undefined) {
    querySet.values[writes.beginningOfPassWriteIndex] = clock;
  }
  clock += FAKE_PASS_DURATION_NS;
  if (writes.endOfPassWriteIndex !== undefined) {
    querySet.values[writes.endOfPassWriteIndex] = clock;
  }
}

export class FakeGPUCommandEncoder {
  label: string;
  readonly log: CallLog[] = [];

  constructor(descriptor?: GPUCommandEncoderDescriptor) {
    this.label = descriptor?.label ?? '';
  }

  beginRenderPass(descriptor: GPURenderPassDescriptor): FakeGPURenderPassEncoder {
    this.log.push({ method: 'beginRenderPass', args: [descriptor] });
    simulateTimestamps(descriptor.timestampWrites);
    return new FakeGPURenderPassEncoder(this.log);
  }

  beginComputePass(descriptor?: GPUComputePassDescriptor): FakeGPUComputePassEncoder {
    this.log.push({ method: 'beginComputePass', args: [descriptor] });
    simulateTimestamps(descriptor?.timestampWrites);
    return new FakeGPUComputePassEncoder(this.log);
  }

  copyBufferToBuffer(
    source: FakeGPUBuffer,
    sourceOffset: number,
    destination: FakeGPUBuffer,
    destinationOffset: number,
    size: number,
  ): void {
    this.log.push({
      method: 'copyBufferToBuffer',
      args: [source, sourceOffset, destination, destinationOffset, size],
    });
    new Uint8Array(destination.data, destinationOffset, size).set(
      new Uint8Array(source.data, sourceOffset, size),
    );
  }

  copyBufferToTexture(...args: unknown[]): void {
    this.log.push({ method: 'copyBufferToTexture', args });
  }

  copyTextureToBuffer(...args: unknown[]): void {
    this.log.push({ method: 'copyTextureToBuffer', args });
  }

  copyTextureToTexture(...args: unknown[]): void {
    this.log.push({ method: 'copyTextureToTexture', args });
  }

  clearBuffer(...args: unknown[]): void {
    this.log.push({ method: 'clearBuffer', args });
  }

  resolveQuerySet(
    querySet: FakeGPUQuerySet,
    firstQuery: number,
    queryCount: number,
    destination: FakeGPUBuffer,
    destinationOffset: number,
  ): void {
    this.log.push({
      method: 'resolveQuerySet',
      args: [querySet, firstQuery, queryCount, destination, destinationOffset],
    });
    const view = new BigInt64Array(destination.data, destinationOffset, queryCount);
    for (let i = 0; i < queryCount; i++) {
      view[i] = querySet.values[firstQuery + i] ?? 0n;
    }
  }

  finish(): FakeGPUCommandBuffer {
    this.log.push({ method: 'finish', args: [] });
    return new FakeGPUCommandBuffer();
  }
}

export class FakeGPUQueue {
  readonly submitted: FakeGPUCommandBuffer[][] = [];

  submit(commandBuffers: Iterable<FakeGPUCommandBuffer>): void {
    this.submitted.push([...commandBuffers]);
  }

  writeBuffer(): void {}
}

export class FakeGPUDevice {
  readonly features: Set<string>;
  readonly queue = new FakeGPUQueue();
  readonly lost = new Promise<never>(() => {});
  readonly createdTextures: FakeGPUTexture[] = [];

  constructor(features: Iterable<string> = []) {
    this.features = new Set(features);
  }

  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): FakeGPUCommandEncoder {
    return new FakeGPUCommandEncoder(descriptor);
  }

  createTexture(descriptor: GPUTextureDescriptor): FakeGPUTexture {
    const texture = new FakeGPUTexture(descriptor);
    this.createdTextures.push(texture);
    return texture;
  }

  createBuffer(descriptor: GPUBufferDescriptor): FakeGPUBuffer {
    return new FakeGPUBuffer(descriptor);
  }

  createBindGroup(descriptor: GPUBindGroupDescriptor): FakeGPUBindGroup {
    return new FakeGPUBindGroup(descriptor);
  }

  createQuerySet(descriptor: GPUQuerySetDescriptor): FakeGPUQuerySet {
    return new FakeGPUQuerySet(descriptor);
  }
}

export class FakeGPUAdapter {
  readonly features: Set<string>;
  lastDescriptor: GPUDeviceDescriptor | undefined;

  constructor(features: Iterable<string> = ['timestamp-query']) {
    this.features = new Set(features);
  }

  requestDevice(descriptor?: GPUDeviceDescriptor): Promise<FakeGPUDevice> {
    this.lastDescriptor = descriptor;
    return Promise.resolve(new FakeGPUDevice(descriptor?.requiredFeatures ?? []));
  }
}

export class FakeGPUCanvasContext {
  configuration: GPUCanvasConfiguration | undefined;
  #current: FakeGPUTexture | undefined;

  configure(configuration: GPUCanvasConfiguration): void {
    this.configuration = configuration;
  }

  getCurrentTexture(): FakeGPUTexture {
    this.#current ??= new FakeGPUTexture({
      size: [640, 480],
      format: this.configuration?.format ?? 'bgra8unorm',
      usage: this.configuration?.usage ?? constants.GPUTextureUsage.RENDER_ATTACHMENT,
    });
    return this.#current;
  }
}

export interface FakeAnimationFrames {
  /** Runs all callbacks registered with requestAnimationFrame */
  flush(): void;
}

/**
 * Installs the fake WebGPU API (and a controllable requestAnimationFrame)
 * onto globalThis. Returns a function that removes them again.
 */
export function installFakeWebGPU(): { frames: FakeAnimationFrames; restore: () => void } {
  const globals: Record<string, unknown> = {
    ...constants,
    GPUAdapter: FakeGPUAdapter,
    GPUDevice: FakeGPUDevice,
    GPUQueue: FakeGPUQueue,
    GPUTexture: FakeGPUTexture,
    GPUTextureView: FakeGPUTextureView,
    GPUBuffer: FakeGPUBuffer,
    GPUCanvasContext: FakeGPUCanvasContext,
    GPUCommandEncoder: FakeGPUCommandEncoder,
  };

  let callbacks: FrameRequestCallback[] = [];
  let nextHandle = 1;
  globals.requestAnimationFrame = (callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return nextHandle++;
  };
  globals.cancelAnimationFrame = () => {
    callbacks = [];
  };

  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }

  return {
    frames: {
      flush() {
        const pending = callbacks;
        callbacks = [];
        for (const callback of pending) {
          callback(performance.now());
        }
      },
    },
    restore() {
      for (const [name, descriptor] of previous) {
        if (descriptor) {
          Object.defineProperty(globalThis, name, descriptor);
        } else {
          delete (globalThis as Record<string, unknown>)[name];
        }
      }
    },
  };
}
