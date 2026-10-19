/**
 * Slime Mold 3d, with shaders pregenerated at build time (see ./shaders.ts and scripts/pregen.ts).
 * Host code uses the raw WebGPU API, so TypeGPU is not shipped to the browser.
 */
import * as m from 'wgpu-matrix';
import {
  markAppStart,
  markFirstSubmit,
  markInteractive,
  measureFrame,
} from '../../../shared/bench.ts';
import { defineControls, mountControls } from '../../../shared/controls.ts';
import { blurWgsl, initWgsl, renderWgsl, updateAgentsWgsl } from './generated.ts';

markAppStart();

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('Could not find a compatible GPU');
}
const canFilter = adapter.features.has('float32-filterable');
const device = await adapter.requestDevice({
  requiredFeatures: canFilter ? ['float32-filterable'] : [],
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device, format: presentationFormat, alphaMode: 'premultiplied' });

// Must match ./shaders.ts
const VOLUME_SIZE = 256;
const NUM_AGENTS = 800_000;
const AGENT_WORKGROUP_SIZE = 64;
const BLUR_WORKGROUP_SIZE = [4, 4, 4];
const INIT_WORKGROUP_SIZE = 256;

const CAMERA_FOV_DEGREES = 60;
const CAMERA_DISTANCE_MULTIPLIER = 1.5;
const CAMERA_INITIAL_ANGLE = Math.PI / 4;

const DEFAULT_MOVE_SPEED = 30.0;
const DEFAULT_SENSOR_ANGLE = 0.5;
const DEFAULT_SENSOR_DISTANCE = 9.0;
const DEFAULT_TURN_SPEED = 10.0;
const DEFAULT_EVAPORATION_RATE = 0.05;

const resolution = [VOLUME_SIZE, VOLUME_SIZE, VOLUME_SIZE] as const;

// Camera: { viewProj: mat4x4f @0, invViewProj: mat4x4f @64, position: vec3f @128 } = 144 bytes
const cameraBuffer = device.createBuffer({
  size: 144,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
});
const cameraData = new Float32Array(36);

const cameraTarget = m.vec3.create(resolution[0] / 2, resolution[1] / 2, resolution[2] / 2);
const cameraUp = m.vec3.create(0, 1, 0);
const fov = (CAMERA_FOV_DEGREES * Math.PI) / 180;
const aspect = canvas.width / canvas.height;
const near = 0.1;
const far = 1000.0;

let cameraDistance = Math.max(...resolution) * CAMERA_DISTANCE_MULTIPLIER;
let cameraTheta = CAMERA_INITIAL_ANGLE; // azimuth
let cameraPhi = CAMERA_INITIAL_ANGLE; // elevation

const updateCamera = () => {
  const cameraPos = m.vec3.add(
    cameraTarget,
    m.vec3.create(
      cameraDistance * Math.sin(cameraPhi) * Math.cos(cameraTheta),
      cameraDistance * Math.cos(cameraPhi),
      cameraDistance * Math.sin(cameraPhi) * Math.sin(cameraTheta),
    ),
  );

  const view = m.mat4.lookAt(cameraPos, cameraTarget, cameraUp);
  const proj = m.mat4.perspective(fov, aspect, near, far);
  const viewProj = m.mat4.mul(proj, view, cameraData.subarray(0, 16));
  m.mat4.invert(viewProj, cameraData.subarray(16, 32));
  cameraData.set(cameraPos, 32);

  device.queue.writeBuffer(cameraBuffer, 0, cameraData);
};

updateCamera();

// Agent: { position: vec3f @0, direction: vec3f @16 } = 32 bytes
const agentsDataBuffers = [0, 1].map(() =>
  device.createBuffer({
    size: NUM_AGENTS * 32,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  }),
);

{
  const initPipeline = device.createComputePipeline({
    layout: 'auto',
    compute: { module: device.createShaderModule({ code: initWgsl }) },
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(initPipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: initPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: agentsDataBuffers[0] } },
        { binding: 1, resource: { buffer: agentsDataBuffers[1] } },
      ],
    }),
  );
  pass.dispatchWorkgroups(Math.ceil(NUM_AGENTS / INIT_WORKGROUP_SIZE));
  pass.end();
  device.queue.submit([encoder.finish()]);
}

// Params: 6 x f32 = 24 bytes
const PARAMS_OFFSET = {
  deltaTime: 0,
  moveSpeed: 4,
  sensorAngle: 8,
  sensorDistance: 12,
  turnSpeed: 16,
  evaporationRate: 20,
};
const paramsBuffer = device.createBuffer({
  size: 24,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
});
device.queue.writeBuffer(
  paramsBuffer,
  0,
  new Float32Array([
    0,
    DEFAULT_MOVE_SPEED,
    DEFAULT_SENSOR_ANGLE,
    DEFAULT_SENSOR_DISTANCE,
    DEFAULT_TURN_SPEED,
    DEFAULT_EVAPORATION_RATE,
  ]),
);
const patchParam = (key: keyof typeof PARAMS_OFFSET, value: number) =>
  device.queue.writeBuffer(paramsBuffer, PARAMS_OFFSET[key], new Float32Array([value]));

const textures = [0, 1].map(() =>
  device.createTexture({
    size: [resolution[0], resolution[1], resolution[2]],
    format: 'r32float',
    dimension: '3d',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC,
  }),
);
const textureViews = textures.map((t) => t.createView());

const sampler = device.createSampler({
  magFilter: canFilter ? 'linear' : 'nearest',
  minFilter: canFilter ? 'linear' : 'nearest',
});

// Render layout: state (texture_3d) @0, sampler @1, camera (uniform) @2
const renderBindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { viewDimension: '3d', sampleType: canFilter ? 'float' : 'unfilterable-float' },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: canFilter ? 'filtering' : 'non-filtering' },
    },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
  ],
});

const renderModule = device.createShaderModule({ code: renderWgsl });
const renderPipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),
  vertex: { module: renderModule },
  fragment: { module: renderModule, targets: [{ format: presentationFormat }] },
  primitive: { topology: 'triangle-list' },
});

const computePipeline = device.createComputePipeline({
  layout: 'auto',
  compute: { module: device.createShaderModule({ code: updateAgentsWgsl }) },
});

const blurPipeline = device.createComputePipeline({
  layout: 'auto',
  compute: { module: device.createShaderModule({ code: blurWgsl }) },
});

// oldAgents @0, oldState @1, newAgents @2, newState @3, params @4
const bindGroups = [0, 1].map((i) =>
  device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: agentsDataBuffers[i] } },
      { binding: 1, resource: textureViews[i] },
      { binding: 2, resource: { buffer: agentsDataBuffers[1 - i] } },
      { binding: 3, resource: textureViews[1 - i] },
      { binding: 4, resource: { buffer: paramsBuffer } },
    ],
  }),
);

// oldState @0, newState @1, sampler @2, params @3
const blurBindGroups = [0, 1].map((i) =>
  device.createBindGroup({
    layout: blurPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: textureViews[i] },
      { binding: 1, resource: textureViews[1 - i] },
      { binding: 2, resource: sampler },
      { binding: 3, resource: { buffer: paramsBuffer } },
    ],
  }),
);

const renderBindGroups = [0, 1].map((i) =>
  device.createBindGroup({
    layout: renderBindGroupLayout,
    entries: [
      { binding: 0, resource: textureViews[i] },
      { binding: 1, resource: sampler },
      { binding: 2, resource: { buffer: cameraBuffer } },
    ],
  }),
);

let lastTime: number | null = null;
let currentTexture = 0;

function frame(timestamp: number) {
  measureFrame(() => frameBody(timestamp));
  markFirstSubmit(device);
  requestAnimationFrame(frame);
}

function frameBody(timestamp: number) {
  const deltaTime = Math.min(lastTime !== null ? (timestamp - lastTime) / 1000 : 0, 0.1);
  lastTime = timestamp;

  patchParam('deltaTime', deltaTime);

  const encoder = device.createCommandEncoder();

  const blurPass = encoder.beginComputePass();
  blurPass.setPipeline(blurPipeline);
  blurPass.setBindGroup(0, blurBindGroups[currentTexture]);
  blurPass.dispatchWorkgroups(
    Math.ceil(resolution[0] / BLUR_WORKGROUP_SIZE[0]),
    Math.ceil(resolution[1] / BLUR_WORKGROUP_SIZE[1]),
    Math.ceil(resolution[2] / BLUR_WORKGROUP_SIZE[2]),
  );
  blurPass.end();

  const computePass = encoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, bindGroups[currentTexture]);
  computePass.dispatchWorkgroups(Math.ceil(NUM_AGENTS / AGENT_WORKGROUP_SIZE));
  computePass.end();

  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  renderPass.setPipeline(renderPipeline);
  renderPass.setBindGroup(0, renderBindGroups[1 - currentTexture]);
  renderPass.draw(3);
  renderPass.end();

  device.queue.submit([encoder.finish()]);

  currentTexture = 1 - currentTexture;
}
requestAnimationFrame(frame);

// #region Example controls

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

const handleCameraRotation = (deltaX: number, deltaY: number) => {
  cameraTheta -= deltaX * 0.01;
  cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi + deltaY * 0.01));
  updateCamera();
};

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;

  handleCameraRotation(deltaX, deltaY);

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mouseleave', () => {
  isDragging = false;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    cameraDistance *= 1 + e.deltaY * 0.001;
    cameraDistance = Math.max(100, Math.min(cameraDistance, Math.max(...resolution) * 3));
    updateCamera();
  },
  { passive: false },
);

canvas.addEventListener(
  'touchstart',
  (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      isDragging = true;
      lastMouseX = e.touches[0].clientX;
      lastMouseY = e.touches[0].clientY;
    }
  },
  { passive: false },
);

canvas.addEventListener(
  'touchmove',
  (e) => {
    e.preventDefault();
    if (!isDragging || e.touches.length !== 1) return;

    const deltaX = e.touches[0].clientX - lastMouseX;
    const deltaY = e.touches[0].clientY - lastMouseY;

    handleCameraRotation(deltaX, deltaY);

    lastMouseX = e.touches[0].clientX;
    lastMouseY = e.touches[0].clientY;
  },
  { passive: false },
);

canvas.addEventListener(
  'touchend',
  (e) => {
    e.preventDefault();
    isDragging = false;
  },
  { passive: false },
);

canvas.addEventListener(
  'touchcancel',
  (e) => {
    e.preventDefault();
    isDragging = false;
  },
  { passive: false },
);

const controls = defineControls({
  'Move Speed': {
    initial: DEFAULT_MOVE_SPEED,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (newValue) => patchParam('moveSpeed', newValue),
  },
  'Sensor Angle': {
    initial: DEFAULT_SENSOR_ANGLE,
    min: 0,
    max: 3.14,
    step: 0.01,
    onSliderChange: (newValue) => patchParam('sensorAngle', newValue),
  },
  'Sensor Distance': {
    initial: DEFAULT_SENSOR_DISTANCE,
    min: 1,
    max: 50,
    step: 0.5,
    onSliderChange: (newValue) => patchParam('sensorDistance', newValue),
  },
  'Turn Speed': {
    initial: DEFAULT_TURN_SPEED,
    min: 0,
    max: 100,
    step: 0.1,
    onSliderChange: (newValue) => patchParam('turnSpeed', newValue),
  },
  'Evaporation Rate': {
    initial: DEFAULT_EVAPORATION_RATE,
    min: 0,
    max: 0.5,
    step: 0.01,
    onSliderChange: (newValue) => patchParam('evaporationRate', newValue),
  },
});

mountControls(controls);
markInteractive();

// #endregion
