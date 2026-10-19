/**
 * Shader-only TypeGPU code for the slime-mold-3d example. Only ever imported at build time
 * by scripts/pregen.ts, which resolves `shaderModules` into WGSL strings.
 */
import { randf } from '@typegpu/noise';
import { tgpu, common, d, std } from 'typegpu';

export const VOLUME_SIZE = 256;
export const NUM_AGENTS = 800_000;
export const AGENT_WORKGROUP_SIZE = 64;
export const BLUR_WORKGROUP_SIZE = [4, 4, 4];
// Same as what `root.createGuardedComputePipeline` picks for a 1D callback
export const INIT_WORKGROUP_SIZE = 256;

const RAYMARCH_STEPS = 48;
const DENSITY_MULTIPLIER = 0.1;

const RANDOM_DIRECTION_WEIGHT = 0.3;
const CENTER_BIAS_WEIGHT = 0.7;

const resolution = d.vec3f(VOLUME_SIZE);

const Camera = d.struct({
  viewProj: d.mat4x4f,
  invViewProj: d.mat4x4f,
  position: d.vec3f,
});

const Agent = d.struct({
  position: d.vec3f,
  direction: d.vec3f,
});

const Params = d.struct({
  deltaTime: d.f32,
  moveSpeed: d.f32,
  sensorAngle: d.f32,
  sensorDistance: d.f32,
  turnSpeed: d.f32,
  evaporationRate: d.f32,
});

// #region Agent initialization

const initLayout = tgpu.bindGroupLayout({
  agentsA: { storage: d.arrayOf(Agent), access: 'mutable' },
  agentsB: { storage: d.arrayOf(Agent), access: 'mutable' },
});

const initAgent = tgpu.fn([d.u32])((x) => {
  'use gpu';
  randf.seed(x / NUM_AGENTS);
  const pos = randf.inUnitSphere() * (resolution.x / 4) + resolution / 2;
  const center = resolution / 2;
  const dir = std.normalize(center - pos);
  initLayout.$.agentsA[x] = Agent({ position: pos, direction: dir });
  initLayout.$.agentsB[x] = Agent({ position: pos, direction: dir });
});

const initAgents = tgpu.computeFn({
  workgroupSize: [INIT_WORKGROUP_SIZE],
  in: { id: d.builtin.globalInvocationId },
})(({ id }) => {
  'use gpu';
  if (id.x >= NUM_AGENTS) {
    return;
  }
  initAgent(id.x);
});

// #endregion

const computeLayout = tgpu.bindGroupLayout({
  oldAgents: { storage: d.arrayOf(Agent), access: 'readonly' },
  oldState: { storageTexture: d.textureStorage3d('r32float', 'read-only') },
  newAgents: { storage: d.arrayOf(Agent), access: 'mutable' },
  newState: { storageTexture: d.textureStorage3d('r32float', 'write-only') },
  params: { uniform: Params },
});

const blurLayout = tgpu.bindGroupLayout({
  oldState: { texture: d.texture3d() },
  newState: { storageTexture: d.textureStorage3d('r32float', 'write-only') },
  sampler: { sampler: 'filtering' },
  params: { uniform: Params },
});

const renderLayout = tgpu.bindGroupLayout({
  state: { texture: d.texture3d() },
  sampler: { sampler: 'filtering' },
  camera: { uniform: Camera },
});

const SenseResult = d.struct({
  weightedDir: d.vec3f,
  totalWeight: d.f32,
});

const RayBoxResult = d.struct({
  tNear: d.f32,
  tFar: d.f32,
  hit: d.bool,
});

const getPerpendicular = (dir: d.v3f) => {
  'use gpu';
  let axis = d.vec3f(1, 0, 0);

  // Find the axis that is least aligned
  const absX = std.abs(dir.x);
  const absY = std.abs(dir.y);
  const absZ = std.abs(dir.z);

  if (absY <= absX && absY <= absZ) {
    axis = d.vec3f(0, 1, 0);
  } else if (absZ <= absX && absZ <= absY) {
    axis = d.vec3f(0, 0, 1);
  }

  return std.normalize(std.cross(dir, axis));
};

const numSamples = 8;
const sense3D = (pos: d.v3f, direction: d.v3f) => {
  'use gpu';
  const dims = std.textureDimensions(computeLayout.$.oldState);
  const dimsf = d.vec3f(dims);

  let weightedDir = d.vec3f();
  let totalWeight = d.f32();

  const perp1 = getPerpendicular(direction);
  const perp2 = std.cross(direction, perp1);

  for (const i of tgpu.unroll(std.range(numSamples))) {
    const theta = (i / numSamples) * 2 * Math.PI;

    const coneOffset = perp1 * std.cos(theta) + perp2 * std.sin(theta);
    const sensorDir = std.normalize(
      direction + coneOffset * std.sin(computeLayout.$.params.sensorAngle),
    );

    const sensorPos = pos + sensorDir * computeLayout.$.params.sensorDistance;
    const sensorPosInt = d.vec3u(std.clamp(sensorPos, d.vec3f(), dimsf - 1));

    const weight = std.textureLoad(computeLayout.$.oldState, sensorPosInt).x;

    weightedDir = weightedDir + sensorDir * weight;
    totalWeight = totalWeight + weight;
  }

  return SenseResult({ weightedDir, totalWeight });
};

const updateAgents = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [AGENT_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  if (gid.x >= NUM_AGENTS) {
    return;
  }

  randf.seed(gid.x / NUM_AGENTS + 0.1);

  const dims = std.textureDimensions(computeLayout.$.oldState);
  const dimsf = d.vec3f(dims);

  const agent = computeLayout.$.oldAgents[gid.x];

  let direction = std.normalize(agent.direction);
  const senseResult = sense3D(agent.position, direction);
  const targetDirection = std.select(
    randf.onHemisphere(direction),
    std.normalize(senseResult.weightedDir),
    senseResult.totalWeight > 0.01,
  );
  direction = std.normalize(
    direction +
      targetDirection * computeLayout.$.params.turnSpeed * computeLayout.$.params.deltaTime,
  );

  const newPos =
    agent.position + direction * computeLayout.$.params.moveSpeed * computeLayout.$.params.deltaTime;

  const center = dimsf / 2;

  if (newPos.x < 0 || newPos.x >= dimsf.x) {
    newPos.x = std.clamp(newPos.x, 0, dimsf.x - 1);
    let normal = d.vec3f(1, 0, 0);
    if (newPos.x > 1) {
      normal = d.vec3f(-1, 0, 0);
    }
    const randomDir = randf.inHemisphere(normal);
    const toCenter = std.normalize(center - newPos);

    direction = std.normalize(randomDir * RANDOM_DIRECTION_WEIGHT + toCenter * CENTER_BIAS_WEIGHT);
  }
  if (newPos.y < 0 || newPos.y >= dimsf.y) {
    newPos.y = std.clamp(newPos.y, 0, dimsf.y - 1);
    let normal = d.vec3f(0, 1, 0);
    if (newPos.y > 1) {
      normal = d.vec3f(0, -1, 0);
    }
    const randomDir = randf.inHemisphere(normal);
    const toCenter = std.normalize(center - newPos);
    direction = std.normalize(randomDir * RANDOM_DIRECTION_WEIGHT + toCenter * CENTER_BIAS_WEIGHT);
  }
  if (newPos.z < 0 || newPos.z >= dimsf.z) {
    newPos.z = std.clamp(newPos.z, 0, dimsf.z - 1);
    let normal = d.vec3f(0, 0, 1);
    if (newPos.z > 1) {
      normal = d.vec3f(0, 0, -1);
    }
    const randomDir = randf.inHemisphere(normal);
    const toCenter = std.normalize(center - newPos);
    direction = std.normalize(randomDir * RANDOM_DIRECTION_WEIGHT + toCenter * CENTER_BIAS_WEIGHT);
  }

  computeLayout.$.newAgents[gid.x] = Agent({
    position: newPos,
    direction,
  });

  const oldState = std.textureLoad(computeLayout.$.oldState, d.vec3u(newPos)).x;
  const newState = oldState + 1;
  std.textureStore(computeLayout.$.newState, d.vec3u(newPos), d.vec4f(newState, 0, 0, 1));
});

const getSummand = tgpu.fn(
  [d.vec3f, d.vec3f],
  d.f32,
)(
  (uv, offset) =>
    std.textureSampleLevel(blurLayout.$.oldState, blurLayout.$.sampler, uv.add(offset), 0).x,
);

const blur = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: BLUR_WORKGROUP_SIZE,
})(({ gid }) => {
  'use gpu';
  const dims = d.vec3u(std.textureDimensions(blurLayout.$.oldState));
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) return;

  const uv = (d.vec3f(gid) + 0.5) / d.vec3f(dims);

  let sum = d.f32();

  sum += getSummand(uv, d.vec3f(-1, 0, 0) / d.vec3f(dims));
  sum += getSummand(uv, d.vec3f(1, 0, 0) / d.vec3f(dims));
  sum += getSummand(uv, d.vec3f(0, -1, 0) / d.vec3f(dims));
  sum += getSummand(uv, d.vec3f(0, 1, 0) / d.vec3f(dims));
  sum += getSummand(uv, d.vec3f(0, 0, -1) / d.vec3f(dims));
  sum += getSummand(uv, d.vec3f(0, 0, 1) / d.vec3f(dims));

  const blurred = sum / 6;
  const newValue = std.saturate(blurred - blurLayout.$.params.evaporationRate);
  std.textureStore(blurLayout.$.newState, gid.xyz, d.vec4f(newValue, 0, 0, 1));
});

// Ray-box intersection
const rayBoxIntersection = (rayOrigin: d.v3f, rayDir: d.v3f, boxMin: d.v3f, boxMax: d.v3f) => {
  'use gpu';
  const invDir = 1 / rayDir;
  const t0 = (boxMin - rayOrigin) * invDir;
  const t1 = (boxMax - rayOrigin) * invDir;
  const tmin = std.min(t0, t1);
  const tmax = std.max(t0, t1);
  const tNear = std.max(tmin.x, tmin.y, tmin.z);
  const tFar = std.min(tmax.x, tmax.y, tmax.z);
  const hit = tFar >= tNear && tFar >= 0;
  return RayBoxResult({ tNear, tFar, hit });
};

const fragmentShader = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  randf.seed2(uv);
  const ndc = d.vec2f(uv.x * 2 - 1, 1 - uv.y * 2);
  const ndcNear = d.vec4f(ndc, -1, 1);
  const ndcFar = d.vec4f(ndc, 1, 1);

  const worldNear = renderLayout.$.camera.invViewProj * ndcNear;
  const worldFar = renderLayout.$.camera.invViewProj * ndcFar;

  const rayOrigin = worldNear.xyz / worldNear.w;
  const rayEnd = worldFar.xyz / worldFar.w;
  const rayDir = std.normalize(rayEnd - rayOrigin);

  const boxMin = d.vec3f();
  const boxMax = resolution;
  const isect = rayBoxIntersection(rayOrigin, rayDir, boxMin, boxMax);
  if (!isect.hit) {
    return d.vec4f();
  }

  const jitter = randf.sample() * 20;
  const tStart = std.max(isect.tNear + jitter, jitter);
  const tEnd = isect.tFar;

  const intersectionLength = tEnd - tStart;
  const baseStepsPerUnit = d.f32(0.3);
  const minSteps = d.i32(8);
  const maxSteps = d.i32(RAYMARCH_STEPS);

  const adaptiveSteps = std.clamp(d.i32(intersectionLength * baseStepsPerUnit), minSteps, maxSteps);

  const numSteps = adaptiveSteps;
  const stepSize = intersectionLength / d.f32(numSteps);

  const thresholdLo = d.f32(0.06);
  const thresholdHi = d.f32(0.25);
  const gamma = d.f32(1.4);
  const sigmaT = d.f32(DENSITY_MULTIPLIER);

  const albedo = d.vec3f(0.57, 0.44, 0.96);

  let transmittance = d.f32(1);
  let accum = d.vec3f();

  const TMin = d.f32(1e-3);

  let i = d.i32(0);
  while (i < numSteps && transmittance > TMin) {
    const t = tStart + (d.f32(i) + 0.5) * stepSize;
    const pos = rayOrigin + rayDir * t;
    const texCoord = pos / resolution;

    const sampleValue = std.textureSampleLevel(
      renderLayout.$.state,
      renderLayout.$.sampler,
      texCoord,
      0,
    ).x;

    const d0 = std.smoothstep(thresholdLo, thresholdHi, sampleValue);
    const density = d0 ** gamma;

    const alphaSrc = 1 - std.exp(-sigmaT * density * stepSize);

    const contrib = albedo * alphaSrc;

    accum += contrib * transmittance;
    transmittance = transmittance * (1 - alphaSrc);

    i += 1;
  }

  const alpha = 1 - transmittance;
  return d.vec4f(accum, alpha);
});

export const shaderModules = {
  initWgsl: [initAgents],
  updateAgentsWgsl: [updateAgents],
  blurWgsl: [blur],
  renderWgsl: [common.fullScreenTriangle, fragmentShader],
};
