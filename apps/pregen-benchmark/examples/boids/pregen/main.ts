/**
 * Boids, with shaders pregenerated at build time (see ./shaders.ts and scripts/pregen.ts).
 * Host code uses the raw WebGPU API, so TypeGPU is not shipped to the browser.
 */
import { markAppStart, markFirstSubmit, markInteractive, measureFrame } from '../../../shared/bench.ts';
import { defineControls, mountControls } from '../../../shared/controls.ts';
import { renderWgsl, simulateWgsl } from './generated.ts';

markAppStart();

// Must match ./shaders.ts
const triangleAmount = 1000;
const triangleSize = 0.03;
const workgroupSize = 64;

const presets = {
  default: [0.05, 0.001, 0.3, 0.01, 0.3, 0.001],
  mosquitoes: [0.02, 0.01, 0.0, 0.0, 0.177, 0.011],
  blobs: [0.033, 0.051, 0.047, 0.1, 0.3, 0.013],
  particles: [0.035, 1, 0.0, 0.0, 0.0, 0.0],
  nanites: [0.067, 0.01, 0.066, 0.021, 0.086, 0.094],
} as const;

const colorPresets = {
  plumTree: [1.0, 2.0, 1.0],
  jeans: [2.0, 1.5, 1.0],
  greyscale: [0, 0, 0],
  hotcold: [0, 3.14, 3.14],
} as const;

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('WebGPU is not supported');
}
const device = await adapter.requestDevice();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format: presentationFormat, alphaMode: 'premultiplied' });

// vec3f uniform, padded to 16 bytes
const colorPaletteBuffer = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const writeColorPalette = (color: readonly number[]) =>
  device.queue.writeBuffer(colorPaletteBuffer, 0, new Float32Array(color));

// Params: 6 x f32, padded to 32 bytes for uniform usage
const paramsBuffer = device.createBuffer({
  size: 32,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const writeParams = (params: readonly number[]) =>
  device.queue.writeBuffer(paramsBuffer, 0, new Float32Array(params));
writeParams(presets.default);

const triangleVertexBuffer = device.createBuffer({
  size: 3 * 8,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(
  triangleVertexBuffer,
  0,
  new Float32Array([0.0, triangleSize, -triangleSize / 2, -triangleSize / 2, triangleSize / 2, -triangleSize / 2]),
);

// TriangleData: { position: vec2f, velocity: vec2f } = 16 bytes
const trianglePosBuffers = Array.from({ length: 2 }, () =>
  device.createBuffer({
    size: triangleAmount * 16,
    usage:
      GPUBufferUsage.STORAGE | GPUBufferUsage.UNIFORM | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  }),
);

const randomizePositions = () => {
  const data = new Float32Array(triangleAmount * 4);
  for (let i = 0; i < triangleAmount; i++) {
    data[i * 4 + 0] = Math.random() * 2 - 1;
    data[i * 4 + 1] = Math.random() * 2 - 1;
    data[i * 4 + 2] = Math.random() * 0.1 - 0.05;
    data[i * 4 + 3] = Math.random() * 0.1 - 0.05;
  }
  device.queue.writeBuffer(trianglePosBuffers[0], 0, data);
  device.queue.writeBuffer(trianglePosBuffers[1], 0, data);
};
randomizePositions();

const renderModule = device.createShaderModule({ code: renderWgsl });
const renderPipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: renderModule,
    buffers: [
      {
        arrayStride: 8,
        stepMode: 'vertex',
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
      },
      {
        arrayStride: 16,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 1, offset: 0, format: 'float32x2' },
          { shaderLocation: 2, offset: 8, format: 'float32x2' },
        ],
      },
    ],
  },
  fragment: { module: renderModule, targets: [{ format: presentationFormat }] },
  primitive: { topology: 'triangle-list' },
});

const renderBindGroup = device.createBindGroup({
  layout: renderPipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: colorPaletteBuffer } }],
});

const simulatePipeline = device.createComputePipeline({
  layout: 'auto',
  compute: { module: device.createShaderModule({ code: simulateWgsl }) },
});

const computeBindGroups = [0, 1].map((idx) =>
  device.createBindGroup({
    layout: simulatePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: trianglePosBuffers[idx] } },
      { binding: 1, resource: { buffer: trianglePosBuffers[1 - idx] } },
      { binding: 2, resource: { buffer: paramsBuffer } },
    ],
  }),
);

let even = false;

function frameBody() {
  even = !even;

  const encoder = device.createCommandEncoder();

  const computePass = encoder.beginComputePass();
  computePass.setPipeline(simulatePipeline);
  computePass.setBindGroup(0, computeBindGroups[even ? 0 : 1]);
  computePass.dispatchWorkgroups(Math.ceil(triangleAmount / workgroupSize));
  computePass.end();

  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [1, 1, 1, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, renderBindGroup);
  renderPass.setVertexBuffer(0, triangleVertexBuffer);
  renderPass.setVertexBuffer(1, trianglePosBuffers[even ? 1 : 0]);
  renderPass.draw(3, triangleAmount);
  renderPass.end();

  device.queue.submit([encoder.finish()]);
}

function frame() {
  measureFrame(frameBody);
  markFirstSubmit(device);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

const controls = defineControls({
  Randomize: { onButtonClick: () => randomizePositions() },
  '🐦 Birds': { onButtonClick: () => writeParams(presets.default) },
  '🦟 Mosquitoes': { onButtonClick: () => writeParams(presets.mosquitoes) },
  '💧 Blobs': { onButtonClick: () => writeParams(presets.blobs) },
  '⚛ Particles': { onButtonClick: () => writeParams(presets.particles) },
  '🤖 Nanites': { onButtonClick: () => writeParams(presets.nanites) },
  '🟪🟩': { onButtonClick: () => writeColorPalette(colorPresets.plumTree) },
  '🟦🟫': { onButtonClick: () => writeColorPalette(colorPresets.jeans) },
  '⬛⬜': { onButtonClick: () => writeColorPalette(colorPresets.greyscale) },
  '🟥🟦': { onButtonClick: () => writeColorPalette(colorPresets.hotcold) },
});

mountControls(controls);
markInteractive();
