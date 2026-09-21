import { EncoderRecord } from './encoder.ts';
import { captureNativeApi, isWebGPUAvailable, type NativeApi } from './native.ts';
import { createCommandEncoderProxy } from './proxies.ts';
import { InspectorSession } from './session.ts';
import { createOverlay, type InspectorOverlay } from './ui/overlay.ts';

export interface InspectorOptions {
  /**
   * Whether to mount the overlay UI (the floating button and the pass graph).
   * When false, only the capturing side is installed and the data can be read
   * from `inspector.session`.
   * @default true
   */
  readonly ui?: boolean | undefined;
  /**
   * Whether to open the overlay right away.
   * @default false
   */
  readonly open?: boolean | undefined;
  /**
   * Minimum time between two frames whose textures get snapshotted while the
   * overlay is open, in milliseconds. Snapshots cost a texture copy per
   * attachment, so this keeps the inspected app responsive.
   * @default 500
   */
  readonly snapshotIntervalMs?: number | undefined;
  /**
   * How many timing samples to keep per pass, for averaging.
   * @default 60
   */
  readonly historyLength?: number | undefined;
  /**
   * Whether to add the `timestamp-query` feature to every device requested
   * after installation (if the adapter supports it), so that passes can be timed.
   * @default true
   */
  readonly requestTimestampQuery?: boolean | undefined;
}

export interface WebGPUInspector {
  /** The captured data: frames, passes and their timings */
  readonly session: InspectorSession;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Restores the patched WebGPU APIs and removes the UI */
  uninstall(): void;
}

const GLOBAL_KEY = Symbol.for('@typegpu/inspector');

type GlobalWithInspector = typeof globalThis & { [GLOBAL_KEY]?: WebGPUInspector };

/** Returns the inspector installed on this page, if any */
export function getInstalledInspector(): WebGPUInspector | undefined {
  return (globalThis as GlobalWithInspector)[GLOBAL_KEY];
}

interface Patches {
  readonly restore: () => void;
}

function applyPatches(
  session: InspectorSession,
  native: NativeApi,
  requestTimestamps: boolean,
): Patches {
  const TRANSIENT =
    (GPUTextureUsage as { TRANSIENT_ATTACHMENT?: number }).TRANSIENT_ATTACHMENT ?? 0;

  GPUAdapter.prototype.requestDevice = function requestDevice(
    this: GPUAdapter,
    descriptor?: GPUDeviceDescriptor,
  ) {
    let patched = descriptor;
    if (requestTimestamps && this.features.has('timestamp-query')) {
      const features = new Set<GPUFeatureName>(descriptor?.requiredFeatures ?? []);
      features.add('timestamp-query');
      patched = { ...descriptor, requiredFeatures: [...features] };
    }
    return native.requestDevice.call(this, patched);
  };

  GPUDevice.prototype.createCommandEncoder = function createCommandEncoder(
    this: GPUDevice,
    descriptor?: GPUCommandEncoderDescriptor,
  ) {
    const raw = native.createCommandEncoder.call(this, descriptor);
    return createCommandEncoderProxy(raw, new EncoderRecord(session, this, raw));
  };

  GPUDevice.prototype.createTexture = function createTexture(
    this: GPUDevice,
    descriptor: GPUTextureDescriptor,
  ) {
    const { usage } = descriptor;
    const isOutput =
      (usage & (GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.STORAGE_BINDING)) !== 0;
    const isTransient = TRANSIENT !== 0 && (usage & TRANSIENT) !== 0;
    const patched =
      isOutput && !isTransient && (usage & GPUTextureUsage.COPY_SRC) === 0
        ? { ...descriptor, usage: usage | GPUTextureUsage.COPY_SRC }
        : descriptor;
    return native.createTexture.call(this, patched);
  };

  GPUDevice.prototype.createBindGroup = function createBindGroup(
    this: GPUDevice,
    descriptor: GPUBindGroupDescriptor,
  ) {
    const patched = { ...descriptor, entries: Array.from(descriptor.entries) };
    const bindGroup = native.createBindGroup.call(this, patched);
    session.registry.registerBindGroup(bindGroup, patched);
    return bindGroup;
  };

  GPUTexture.prototype.createView = function createView(
    this: GPUTexture,
    descriptor?: GPUTextureViewDescriptor,
  ) {
    const view = native.createView.call(this, descriptor);
    session.registry.registerView(view, this, descriptor);
    return view;
  };

  GPUCanvasContext.prototype.configure = function configure(
    this: GPUCanvasContext,
    configuration: GPUCanvasConfiguration,
  ) {
    const usage = configuration.usage ?? GPUTextureUsage.RENDER_ATTACHMENT;
    return native.configure.call(this, {
      ...configuration,
      usage: usage | GPUTextureUsage.COPY_SRC,
    });
  };

  GPUCanvasContext.prototype.getCurrentTexture = function getCurrentTexture(
    this: GPUCanvasContext,
  ) {
    const texture = native.getCurrentTexture.call(this);
    session.registry.markCanvasTexture(texture);
    return texture;
  };

  GPUQueue.prototype.submit = function submit(
    this: GPUQueue,
    commandBuffers: Iterable<GPUCommandBuffer>,
  ) {
    const list = Array.from(commandBuffers);
    native.submit.call(this, list);
    session.onSubmit(list);
  };

  return {
    restore: () => {
      GPUAdapter.prototype.requestDevice = native.requestDevice;
      GPUDevice.prototype.createCommandEncoder = native.createCommandEncoder;
      GPUDevice.prototype.createTexture = native.createTexture;
      GPUDevice.prototype.createBindGroup = native.createBindGroup;
      GPUTexture.prototype.createView = native.createView;
      GPUCanvasContext.prototype.configure = native.configure;
      GPUCanvasContext.prototype.getCurrentTexture = native.getCurrentTexture;
      GPUQueue.prototype.submit = native.submit;
    },
  };
}

/**
 * Installs the inspector into the current page. All WebGPU devices created
 * afterwards get their command encoders observed, so that render and compute
 * passes can be shown as a graph with intermediate results and GPU timings.
 *
 * Calling this more than once returns the already installed inspector.
 *
 * @example
 * ```ts
 * import { installWebGPUInspector } from '@typegpu/inspector';
 *
 * if (new URLSearchParams(location.search).has('inspect')) {
 *   installWebGPUInspector();
 * }
 * ```
 */
export function installWebGPUInspector(options: InspectorOptions = {}): WebGPUInspector {
  const existing = getInstalledInspector();
  if (existing) {
    return existing;
  }

  if (!isWebGPUAvailable()) {
    console.warn('[webgpu-inspector] WebGPU is not available in this environment, not installing.');
    return createNoopInspector();
  }

  const native = captureNativeApi();
  const session = new InspectorSession(native, {
    snapshotIntervalMs: options.snapshotIntervalMs ?? 500,
    historyLength: options.historyLength ?? 60,
  });
  const patches = applyPatches(session, native, options.requestTimestampQuery ?? true);
  session.start();

  let overlay: InspectorOverlay | undefined;
  if (options.ui !== false && typeof document !== 'undefined') {
    overlay = createOverlay(session);
    if (options.open) {
      overlay.open();
    }
  }

  const inspector: WebGPUInspector = {
    session,
    get isOpen() {
      return overlay?.isOpen ?? false;
    },
    open: () => overlay?.open(),
    close: () => overlay?.close(),
    toggle: () => overlay?.toggle(),
    uninstall: () => {
      patches.restore();
      session.stop();
      overlay?.destroy();
      delete (globalThis as GlobalWithInspector)[GLOBAL_KEY];
    },
  };

  (globalThis as GlobalWithInspector)[GLOBAL_KEY] = inspector;
  return inspector;
}

/**
 * Installs the inspector only if the page URL carries the given query
 * parameter (e.g. `?inspect`). Returns the inspector, or undefined if it was
 * not requested.
 */
export function installWebGPUInspectorFromUrl(
  param = 'inspect',
  options?: InspectorOptions,
): WebGPUInspector | undefined {
  if (typeof location === 'undefined') {
    return undefined;
  }
  if (!new URLSearchParams(location.search).has(param)) {
    return getInstalledInspector();
  }
  return installWebGPUInspector(options);
}

function createNoopInspector(): WebGPUInspector {
  const session = new InspectorSession(
    {
      requestDevice: () => Promise.reject(new Error('WebGPU unavailable')),
      createCommandEncoder: () => {
        throw new Error('WebGPU unavailable');
      },
      createTexture: () => {
        throw new Error('WebGPU unavailable');
      },
      createBuffer: () => {
        throw new Error('WebGPU unavailable');
      },
      createBindGroup: () => {
        throw new Error('WebGPU unavailable');
      },
      createView: () => {
        throw new Error('WebGPU unavailable');
      },
      configure: () => {},
      getCurrentTexture: () => {
        throw new Error('WebGPU unavailable');
      },
      submit: () => {},
    },
    { snapshotIntervalMs: 500, historyLength: 0 },
  );
  return {
    session,
    isOpen: false,
    open: () => {},
    close: () => {},
    toggle: () => {},
    uninstall: () => {},
  };
}
