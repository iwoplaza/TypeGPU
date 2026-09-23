import { tgpu, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

// Slots and accessors are placeholders inside shader code. They are resolved
// when TypeGPU generates WGSL, and they can be bound at any level: on a single
// function with `tgpu.fn(f).with(...)`, on a lazy value, or on the root with
// `.with(...)` and `.pipe(...)` (as done below, right before creating each
// pipeline).
//
// Since the values are known while generating the shader, each pipeline gets
// its own specialised WGSL: the chosen pattern is called directly, the column
// index is inlined as a literal, and there is no runtime branching. With three
// uniforms and a `switch` instead, every pipeline would run the same, more
// generic code.

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const timeUniform = root.createUniform(d.f32);
const scaleUniform = root.createUniform(d.f32, 12);
const columnAspectUniform = root.createUniform(d.f32, 1);

// #region Placeholders

// A slot can hold any JavaScript value: functions, numbers, booleans, schemas
// or whole config objects. Its value is also visible to lazy values and other
// JS code running during resolution, so it can shape the generated code, not
// only feed values into it. Here, one slot holds a function that turns UVs into
// brightness...
const patternSlot = tgpu.slot<(uv: d.v2f) => number>();
// ...and another holds a plain number, which gets inlined as a constant.
const columnSlot = tgpu.slot<number>();

// An accessor holds a value of a given schema, and the shader reading it does
// not care where that value comes from. It can be bound to a constant, any
// buffer (uniform, readonly or mutable), a bind group layout entry, a private or
// workgroup variable, a `tgpu.const`, a texture view, a GPU function, or even a
// nested reference like `() => boids.$[0].pos`. To also write through it, use
// `tgpu.mutableAccessor`.
const tintAccess = tgpu.accessor(d.vec3f);

// #endregion

// #region Pattern functions

const stripes = (uv: d.v2f) => {
  'use gpu';
  const t = std.sin((uv.x + uv.y) * scaleUniform.$ + timeUniform.$ * 2);
  return std.smoothstep(-0.1, 0.1, t);
};

const rings = (uv: d.v2f) => {
  'use gpu';
  const dist = std.length(uv - 0.5) * scaleUniform.$ - timeUniform.$ * 2;
  return std.smoothstep(-0.2, 0.2, std.sin(dist * 2));
};

const checker = (uv: d.v2f) => {
  'use gpu';
  const angle = timeUniform.$ * 0.3;
  const centered = uv - 0.5;
  const rotated = d.vec2f(
    centered.x * std.cos(angle) - centered.y * std.sin(angle),
    centered.x * std.sin(angle) + centered.y * std.cos(angle),
  );
  const cell = std.floor(rotated * scaleUniform.$);
  return std.select(0.2, 1, (cell.x + cell.y) % 2 === 0);
};

// #endregion

// #region Tint sources

// A GPU function computing the color, used as an accessor value below.
const cyclingTint = () => {
  'use gpu';
  return std.mix(d.vec3f(0.3, 0.6, 1), d.vec3f(0.7, 1, 0.8), std.sin(timeUniform.$) * 0.5 + 0.5);
};

const animatedTint = root.createUniform(d.vec3f);

// #endregion

// #region The shared shader

const COLUMNS = 3;

// Each pipeline covers one vertical column of the canvas with two triangles, so
// nothing spills into the neighbouring columns.
const quadCorners = tgpu.const(d.arrayOf(d.vec2f, 6), [
  d.vec2f(0, 0),
  d.vec2f(1, 0),
  d.vec2f(0, 1),
  d.vec2f(0, 1),
  d.vec2f(1, 0),
  d.vec2f(1, 1),
]);

const vertex = tgpu.vertexFn({
  in: { index: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.vec2f },
})(({ index }) => {
  'use gpu';
  const corner = quadCorners.$[index];
  const columnWidth = 2 / COLUMNS;
  const left = -1 + columnSlot.$ * columnWidth;
  return {
    position: d.vec4f(left + corner.x * columnWidth, corner.y * 2 - 1, 0, 1),
    // Square UVs centered in the column, so the patterns don't get stretched.
    uv: d.vec2f((corner.x - 0.5) * columnAspectUniform.$ + 0.5, 1 - corner.y),
  };
});

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const brightness = patternSlot.$(uv);
  return d.vec4f(tintAccess.$ * brightness, 1);
});

// #endregion

// #region Three pipelines, one shader

const pipelines = [
  // Slot: stripes, accessor: a constant color.
  root
    .with(patternSlot, stripes)
    .with(tintAccess, d.vec3f(1, 0.45, 0.35))
    .with(columnSlot, 0)
    .createRenderPipeline({ vertex, fragment }),
  // Slot: rings, accessor: a uniform buffer that changes every frame.
  root
    .with(patternSlot, rings)
    .with(tintAccess, animatedTint)
    .with(columnSlot, 1)
    .createRenderPipeline({ vertex, fragment }),
  // Slot: checker, accessor: a GPU function computing the color.
  root
    .with(patternSlot, checker)
    .with(tintAccess, cyclingTint)
    .with(columnSlot, 2)
    .createRenderPipeline({ vertex, fragment }),
];

// #endregion

function frame(timestamp: number) {
  frameId = requestAnimationFrame(frame);
  if (canvas.width === 0 || canvas.height === 0) {
    return;
  }
  const time = timestamp / 1000;
  timeUniform.write(time);
  columnAspectUniform.write(canvas.width / COLUMNS / canvas.height);
  animatedTint.write(d.vec3f(0.6 + 0.4 * Math.sin(time), 0.5, 0.6 + 0.4 * Math.cos(time)));

  // All three pipelines draw into the same render pass.
  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context }] });
  for (const pipeline of pipelines) {
    pipeline.with(pass).draw(6);
  }
  pass.end();
  encoder.submit();
}
let frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = defineControls({
  Scale: {
    initial: 12,
    min: 2,
    max: 30,
    step: 1,
    onSliderChange(value: number) {
      scaleUniform.write(value);
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion
