/**
 * Stable fluid, with shaders pregenerated at build time (see ./shaders.ts and scripts/pregen.ts).
 * Host code uses the raw WebGPU API, so TypeGPU is not shipped to the browser.
 */
import {
  markAppStart,
  markFirstSubmit,
  markInteractive,
  measureFrame,
} from '../../../shared/bench.ts';
import { defineControls, mountControls } from '../../../shared/controls.ts';
import plumsUrl from '../plums.jpg';
import {
  addForcesWgsl,
  addInkWgsl,
  advectInkWgsl,
  advectWgsl,
  brushWgsl,
  diffusionWgsl,
  divergenceWgsl,
  pressureWgsl,
  projectWgsl,
  renderImageWgsl,
  renderInkWgsl,
  renderVelWgsl,
} from './generated.ts';

markAppStart();

// Must match ./shaders.ts
const N = 2048;
const SIM_N = N / 4;
const [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y] = [16, 16];
const FORCE_SCALE = 1;
const RADIUS = SIM_N / 16;
const INK_AMOUNT = 0.02;

type DisplayMode = 'ink' | 'velocity' | 'image';

const params = {
  dt: 0.5,
  viscosity: 0.000001,
  jacobiIter: 10,
  displayMode: 'image' as DisplayMode,
  paused: false,
};

type BrushState = {
  pos: [number, number];
  delta: [number, number];
  isDown: boolean;
};

// Initialize
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('WebGPU is not supported');
}
const device = await adapter.requestDevice();

// Setup canvas
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format: presentationFormat, alphaMode: 'premultiplied' });

// Helpers
function createField(label: string) {
  return device.createTexture({
    label,
    size: [SIM_N, SIM_N],
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
}

function toGrid(x: number, y: number): [number, number] {
  const gx = Math.floor((x / canvas.width) * SIM_N);
  const gy = Math.floor(((canvas.height - y) / canvas.height) * SIM_N);
  return [gx, gy];
}

class DoubleBuffer<T> {
  buffers: [T, T];
  index: number;
  constructor(bufferA: T, bufferB: T, initialIndex = 0) {
    this.buffers = [bufferA, bufferB];
    this.index = initialIndex;
  }

  get current(): T {
    return this.buffers[this.index];
  }
  get currentIndex(): number {
    return this.index;
  }

  swap(): void {
    this.index ^= 1;
  }
  setCurrent(index: number): void {
    this.index = index;
  }
}

// Buffers and brush state
// ShaderParams: { dt: f32 @0, viscosity: f32 @4 } = 8 bytes
const simParamBuffer = device.createBuffer({
  size: 8,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(simParamBuffer, 0, new Float32Array([params.dt, params.viscosity]));

// BrushParams: { pos: vec2i @0, delta: vec2f @8, radius: f32 @16, forceScale: f32 @20, inkAmount: f32 @24 },
// size rounded up to the 8-byte alignment = 32 bytes
const brushParamData = new ArrayBuffer(32);
const brushParamI32 = new Int32Array(brushParamData);
const brushParamF32 = new Float32Array(brushParamData);
brushParamF32[4] = RADIUS;
brushParamF32[5] = FORCE_SCALE;
brushParamF32[6] = INK_AMOUNT;
const brushParamBuffer = device.createBuffer({
  size: 32,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(brushParamBuffer, 0, brushParamData);

let brushState: BrushState = {
  pos: [0, 0],
  delta: [0, 0],
  isDown: false,
};

// Load and create background texture
const response = await fetch(plumsUrl);
const plums = await response.blob();

const backgroundTexture = device.createTexture({
  size: [N, N],
  format: 'rgba8unorm',
  usage:
    GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
});
{
  const bitmap = await createImageBitmap(plums, {
    resizeWidth: N,
    resizeHeight: N,
    resizeQuality: 'high',
  });
  try {
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: backgroundTexture }, [
      N,
      N,
    ]);
  } finally {
    bitmap.close();
  }
}

// Create simulation textures
const velTex = [createField('velocity0'), createField('velocity1')];
const inkTex = [createField('density0'), createField('density1')];
const pressureTex = [createField('pressure0'), createField('pressure1')];

const newInkTex = createField('addedInk');
const forceTex = createField('force');
const divergenceTex = createField('divergence');

const linSampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Bind group layouts (same entries and visibility as TypeGPU derives from the layouts in ./shaders.ts)
const READONLY = GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
const MUTABLE = GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT;

type Entry = 'uniform' | 'texture' | 'storageTexture' | 'sampler';
function createLayout(...entries: Entry[]) {
  return device.createBindGroupLayout({
    entries: entries.map((kind, binding): GPUBindGroupLayoutEntry => {
      switch (kind) {
        case 'uniform':
          return { binding, visibility: READONLY, buffer: { type: 'uniform' } };
        case 'texture':
          return {
            binding,
            visibility: READONLY,
            texture: { sampleType: 'float', viewDimension: '2d', multisampled: false },
          };
        case 'storageTexture':
          return {
            binding,
            visibility: MUTABLE,
            storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '2d' },
          };
        case 'sampler':
          return { binding, visibility: READONLY, sampler: { type: 'filtering' } };
      }
    }),
  });
}

const brushLayout = createLayout('uniform', 'storageTexture', 'storageTexture');
const addForcesLayout = createLayout('texture', 'storageTexture', 'texture', 'uniform');
const advectLayout = createLayout('texture', 'storageTexture', 'uniform', 'sampler');
const diffusionLayout = createLayout('texture', 'storageTexture', 'uniform');
const divergenceLayout = createLayout('texture', 'storageTexture');
const pressureLayout = createLayout('texture', 'texture', 'storageTexture');
const projectLayout = createLayout('texture', 'texture', 'storageTexture');
const advectInkLayout = createLayout('texture', 'texture', 'storageTexture', 'uniform', 'sampler');
const addInkLayout = createLayout('texture', 'storageTexture', 'texture');
const renderLayout = createLayout('texture', 'texture', 'sampler');

// Create compute pipelines
function createComputePipeline(code: string, layout: GPUBindGroupLayout) {
  return device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module: device.createShaderModule({ code }) },
  });
}

const brushPipeline = createComputePipeline(brushWgsl, brushLayout);
const addForcePipeline = createComputePipeline(addForcesWgsl, addForcesLayout);
const advectPipeline = createComputePipeline(advectWgsl, advectLayout);
const diffusionPipeline = createComputePipeline(diffusionWgsl, diffusionLayout);
const divergencePipeline = createComputePipeline(divergenceWgsl, divergenceLayout);
const pressurePipeline = createComputePipeline(pressureWgsl, pressureLayout);
const projectPipeline = createComputePipeline(projectWgsl, projectLayout);
const advectInkPipeline = createComputePipeline(advectInkWgsl, advectInkLayout);
const addInkPipeline = createComputePipeline(addInkWgsl, addInkLayout);

// Create render pipelines
const renderPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [renderLayout] });
function createRenderPipeline(code: string) {
  const module = device.createShaderModule({ code });
  return device.createRenderPipeline({
    layout: renderPipelineLayout,
    vertex: { module },
    fragment: { module, targets: [{ format: presentationFormat }] },
    primitive: {
      topology: 'triangle-strip',
    },
  });
}

const renderPipelineInk = createRenderPipeline(renderInkWgsl);
const renderPipelineVel = createRenderPipeline(renderVelWgsl);
const renderPipelineImage = createRenderPipeline(renderImageWgsl);

// Setup simulation buffers
const velBuffer = new DoubleBuffer(velTex[0], velTex[1]);
const inkBuffer = new DoubleBuffer(inkTex[0], inkTex[1]);
const pressureBuffer = new DoubleBuffer(pressureTex[0], pressureTex[1]);

const dispatchX = Math.ceil(SIM_N / WORKGROUP_SIZE_X);
const dispatchY = Math.ceil(SIM_N / WORKGROUP_SIZE_Y);

// Create bind groups
function createBindGroup(
  layout: GPUBindGroupLayout,
  resources: (GPUTexture | GPUBuffer | GPUSampler)[],
) {
  return device.createBindGroup({
    layout,
    entries: resources.map((resource, binding) => ({
      binding,
      resource:
        resource instanceof GPUTexture
          ? resource.createView()
          : resource instanceof GPUBuffer
            ? { buffer: resource }
            : resource,
    })),
  });
}

const brushBindGroup = createBindGroup(brushLayout, [brushParamBuffer, forceTex, newInkTex]);

const addInkBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return createBindGroup(addInkLayout, [inkTex[srcIdx], inkTex[dstIdx], newInkTex]);
});

const addForceBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return createBindGroup(addForcesLayout, [
    velTex[srcIdx],
    velTex[dstIdx],
    forceTex,
    simParamBuffer,
  ]);
});

const advectBindGroups = [0, 1].map((i) => {
  const srcIdx = 1 - i;
  const dstIdx = i;
  return createBindGroup(advectLayout, [
    velTex[srcIdx],
    velTex[dstIdx],
    simParamBuffer,
    linSampler,
  ]);
});

const diffusionBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return createBindGroup(diffusionLayout, [velTex[srcIdx], velTex[dstIdx], simParamBuffer]);
});

const divergenceBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  return createBindGroup(divergenceLayout, [velTex[srcIdx], divergenceTex]);
});

const pressureBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return createBindGroup(pressureLayout, [pressureTex[srcIdx], divergenceTex, pressureTex[dstIdx]]);
});

const projectBindGroups = [0, 1].map((velIdx) =>
  [0, 1].map((pIdx) => {
    const srcVelIdx = velIdx;
    const dstVelIdx = 1 - velIdx;
    const srcPIdx = pIdx;
    return createBindGroup(projectLayout, [
      velTex[srcVelIdx],
      pressureTex[srcPIdx],
      velTex[dstVelIdx],
    ]);
  }),
);

const advectInkBindGroups = [0, 1].map((velIdx) =>
  [0, 1].map((inkIdx) => {
    const srcVelIdx = velIdx;
    const srcInkIdx = inkIdx;
    const dstInkIdx = 1 - inkIdx;
    return createBindGroup(advectInkLayout, [
      velTex[srcVelIdx],
      inkTex[srcInkIdx],
      inkTex[dstInkIdx],
      simParamBuffer,
      linSampler,
    ]);
  }),
);

const renderBindGroups = {
  ink: [
    createBindGroup(renderLayout, [inkTex[0], backgroundTexture, linSampler]),
    createBindGroup(renderLayout, [inkTex[1], backgroundTexture, linSampler]),
  ],
  velocity: [
    createBindGroup(renderLayout, [velTex[0], backgroundTexture, linSampler]),
    createBindGroup(renderLayout, [velTex[1], backgroundTexture, linSampler]),
  ],
};

// Main rendering loop
function loop() {
  measureFrame(loopBody);
  markFirstSubmit(device);
  requestAnimationFrame(loop);
}

function loopBody() {
  if (params.paused) {
    return;
  }

  const encoder = device.createCommandEncoder();
  const dispatch = (pipeline: GPUComputePipeline, bindGroup: GPUBindGroup) => {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(dispatchX, dispatchY);
    pass.end();
  };

  if (brushState.isDown) {
    brushParamI32[0] = brushState.pos[0];
    brushParamI32[1] = brushState.pos[1];
    brushParamF32[2] = brushState.delta[0];
    brushParamF32[3] = brushState.delta[1];
    device.queue.writeBuffer(brushParamBuffer, 0, brushParamData, 0, 16);

    dispatch(brushPipeline, brushBindGroup);

    dispatch(addInkPipeline, addInkBindGroups[inkBuffer.currentIndex]);
    inkBuffer.swap();

    dispatch(addForcePipeline, addForceBindGroups[velBuffer.currentIndex]);
  } else {
    velBuffer.setCurrent(0);
  }

  dispatch(advectPipeline, advectBindGroups[velBuffer.currentIndex]);

  for (let i = 0; i < params.jacobiIter; i++) {
    dispatch(diffusionPipeline, diffusionBindGroups[velBuffer.currentIndex]);
    velBuffer.swap();
  }

  dispatch(divergencePipeline, divergenceBindGroups[velBuffer.currentIndex]);

  pressureBuffer.setCurrent(0);
  for (let i = 0; i < params.jacobiIter; i++) {
    dispatch(pressurePipeline, pressureBindGroups[pressureBuffer.currentIndex]);
    pressureBuffer.swap();
  }

  dispatch(projectPipeline, projectBindGroups[velBuffer.currentIndex][pressureBuffer.currentIndex]);
  velBuffer.swap();

  dispatch(advectInkPipeline, advectInkBindGroups[velBuffer.currentIndex][inkBuffer.currentIndex]);
  inkBuffer.swap();

  let renderBG: GPUBindGroup;
  let pipeline: GPURenderPipeline;

  switch (params.displayMode) {
    case 'ink':
      renderBG = renderBindGroups.ink[inkBuffer.currentIndex];
      pipeline = renderPipelineInk;
      break;
    case 'image':
      renderBG = renderBindGroups.ink[inkBuffer.currentIndex];
      pipeline = renderPipelineImage;
      break;
    case 'velocity':
      renderBG = renderBindGroups.velocity[velBuffer.currentIndex];
      pipeline = renderPipelineVel;
      break;
    default:
      throw new Error('Invalid display mode');
  }

  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  renderPass.setPipeline(pipeline);
  renderPass.setBindGroup(0, renderBG);
  renderPass.draw(3);
  renderPass.end();

  device.queue.submit([encoder.finish()]);
}

loop();

// #region Example controls

canvas.addEventListener('mousedown', (e) => {
  const x = e.offsetX * devicePixelRatio;
  const y = e.offsetY * devicePixelRatio;
  brushState = {
    pos: toGrid(x, y),
    delta: [0, 0],
    isDown: true,
  };
});
canvas.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * devicePixelRatio;
    const y = (touch.clientY - rect.top) * devicePixelRatio;
    brushState = {
      pos: toGrid(x, y),
      delta: [0, 0],
      isDown: true,
    };
  },
  { passive: false },
);

const mouseUpEventListener = () => {
  brushState.isDown = false;
};
window.addEventListener('mouseup', mouseUpEventListener);

const touchEndEventListener = () => {
  brushState.isDown = false;
};
window.addEventListener('touchend', touchEndEventListener);

canvas.addEventListener('mousemove', (e) => {
  const x = e.offsetX * devicePixelRatio;
  const y = e.offsetY * devicePixelRatio;
  const [newX, newY] = toGrid(x, y);
  brushState.delta = [newX - brushState.pos[0], newY - brushState.pos[1]];
  brushState.pos = [newX, newY];
});
canvas.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * devicePixelRatio;
    const y = (touch.clientY - rect.top) * devicePixelRatio;
    const [newX, newY] = toGrid(x, y);
    brushState.delta = [newX - brushState.pos[0], newY - brushState.pos[1]];
    brushState.pos = [newX, newY];
  },
  { passive: false },
);

function hideHelp() {
  const helpElem = document.getElementById('help');
  if (helpElem) {
    helpElem.style.opacity = '0';
  }
}
for (const eventName of ['click', 'touchstart']) {
  canvas.addEventListener(eventName, hideHelp, { once: true, passive: true });
}

const controls = defineControls({
  'timestep (dt)': {
    initial: params.dt,
    min: 0.05,
    max: 2.0,
    step: 0.01,
    onSliderChange: (value) => {
      params.dt = value;
      device.queue.writeBuffer(simParamBuffer, 0, new Float32Array([params.dt]));
    },
  },
  viscosity: {
    initial: params.viscosity,
    min: 0,
    max: 0.1,
    step: 0.000001,
    onSliderChange: (value) => {
      params.viscosity = value;
      device.queue.writeBuffer(simParamBuffer, 4, new Float32Array([params.viscosity]));
    },
  },
  'jacobi iterations': {
    initial: params.jacobiIter,
    min: 2,
    max: 50,
    step: 2,
    onSliderChange: (value) => {
      params.jacobiIter = value;
    },
  },
  visualization: {
    initial: 'image',
    options: ['image', 'velocity', 'ink'],
    onSelectChange: (value: DisplayMode) => {
      params.displayMode = value;
    },
  },
  pause: {
    initial: false,
    onToggleChange: (value) => {
      params.paused = value;
    },
  },
});

mountControls(controls);
markInteractive();

// #endregion
