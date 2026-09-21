// oxlint-disable typescript/unbound-method -- capturing the prototype methods is the whole point, they are always invoked with an explicit `this`
/**
 * The original (un-patched) WebGPU methods, captured at install time.
 * The inspector uses these for its own GPU work so that it never
 * records itself.
 */
export interface NativeApi {
  readonly requestDevice: GPUAdapter['requestDevice'];
  readonly createCommandEncoder: GPUDevice['createCommandEncoder'];
  readonly createTexture: GPUDevice['createTexture'];
  readonly createBuffer: GPUDevice['createBuffer'];
  readonly createBindGroup: GPUDevice['createBindGroup'];
  readonly createView: GPUTexture['createView'];
  readonly configure: GPUCanvasContext['configure'];
  readonly getCurrentTexture: GPUCanvasContext['getCurrentTexture'];
  readonly submit: GPUQueue['submit'];
}

export function captureNativeApi(): NativeApi {
  return {
    requestDevice: GPUAdapter.prototype.requestDevice,
    createCommandEncoder: GPUDevice.prototype.createCommandEncoder,
    createTexture: GPUDevice.prototype.createTexture,
    createBuffer: GPUDevice.prototype.createBuffer,
    createBindGroup: GPUDevice.prototype.createBindGroup,
    createView: GPUTexture.prototype.createView,
    configure: GPUCanvasContext.prototype.configure,
    getCurrentTexture: GPUCanvasContext.prototype.getCurrentTexture,
    submit: GPUQueue.prototype.submit,
  };
}

export function isWebGPUAvailable(): boolean {
  return (
    typeof GPUAdapter !== 'undefined' &&
    typeof GPUDevice !== 'undefined' &&
    typeof GPUTexture !== 'undefined' &&
    typeof GPUCanvasContext !== 'undefined' &&
    typeof GPUQueue !== 'undefined'
  );
}
