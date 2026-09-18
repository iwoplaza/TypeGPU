import { tgpu, d, std } from 'typegpu';
import { mat4 } from 'wgpu-matrix';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// #region Geometry

// One schema describes a vertex on the GPU, in the vertex buffer and in TypeScript.
const Vertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
  uv: d.vec2f,
});

// Each face gets its own four vertices so it can have a flat normal.
const faces = [
  { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
  { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
];

const vertices = faces.flatMap(({ normal, u, v }) =>
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([s, t]) => ({
    position: d.vec3f(
      normal[0] + u[0] * s + v[0] * t,
      normal[1] + u[1] * s + v[1] * t,
      normal[2] + u[2] * s + v[2] * t,
    ),
    normal: d.vec3f(normal[0], normal[1], normal[2]),
    uv: d.vec2f((s + 1) / 2, (t + 1) / 2),
  })),
);

// Two triangles per face, referencing the four corners above.
const indices = faces.flatMap((_, i) => [0, 1, 2, 0, 2, 3].map((j) => i * 4 + j));

const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));
const vertexBuffer = root
  .createBuffer(vertexLayout.schemaForCount(vertices.length), vertices)
  .$usage('vertex');
const indexBuffer = root.createBuffer(d.arrayOf(d.u16, indices.length), indices).$usage('index');

// #endregion

// #region Camera and transforms

const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

const cameraUniform = root.createUniform(Camera);
const modelUniform = root.createUniform(d.mat4x4f);
const colorUniform = root.createUniform(d.vec3f, d.vec3f(0.35, 0.6, 1));

// wgpu-matrix can write straight into TypeGPU matrices, so nothing is
// allocated per frame.
const view = mat4.lookAt([0, 2.2, 5], [0, 0, 0], [0, 1, 0], d.mat4x4f());
const projection = d.mat4x4f();
const model = d.mat4x4f();

function updateProjection() {
  if (canvas.width === 0 || canvas.height === 0) {
    return;
  }
  // WebGPU clip space has z in [0, 1], which wgpu-matrix targets by default.
  mat4.perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100, projection);
  cameraUniform.write({ view, projection });
}

// #endregion

// #region Pipeline

const lightDirection = std.normalize(d.vec3f(0.5, 1, 0.8));

const pipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: ({ position, normal, uv }) => {
    'use gpu';
    const camera = cameraUniform.$;
    const worldPosition = modelUniform.$ * d.vec4f(position, 1);
    return {
      $position: camera.projection * camera.view * worldPosition,
      // Rotating the normal with the model matrix keeps the lighting attached to the cube.
      worldNormal: (modelUniform.$ * d.vec4f(normal, 0)).xyz,
      uv,
    };
  },
  fragment: ({ worldNormal, uv }) => {
    'use gpu';
    const n = std.normalize(worldNormal);
    const diffuse = std.max(std.dot(n, lightDirection), 0);
    // A cheap highlight: how well the normal points between the light and the camera.
    const halfVector = std.normalize(lightDirection + d.vec3f(0, 0.4, 1));
    const specular = std.pow(std.max(std.dot(n, halfVector), 0), 32) * 0.4;
    // A checkerboard from the UVs, so the faces are easy to tell apart.
    const cell = std.floor(uv * 4);
    const checker = std.select(0.7, 1, (cell.x + cell.y) % 2 === 0);
    const color = colorUniform.$ * checker * (0.15 + 0.85 * diffuse) + specular;
    return d.vec4f(color, 1);
  },
  primitive: { cullMode: 'back' },
  // The depth test makes sure the front faces win over the back faces.
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
});

function createDepthTexture() {
  return root
    .createTexture({
      size: [Math.max(1, canvas.width), Math.max(1, canvas.height)],
      format: 'depth24plus',
    })
    .$usage('render');
}
let depthTexture = createDepthTexture();
updateProjection();

// #endregion

// #region Frame loop

let speed = 1;
let angle = 0;
let lastTime = 0;

function frame(timestamp: number) {
  frameId = requestAnimationFrame(frame);
  if (canvas.width === 0 || canvas.height === 0) {
    return;
  }
  const dt = lastTime === 0 ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  angle += dt * speed;

  if (depthTexture.props.size[0] !== canvas.width || depthTexture.props.size[1] !== canvas.height) {
    depthTexture.destroy();
    depthTexture = createDepthTexture();
    updateProjection();
  }

  mat4.identity(model);
  mat4.rotateY(model, angle, model);
  mat4.rotateX(model, angle * 0.6, model);
  modelUniform.write(model);

  pipeline
    .with(vertexLayout, vertexBuffer)
    .withIndexBuffer(indexBuffer)
    .withColorAttachment({ view: context, clearValue: [0.08, 0.08, 0.12, 1] })
    .withDepthStencilAttachment({ view: depthTexture, depthClearValue: 1 })
    .drawIndexed(indices.length);
}
let frameId = requestAnimationFrame(frame);

// #endregion

// #region Example controls and cleanup

export const controls = defineControls({
  Speed: {
    initial: 1,
    min: 0,
    max: 4,
    step: 0.1,
    onSliderChange(value: number) {
      speed = value;
    },
  },
  Color: {
    initial: d.vec3f(0.35, 0.6, 1),
    onColorChange(value: d.v3f) {
      colorUniform.write(value);
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion
