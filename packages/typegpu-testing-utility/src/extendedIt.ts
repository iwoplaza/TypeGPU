// oxlint-disable no-empty-pattern
import { test as base, vi } from 'vitest';
import { tgpu, type TgpuRoot } from 'typegpu';
// oxlint-disable-next-line import/no-unassigned-import -- imported for side effects
import './webgpuGlobals.ts';

const createTextureMock = (descriptor: GPUTextureDescriptor) => {
  const size =
    'width' in descriptor.size
      ? [descriptor.size.width, descriptor.size.height, descriptor.size.depthOrArrayLayers]
      : [...descriptor.size];

  return {
    ...descriptor,
    label: descriptor.label ?? '',
    width: size[0] ?? 1,
    height: size[1] ?? 1,
    depthOrArrayLayers: size[2] ?? 1,
    createView: vi.fn((viewDesc?: GPUTextureViewDescriptor) => ({ label: viewDesc?.label ?? '' })),
    destroy: vi.fn(),
  };
};

type ExperimentalTgpuRoot = TgpuRoot & TgpuRoot['~unstable'];

/**
 * A small subset of the WebGPU spec's buffer validation, so that tests catch invalid API usage.
 * Real implementations report most of these as asynchronous validation errors; the mock throws
 * right away instead.
 */
class MockValidationError extends Error {
  constructor(message: string) {
    super(`[typegpu-testing-utility mock] ${message}`);
    this.name = 'MockValidationError';
  }
}

interface MockBufferState {
  destroyed: boolean;
  /** The [start, end) byte range of the current mapping, if there is one */
  mappedRange: [number, number] | undefined;
}

/** Bookkeeping kept off the mock buffers, so that it doesn't show up in snapshots */
const mockBufferStates = new WeakMap<object, MockBufferState>();

function validateBufferDescriptor({ size, usage, mappedAtCreation, label }: GPUBufferDescriptor) {
  const name = `createBuffer(${label ?? ''})`;

  // https://gpuweb.github.io/gpuweb/#dom-gpudevice-createbuffer
  if (mappedAtCreation && size % 4 !== 0) {
    throw new MockValidationError(
      `${name}: mappedAtCreation requires size (${size}) to be a multiple of 4`,
    );
  }
  if (usage === 0) {
    throw new MockValidationError(`${name}: usage must not be 0`);
  }
  if (
    usage & GPUBufferUsage.MAP_READ &&
    usage & ~(GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST)
  ) {
    throw new MockValidationError(
      `${name}: MAP_READ can only be combined with COPY_DST (usage: ${usage})`,
    );
  }
  if (
    usage & GPUBufferUsage.MAP_WRITE &&
    usage & ~(GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC)
  ) {
    throw new MockValidationError(
      `${name}: MAP_WRITE can only be combined with COPY_SRC (usage: ${usage})`,
    );
  }
}

function validateWriteBuffer(
  buffer: GPUBuffer,
  bufferOffset: number,
  data: AllowSharedBufferSource,
  dataOffset = 0,
  size?: number,
) {
  const state = mockBufferStates.get(buffer);
  if (!state) {
    // Not created by the mock device, nothing to check against
    return;
  }

  const name = `writeBuffer(${buffer.label})`;
  // https://gpuweb.github.io/gpuweb/#dom-gpuqueue-writebuffer
  const bytesPerElement =
    ArrayBuffer.isView(data) && 'BYTES_PER_ELEMENT' in data
      ? (data.BYTES_PER_ELEMENT as number)
      : 1;
  const dataSize = data.byteLength / bytesPerElement;
  const contentsSize = size ?? dataSize - dataOffset;
  const contentsByteSize = contentsSize * bytesPerElement;

  if (contentsSize < 0 || dataOffset + contentsSize > dataSize) {
    throw new MockValidationError(
      `${name}: range [${dataOffset}, ${dataOffset + contentsSize}) is out of bounds of data with ${dataSize} elements`,
    );
  }
  if (contentsByteSize % 4 !== 0) {
    throw new MockValidationError(
      `${name}: written byte size (${contentsByteSize}) must be a multiple of 4`,
    );
  }
  if (state.destroyed) {
    throw new MockValidationError(`${name}: buffer is destroyed`);
  }
  if (buffer.mapState !== 'unmapped') {
    throw new MockValidationError(
      `${name}: buffer must be unmapped (mapState: ${buffer.mapState})`,
    );
  }
  if (!(buffer.usage & GPUBufferUsage.COPY_DST)) {
    throw new MockValidationError(`${name}: usage (${buffer.usage}) must include COPY_DST`);
  }
  if (bufferOffset % 4 !== 0) {
    throw new MockValidationError(
      `${name}: bufferOffset (${bufferOffset}) must be a multiple of 4`,
    );
  }
  if (bufferOffset + contentsByteSize > buffer.size) {
    throw new MockValidationError(
      `${name}: write of ${contentsByteSize} bytes at offset ${bufferOffset} exceeds buffer size (${buffer.size})`,
    );
  }
}

function createRenderPassEncoderMock() {
  const mockRenderPassEncoder = {
    get mock() {
      return mockRenderPassEncoder;
    },
    draw: vi.fn(),
    drawIndexed: vi.fn(),
    drawIndirect: vi.fn(),
    drawIndexedIndirect: vi.fn(),
    end: vi.fn(),
    setBindGroup: vi.fn(),
    setPipeline: vi.fn(),
    setScissorRect: vi.fn(),
    setVertexBuffer: vi.fn(),
    setViewport: vi.fn(),
    setIndexBuffer: vi.fn(),
    setStencilReference: vi.fn(),
    setImmediates: vi.fn(),
    executeBundles: vi.fn(),
  };

  return mockRenderPassEncoder as unknown as GPURenderPassEncoder & {
    mock: typeof mockRenderPassEncoder;
  };
}

export type MockRenderPassEncoder = ReturnType<typeof createRenderPassEncoderMock>;

function createComputePassEncoderMock() {
  const mockComputePassEncoder = {
    get mock() {
      return mockComputePassEncoder;
    },
    dispatchWorkgroups: vi.fn(),
    dispatchWorkgroupsIndirect: vi.fn(),
    end: vi.fn(),
    setBindGroup: vi.fn(),
    setPipeline: vi.fn(),
    setImmediates: vi.fn(),
  };

  return mockComputePassEncoder as unknown as GPUComputePassEncoder & {
    mock: typeof mockComputePassEncoder;
  };
}

export type MockComputePassEncoder = ReturnType<typeof createComputePassEncoderMock>;

function createCommandEncoderMock(
  renderPassEncoder: MockRenderPassEncoder,
  computePassEncoder: MockComputePassEncoder,
) {
  const mockCommandEncoder = {
    get mock() {
      return mockCommandEncoder;
    },
    beginComputePass: vi.fn(() => computePassEncoder),
    beginRenderPass: vi.fn(() => renderPassEncoder),
    clearBuffer: vi.fn(),
    copyBufferToBuffer: vi.fn(),
    copyBufferToTexture: vi.fn(),
    copyTextureToBuffer: vi.fn(),
    copyTextureToTexture: vi.fn(),
    resolveQuerySet: vi.fn(),
    finish: vi.fn(),
  };

  return mockCommandEncoder as unknown as GPUCommandEncoder & { mock: typeof mockCommandEncoder };
}

export type MockCommandEncoder = ReturnType<typeof createCommandEncoderMock>;

function createRenderBundleEncoderMock() {
  const mockRenderBundleEncoder = {
    get mock() {
      return mockRenderBundleEncoder;
    },
    draw: vi.fn(),
    drawIndexed: vi.fn(),
    setBindGroup: vi.fn(),
    setPipeline: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    setImmediates: vi.fn(),
    finish: vi.fn(() => 'mockRenderBundle'),
    label: '',
  };

  return mockRenderBundleEncoder as unknown as GPURenderBundleEncoder & {
    mock: typeof mockRenderBundleEncoder;
  };
}

export type MockRenderBundleEncoder = ReturnType<typeof createRenderBundleEncoderMock>;

function createDeviceMock(
  commandEncoder: MockCommandEncoder,
  renderBundleEncoder: MockRenderBundleEncoder,
) {
  const mockDevice = {
    get mock() {
      return mockDevice;
    },
    features: new Set(['timestamp-query']),
    createBindGroup: vi.fn(({ label }: GPUBindGroupDescriptor) => ({ label })),
    createBindGroupLayout: vi.fn(
      (_descriptor: GPUBindGroupLayoutDescriptor) => 'mockBindGroupLayout',
    ),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      validateBufferDescriptor(descriptor);

      const { size, usage, mappedAtCreation, label } = descriptor;
      const state: MockBufferState = {
        destroyed: false,
        mappedRange: mappedAtCreation ? [0, size] : undefined,
      };
      const name = label ?? '';

      const mockBuffer = {
        mapState: mappedAtCreation ? 'mapped' : 'unmapped',
        size,
        usage,
        label: name,
        // https://gpuweb.github.io/gpuweb/#dom-gpubuffer-getmappedrange
        getMappedRange: vi.fn((offset = 0, rangeSize?: number) => {
          if (!state.mappedRange) {
            throw new MockValidationError(`getMappedRange(${name}): buffer is not mapped`);
          }
          const end = offset + (rangeSize ?? Math.max(0, state.mappedRange[1] - offset));
          if (offset % 8 !== 0 || (end - offset) % 4 !== 0) {
            throw new MockValidationError(
              `getMappedRange(${name}): offset (${offset}) must be a multiple of 8 and size (${end - offset}) a multiple of 4`,
            );
          }
          if (offset < state.mappedRange[0] || end > state.mappedRange[1]) {
            throw new MockValidationError(
              `getMappedRange(${name}): range [${offset}, ${end}) is outside the mapped range [${state.mappedRange[0]}, ${state.mappedRange[1]})`,
            );
          }
          return new ArrayBuffer(size);
        }),
        unmap: vi.fn(() => {
          state.mappedRange = undefined;
          mockBuffer.mapState = 'unmapped';
        }),
        // https://gpuweb.github.io/gpuweb/#dom-gpubuffer-mapasync
        mapAsync: vi.fn((mode: GPUMapModeFlags, offset = 0, rangeSize?: number) => {
          const end = offset + (rangeSize ?? Math.max(0, size - offset));
          if (mockBuffer.mapState !== 'unmapped') {
            throw new MockValidationError(
              `mapAsync(${name}): buffer must be unmapped (mapState: ${mockBuffer.mapState})`,
            );
          }
          if (state.destroyed) {
            throw new MockValidationError(`mapAsync(${name}): buffer is destroyed`);
          }
          if (mode !== GPUMapMode.READ && mode !== GPUMapMode.WRITE) {
            throw new MockValidationError(
              `mapAsync(${name}): mode (${mode}) must be exactly one of READ or WRITE`,
            );
          }
          if (mode === GPUMapMode.READ && !(usage & GPUBufferUsage.MAP_READ)) {
            throw new MockValidationError(
              `mapAsync(${name}): READ requires MAP_READ usage (usage: ${usage})`,
            );
          }
          if (mode === GPUMapMode.WRITE && !(usage & GPUBufferUsage.MAP_WRITE)) {
            throw new MockValidationError(
              `mapAsync(${name}): WRITE requires MAP_WRITE usage (usage: ${usage})`,
            );
          }
          if (offset % 8 !== 0 || (end - offset) % 4 !== 0 || end > size) {
            throw new MockValidationError(
              `mapAsync(${name}): invalid range [${offset}, ${end}) for a buffer of size ${size}`,
            );
          }
          state.mappedRange = [offset, end];
          mockBuffer.mapState = 'mapped';
        }),
        // https://gpuweb.github.io/gpuweb/#dom-gpubuffer-destroy
        destroy: vi.fn(() => {
          state.destroyed = true;
          state.mappedRange = undefined;
          mockBuffer.mapState = 'unmapped';
        }),
      };

      mockBufferStates.set(mockBuffer, state);
      return mockBuffer;
    }),
    createCommandEncoder: vi.fn(function () {
      return commandEncoder;
    }),
    createComputePipeline: vi.fn((descriptor: GPUComputePipelineDescriptor) => ({
      label: descriptor.label ?? '',
      getBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
    })),
    createComputePipelineAsync: vi.fn(async (descriptor: GPUComputePipelineDescriptor) => ({
      label: descriptor.label ?? '',
      getBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
    })),
    createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
    createQuerySet: vi.fn(
      ({ type, count, label }: GPUQuerySetDescriptor): GPUQuerySet => ({
        __brand: 'GPUQuerySet',
        destroy: vi.fn(),
        type,
        count: count,
        label: label ?? '',
      }),
    ),
    createRenderBundleEncoder: vi.fn(() => renderBundleEncoder),
    createRenderPipeline: vi.fn(() => 'mockRenderPipeline'),
    createRenderPipelineAsync: vi.fn(async () => 'mockRenderPipeline'),
    createSampler: vi.fn(() => 'mockSampler'),
    createShaderModule: vi.fn(() => 'mockShaderModule'),
    createTexture: vi.fn((descriptor) => createTextureMock(descriptor)),
    importExternalTexture: vi.fn(() => 'mockExternalTexture'),
    queue: {
      copyExternalImageToTexture: vi.fn(),
      onSubmittedWorkDone: vi.fn(() => Promise.resolve()),
      submit: vi.fn(),
      writeBuffer: vi.fn(validateWriteBuffer),
      writeTexture: vi.fn(),
    },
    limits: {
      maxUniformBuffersPerShaderStage: 12,
      maxStorageBuffersPerShaderStage: 8,
      maxComputeWorkgroupStorageSize: 16384,
    },
    destroy: vi.fn(),
  };

  return mockDevice as unknown as GPUDevice & { mock: typeof mockDevice };
}

export type MockDevice = ReturnType<typeof createDeviceMock>;

export const it = base
  .extend('renderPassEncoder', createRenderPassEncoderMock)
  .extend('computePassEncoder', createComputePassEncoderMock)
  .extend('commandEncoder', ({ renderPassEncoder, computePassEncoder }) =>
    createCommandEncoderMock(renderPassEncoder, computePassEncoder),
  )
  .extend('renderBundleEncoder', createRenderBundleEncoderMock)
  .extend('device', ({ commandEncoder, renderBundleEncoder }) =>
    createDeviceMock(commandEncoder, renderBundleEncoder),
  )
  .extend('_stallDeviceRequest', ({ device }) => {
    let stallResolve: () => void;
    let stallPromise: Promise<void> | undefined;
    let devicePromise: Promise<GPUDevice> | undefined;

    const result = {
      enabled: false,
      get stallPromise() {
        return (stallPromise ??= new Promise<void>((r) => {
          stallResolve = r;
        }));
      },
      get devicePromise(): Promise<GPUDevice> {
        return (devicePromise ??= this.stallPromise.then(() => device));
      },
      get stallResolve() {
        void this.stallPromise; // ensuring the promise is initialized
        return stallResolve;
      },
    };

    return result;
  })
  .extend('adapter', ({ device, _stallDeviceRequest }) => {
    const adapterMock = {
      features: new Set(['timestamp-query']),
      requestDevice: vi.fn((_descriptor) => {
        if (_stallDeviceRequest.enabled) {
          return _stallDeviceRequest.devicePromise;
        }

        return Promise.resolve(device);
      }),
      limits: {
        maxStorageBufferBindingSize: 64 * 1024 * 1024,
        maxBufferSize: 64 * 1024 * 1024,
      },
    };

    return adapterMock;
  })
  .extend('navigator', ({ adapter }) => {
    const navigatorMock = {
      gpu: {
        __brand: 'GPU',
        requestAdapter: vi.fn(() => Promise.resolve(adapter)),
        getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
        wgslLanguageFeatures: new Set(['immediate_address_space']),
      },
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve()),
      },
    };

    return navigatorMock;
  })
  .extend('_global', { auto: true }, ({ navigator }, { onCleanup }) => {
    vi.stubGlobal('navigator', navigator);

    onCleanup(() => {
      vi.unstubAllGlobals();
    });
  })
  .extend('disableWebGPU', ({ navigator }, { onCleanup }) => {
    const originalGpu = navigator.gpu;

    onCleanup(() => {
      // oxlint-disable-next-line typescript/no-explicit-any
      (navigator as any).gpu = originalGpu;
    });

    return () => {
      // oxlint-disable-next-line typescript/no-explicit-any
      (navigator as any).gpu = undefined;
    };
  })
  /**
   * Used to introduce an artificial delay between requesting a device and getting it.
   * @example
   * ```ts
   * it('foo', async ({ stallDeviceRequest }) => {
   *   const resume = stallDeviceRequest();
   *
   *   // do something asynchronous that requests a device
   *
   *   const device = await resume(); // causes the device to resolve
   * });
   * ```
   */
  .extend('stallDeviceRequest', ({ _stallDeviceRequest }) => {
    return () => {
      if (_stallDeviceRequest.enabled) {
        throw new Error('Cannot stall .requestDevice() more than once at a time');
      }
      _stallDeviceRequest.enabled = true;

      return async () => {
        _stallDeviceRequest.stallResolve();
        _stallDeviceRequest.enabled = false;
        return await _stallDeviceRequest.devicePromise;
      };
    };
  })
  .extend('root', async ({}, { onCleanup }) => {
    const root = await tgpu.init();

    onCleanup(() => root.destroy());

    return root as ExperimentalTgpuRoot;
  });

export const test = it;
