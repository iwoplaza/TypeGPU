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
    finish: vi.fn(
      (descriptor?: GPUCommandBufferDescriptor) =>
        ({ __brand: 'GPUCommandBuffer', label: descriptor?.label ?? '' }) as GPUCommandBuffer,
    ),
  };

  return mockCommandEncoder as unknown as GPUCommandEncoder & { mock: typeof mockCommandEncoder };
}

/**
 * Creates another command encoder that shares spies with `commandEncoder`, so assertions
 * on the fixture cover every encoder, while `mock.contexts` and identity tell them apart.
 */
function forkCommandEncoderMock(commandEncoder: MockCommandEncoder): MockCommandEncoder {
  const fork: MockCommandEncoder['mock'] = {
    ...commandEncoder.mock,
    get mock() {
      return fork;
    },
  };

  return fork as unknown as MockCommandEncoder;
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
  let handedOutFixtureEncoder = false;

  const mockDevice = {
    get mock() {
      return mockDevice;
    },
    features: new Set(['timestamp-query']),
    createBindGroup: vi.fn(({ label }: GPUBindGroupDescriptor) => ({ label })),
    createBindGroupLayout: vi.fn(
      (_descriptor: GPUBindGroupLayoutDescriptor) => 'mockBindGroupLayout',
    ),
    createBuffer: vi.fn(({ size, usage, mappedAtCreation, label }: GPUBufferDescriptor) => {
      const mockBuffer = {
        mapState: mappedAtCreation ? 'mapped' : 'unmapped',
        size,
        usage,
        label: label ?? '',
        getMappedRange: vi.fn(() => new ArrayBuffer(size)),
        unmap: vi.fn(() => {
          mockBuffer.mapState = 'unmapped';
        }),
        mapAsync: vi.fn(() => {
          mockBuffer.mapState = 'mapped';
        }),
        destroy: vi.fn(),
      };

      return mockBuffer;
    }),
    createCommandEncoder: vi.fn(function () {
      if (!handedOutFixtureEncoder) {
        handedOutFixtureEncoder = true;
        return commandEncoder;
      }
      return forkCommandEncoderMock(commandEncoder);
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
      writeBuffer: vi.fn(),
      writeTexture: vi.fn(),
    },
    // Defaults from https://gpuweb.github.io/gpuweb/#limits
    limits: {
      maxTextureDimension1D: 8192,
      maxTextureDimension2D: 8192,
      maxTextureDimension3D: 2048,
      maxTextureArrayLayers: 256,
      maxBindGroups: 4,
      maxBindGroupsPlusVertexBuffers: 24,
      maxImmediateSize: 64,
      maxBindingsPerBindGroup: 1000,
      maxDynamicUniformBuffersPerPipelineLayout: 8,
      maxDynamicStorageBuffersPerPipelineLayout: 4,
      maxSampledTexturesPerShaderStage: 16,
      maxSamplersPerShaderStage: 16,
      maxStorageBuffersPerShaderStage: 8,
      maxStorageBuffersInVertexStage: 8,
      maxStorageBuffersInFragmentStage: 8,
      maxStorageTexturesPerShaderStage: 4,
      maxStorageTexturesInVertexStage: 4,
      maxStorageTexturesInFragmentStage: 4,
      maxUniformBuffersPerShaderStage: 12,
      maxUniformBufferBindingSize: 65536,
      maxStorageBufferBindingSize: 128 * 1024 * 1024,
      minUniformBufferOffsetAlignment: 256,
      minStorageBufferOffsetAlignment: 256,
      maxVertexBuffers: 8,
      maxBufferSize: 256 * 1024 * 1024,
      maxVertexAttributes: 16,
      maxVertexBufferArrayStride: 2048,
      maxInterStageShaderVariables: 16,
      maxColorAttachments: 8,
      maxColorAttachmentBytesPerSample: 32,
      maxComputeWorkgroupStorageSize: 16384,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupSizeX: 256,
      maxComputeWorkgroupSizeY: 256,
      maxComputeWorkgroupSizeZ: 64,
      maxComputeWorkgroupsPerDimension: 65535,
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
