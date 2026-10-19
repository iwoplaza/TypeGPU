/**
 * Shader-only TypeGPU code for the boids example. Only ever imported at build time
 * by scripts/pregen.ts, which resolves `shaderModules` into WGSL strings.
 */
import { tgpu, d, std } from 'typegpu';

export const triangleAmount = 1000;
export const triangleSize = 0.03;

const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec2f(v.x * cos - v.y * sin, v.x * sin + v.y * cos);
};

const getRotationFromVelocity = (velocity: d.v2f) => {
  'use gpu';
  return -std.atan2(velocity.x, velocity.y);
};

const Params = d.struct({
  separationDistance: d.f32,
  separationStrength: d.f32,
  alignmentDistance: d.f32,
  alignmentStrength: d.f32,
  cohesionDistance: d.f32,
  cohesionStrength: d.f32,
});

const TriangleData = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
});

const renderLayout = tgpu.bindGroupLayout({
  colorPalette: { uniform: d.vec3f },
});

const VertexOutput = {
  position: d.builtin.position,
  color: d.vec4f,
};

const mainVert = tgpu.vertexFn({
  in: { v: d.vec2f, center: d.vec2f, velocity: d.vec2f },
  out: VertexOutput,
})((input) => {
  'use gpu';
  const angle = getRotationFromVelocity(input.velocity);
  const rotated = rotate(input.v, angle);
  const pos = d.vec4f(rotated + input.center, 0, 1);

  const color = d.vec4f(std.sin(renderLayout.$.colorPalette + angle) * 0.45 + 0.45, 1);

  return { position: pos, color };
});

const mainFrag = tgpu.fragmentFn({
  in: VertexOutput,
  out: d.vec4f,
})((input) => input.color);

const TriangleDataArray = d.arrayOf(TriangleData);

const computeLayout = tgpu.bindGroupLayout({
  currentTrianglePos: { storage: TriangleDataArray },
  nextTrianglePos: {
    storage: TriangleDataArray,
    access: 'mutable',
  },
  params: { uniform: Params },
});

const simulate = (index: number) => {
  'use gpu';
  const params = computeLayout.$.params;
  const self = TriangleData(computeLayout.$.currentTrianglePos[index]);
  let separation = d.vec2f();
  let alignment = d.vec2f();
  let cohesion = d.vec2f();
  let alignmentCount = 0;
  let cohesionCount = 0;

  for (const other of computeLayout.$.currentTrianglePos) {
    const dist = std.distance(self.position, other.position);
    if (dist < params.separationDistance) {
      separation += self.position - other.position;
    }
    if (dist < params.alignmentDistance) {
      alignment += other.velocity;
      alignmentCount++;
    }
    if (dist < params.cohesionDistance) {
      cohesion += other.position;
      cohesionCount++;
    }
  }
  if (alignmentCount > 0) {
    alignment /= d.f32(alignmentCount);
  }
  if (cohesionCount > 0) {
    cohesion /= d.f32(cohesionCount);
    cohesion -= self.position;
  }

  const velocity =
    params.separationStrength * separation +
    params.alignmentStrength * alignment +
    params.cohesionStrength * cohesion;

  self.velocity += velocity;
  self.velocity = std.clamp(std.length(self.velocity), 0, 0.01) * std.normalize(self.velocity);

  self.position += self.velocity;

  // Wrap the domain
  const domain = (1 + triangleSize) * 2;
  self.position = (std.fract(self.position / domain + 0.5) - 0.5) * domain;

  computeLayout.$.nextTrianglePos[index] = TriangleData(self);
};

export const workgroupSize = 64;

const simulateMain = tgpu.computeFn({
  workgroupSize: [workgroupSize],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  if (input.gid.x >= triangleAmount) {
    return;
  }
  simulate(input.gid.x);
});

export const shaderModules = {
  renderWgsl: [mainVert, mainFrag],
  simulateWgsl: [simulateMain],
};
