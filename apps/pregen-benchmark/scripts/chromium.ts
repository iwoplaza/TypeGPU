/**
 * Flags that make WebGPU (and WebGPU canvas presentation) work in headless
 * Chromium without a GPU, through SwiftShader's Vulkan implementation.
 * Note: `--use-webgpu-adapter=swiftshader` breaks async GPU callbacks once a
 * canvas is configured, so it is intentionally not used.
 */
export const chromiumArgs = [
  '--enable-unsafe-webgpu',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--enable-features=Vulkan',
  '--use-vulkan=swiftshader',
];
