/**
 * Shader-only TypeGPU code for the jelly-slider example. Only ever imported at build time
 * by scripts/pregen.ts, which resolves `shaderModules` into WGSL strings.
 *
 * Every resource is accessed through a bind group layout (no root-owned resources).
 */
import * as sdf from '@typegpu/sdf';
import { sdBezier } from '@typegpu/sdf';
import { randf } from '@typegpu/noise';
import { tgpu, common, d, std } from 'typegpu';

import {
  AMBIENT_INTENSITY,
  AO_BIAS,
  AO_INTENSITY,
  AO_RADIUS,
  AO_STEPS,
  BEZIER_TEXTURE_SIZE,
  BEZIER_WORKGROUP_SIZE,
  JELLY_IOR,
  JELLY_SCATTER_STRENGTH,
  LINE_HALF_THICK,
  LINE_RADIUS,
  MAX_DIST,
  MAX_STEPS,
  NUM_POINTS,
  SLIDER_BBOX,
  SPECULAR_INTENSITY,
  SPECULAR_POWER,
  SURF_DIST,
  TAA_WORKGROUP_SIZE,
} from './constants.ts';

// Ground material constants
const GROUND_ALBEDO = d.vec3f(1);

// Lighting constants
const AMBIENT_COLOR = d.vec3f(0.6);

// #region Data types (dataTypes.ts)

const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
});

const ObjectType = {
  SLIDER: 1,
  BACKGROUND: 2,
} as const;

const HitInfo = d.struct({
  distance: d.f32,
  objectType: d.i32,
  t: d.f32,
});

const LineInfo = d.struct({
  t: d.f32,
  distance: d.f32,
  normal: d.vec2f,
});

const BoxIntersection = d.struct({
  hit: d.bool,
  tMin: d.f32,
  tMax: d.f32,
});

const Ray = d.struct({
  origin: d.vec3f,
  direction: d.vec3f,
});

const SdfBbox = d.struct({
  left: d.f32,
  right: d.f32,
  bottom: d.f32,
  top: d.f32,
});

const Camera = d.struct({
  view: d.mat4x4f,
  proj: d.mat4x4f,
  viewInv: d.mat4x4f,
  projInv: d.mat4x4f,
});

// #endregion

// #region Utils (utils.ts)

const fresnelSchlick = (cosTheta: number, ior1: number, ior2: number) => {
  'use gpu';
  const r0 = std.pow((ior1 - ior2) / (ior1 + ior2), 2.0);
  return r0 + (1.0 - r0) * std.pow(1.0 - cosTheta, 5.0);
};

const beerLambert = (sigma: d.v3f, dist: number) => {
  'use gpu';
  return std.exp(std.mul(sigma, -dist));
};

const intersectBox = (rayOrigin: d.v3f, rayDirection: d.v3f, boxMin: d.v3f, boxMax: d.v3f) => {
  'use gpu';
  const invDir = d.vec3f(1.0).div(rayDirection);

  const t1 = std.sub(boxMin, rayOrigin).mul(invDir);
  const t2 = std.sub(boxMax, rayOrigin).mul(invDir);

  const tMinVec = std.min(t1, t2);
  const tMaxVec = std.max(t1, t2);

  const tMin = std.max(tMinVec.x, tMinVec.y, tMinVec.z);
  const tMax = std.min(tMaxVec.x, tMaxVec.y, tMaxVec.z);

  const result = BoxIntersection();
  result.hit = tMax >= tMin && tMax >= 0.0;
  result.tMin = tMin;
  result.tMax = tMax;

  return result;
};

// #endregion

// #region Slider bezier texture (slider.ts)

const bezierLayout = tgpu.bindGroupLayout({
  bezierWriteView: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  points: { storage: d.arrayOf(d.vec2f, NUM_POINTS) },
  controlPoints: { storage: d.arrayOf(d.vec2f, NUM_POINTS - 1) },
});

const { left, right, bottom, top } = SLIDER_BBOX;

const computeBezier = (x: number, y: number) => {
  'use gpu';
  const size = std.textureDimensions(bezierLayout.$.bezierWriteView);
  const pixelUV = d.vec2f(x, y).add(0.5).div(d.vec2f(size));

  const sliderPos = d.vec2f(left + pixelUV.x * (right - left), top - pixelUV.y * (top - bottom));

  let minDist = d.f32(1e10);
  let closestSegment = d.i32(0);
  let closestT = d.f32(0);

  const epsilon = d.f32(0.03);
  const xOffset = d.vec2f(epsilon, 0.0);
  const yOffset = d.vec2f(0.0, epsilon);

  let xPlusDist = d.f32(1e10);
  let xMinusDist = d.f32(1e10);
  let yPlusDist = d.f32(1e10);
  let yMinusDist = d.f32(1e10);

  for (let i = 0; i < bezierLayout.$.points.length - 1; i++) {
    const A = bezierLayout.$.points[i];
    const B = bezierLayout.$.points[i + 1];
    const C = bezierLayout.$.controlPoints[i];

    const dist = sdBezier(sliderPos, A, C, B);
    if (dist < minDist) {
      minDist = dist;
      closestSegment = i;

      const AB = B.sub(A);
      const AP = sliderPos.sub(A);
      const ABLength = std.length(AB);

      if (ABLength > 0.0) {
        closestT = std.clamp(std.dot(AP, AB) / (ABLength * ABLength), 0.0, 1.0);
      } else {
        closestT = 0.0;
      }
    }

    xPlusDist = std.min(xPlusDist, sdBezier(sliderPos.add(xOffset), A, C, B));
    xMinusDist = std.min(xMinusDist, sdBezier(sliderPos.sub(xOffset), A, C, B));
    yPlusDist = std.min(yPlusDist, sdBezier(sliderPos.add(yOffset), A, C, B));
    yMinusDist = std.min(yMinusDist, sdBezier(sliderPos.sub(yOffset), A, C, B));
  }

  const overallProgress =
    (d.f32(closestSegment) + closestT) / d.f32(bezierLayout.$.points.length - 1);

  const normalX = (xPlusDist - xMinusDist) / (2.0 * epsilon);
  const normalY = (yPlusDist - yMinusDist) / (2.0 * epsilon);

  std.textureStore(
    bezierLayout.$.bezierWriteView,
    d.vec2u(x, y),
    d.vec4f(minDist, overallProgress, normalX, normalY),
  );
};

// Replaces `root.createGuardedComputePipeline(...).dispatchThreads(...BEZIER_TEXTURE_SIZE)`
const computeBezierMain = tgpu.computeFn({
  workgroupSize: [...BEZIER_WORKGROUP_SIZE],
  in: { id: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  if (input.id.x >= BEZIER_TEXTURE_SIZE[0] || input.id.y >= BEZIER_TEXTURE_SIZE[1]) {
    return;
  }
  computeBezier(input.id.x, input.id.y);
});

// #endregion

// #region TAA (taa.ts)

const taaResolveLayout = tgpu.bindGroupLayout({
  currentTexture: {
    texture: d.texture2d(),
  },
  historyTexture: {
    texture: d.texture2d(),
  },
  outputTexture: {
    storageTexture: d.textureStorage2d('rgba8unorm', 'write-only'),
  },
});

const taaResolveFn = tgpu.computeFn({
  workgroupSize: [...TAA_WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})(({ gid }) => {
  const currentColor = std.textureLoad(taaResolveLayout.$.currentTexture, d.vec2u(gid.xy), 0);

  const historyColor = std.textureLoad(taaResolveLayout.$.historyTexture, d.vec2u(gid.xy), 0);

  let minColor = d.vec3f(9999.0);
  let maxColor = d.vec3f(-9999.0);

  const dimensions = std.textureDimensions(taaResolveLayout.$.currentTexture);

  for (const x of tgpu.unroll([-1, 0, 1])) {
    for (const y of tgpu.unroll([-1, 0, 1])) {
      const sampleCoord = d.vec2i(gid.xy).add(d.vec2i(x, y));
      const clampedCoord = std.clamp(
        sampleCoord,
        d.vec2i(0, 0),
        d.vec2i(dimensions.xy).sub(d.vec2i(1)),
      );

      const neighborColor = std.textureLoad(taaResolveLayout.$.currentTexture, clampedCoord, 0);

      minColor = std.min(minColor, neighborColor.rgb);
      maxColor = std.max(maxColor, neighborColor.rgb);
    }
  }

  const historyColorClamped = std.clamp(historyColor.rgb, minColor, maxColor);

  const uv = d.vec2f(gid.xy).div(d.vec2f(dimensions.xy));

  const textRegionMinX = d.f32(0.71);
  const textRegionMaxX = d.f32(0.85);
  const textRegionMinY = d.f32(0.47);
  const textRegionMaxY = d.f32(0.55);

  const borderSize = d.f32(0.02);

  const fadeInX = std.smoothstep(textRegionMinX - borderSize, textRegionMinX + borderSize, uv.x);
  const fadeOutX =
    d.f32(1.0) - std.smoothstep(textRegionMaxX - borderSize, textRegionMaxX + borderSize, uv.x);
  const fadeInY = std.smoothstep(textRegionMinY - borderSize, textRegionMinY + borderSize, uv.y);
  const fadeOutY =
    d.f32(1.0) - std.smoothstep(textRegionMaxY - borderSize, textRegionMaxY + borderSize, uv.y);

  const inTextRegion = fadeInX * fadeOutX * fadeInY * fadeOutY;
  const blendFactor = std.mix(d.f32(0.9), d.f32(0.7), inTextRegion);

  const resolvedColor = d.vec4f(std.mix(currentColor.rgb, historyColorClamped, blendFactor), 1.0);

  std.textureStore(taaResolveLayout.$.outputTexture, d.vec2u(gid.x, gid.y), resolvedColor);
});

// #endregion

// #region Scene (scene.ts)

const SceneParams = d.struct({
  seed: d.vec2f,
  jellyColor: d.vec4f,
  light: DirectionalLight,
  blurEnabled: d.u32,
});

const layout = tgpu.bindGroupLayout({
  filteringSampler: { sampler: 'filtering', sampleType: 'float' },
  bezierTexture: { texture: d.texture2d(d.f32) },
  digitsTexture: { texture: d.texture2dArray(d.f32) },
  endCap: { uniform: d.vec4f },
  sceneParams: { uniform: SceneParams },
  // Root-owned `camera.cameraUniform` in the runtime variant
  camera: { uniform: Camera },
});

function getRay(ndc: d.v2f) {
  'use gpu';
  const clipPos = d.vec4f(ndc.x, ndc.y, -1.0, 1.0);

  const invView = layout.$.camera.viewInv;
  const invProj = layout.$.camera.projInv;

  const viewPos = invProj * clipPos;
  const viewPosNormalized = d.vec4f(viewPos.xyz / viewPos.w, 1.0);

  const worldPos = invView * viewPosNormalized;

  const rayOrigin = invView.columns[3].xyz;
  const rayDir = std.normalize(worldPos.xyz - rayOrigin);

  return Ray({
    origin: rayOrigin,
    direction: rayDir,
  });
}

const GroundParams = {
  groundThickness: 0.03,
  groundRoundness: 0.02,
};

function rectangleCutoutDist(position: d.v2f) {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;

  return sdf.sdRoundedBox2d(
    position,
    d.vec2f(1 + groundRoundness, 0.2 + groundRoundness),
    0.2 + groundRoundness,
  );
}

function getMainSceneDist(position: d.v3f) {
  'use gpu';
  const groundThickness = GroundParams.groundThickness;
  const groundRoundness = GroundParams.groundRoundness;

  return sdf.opUnion(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0.06),
    sdf.opExtrudeY(position, -rectangleCutoutDist(position.xz), groundThickness - groundRoundness) -
      groundRoundness,
  );
}

// Build-time value, the runtime variant binds the same `tgpu.const` to this accessor
const sliderBBox = tgpu.const(SdfBbox, SLIDER_BBOX);
const sliderBBoxAccess = tgpu.accessor(SdfBbox, sliderBBox);
function sdInflatedPolyline2D(p: d.v2f) {
  'use gpu';
  const bbox = sliderBBoxAccess.$;

  const uv = d.vec2f(
    (p.x - bbox.left) / (bbox.right - bbox.left),
    (bbox.top - p.y) / (bbox.top - bbox.bottom),
  );
  const clampedUV = std.saturate(uv);

  const sampledColor = std.textureSampleLevel(
    layout.$.bezierTexture,
    layout.$.filteringSampler,
    clampedUV,
    0,
  );
  const segUnsigned = sampledColor.x;
  const progress = sampledColor.y;
  const normal = sampledColor.zw;

  return LineInfo({
    t: progress,
    distance: segUnsigned,
    normal: normal,
  });
}

function cap3D(position: d.v3f) {
  'use gpu';
  const secondLastPoint = layout.$.endCap.xy;
  const lastPoint = layout.$.endCap.zw;

  const angle = std.atan2(lastPoint.y - secondLastPoint.y, lastPoint.x - secondLastPoint.x);
  const rot = d.mat2x2f(std.cos(angle), -std.sin(angle), std.sin(angle), std.cos(angle));

  let pieP = position - d.vec3f(secondLastPoint, 0);
  pieP = d.vec3f(rot * pieP.xy, pieP.z);
  const hmm = sdf.sdPie(pieP.zx, d.vec2f(1, 0), LINE_HALF_THICK);
  return sdf.opExtrudeY(pieP, hmm, 0.001) - LINE_RADIUS;
}

function sliderSdf3D(position: d.v3f) {
  'use gpu';
  const poly2D = sdInflatedPolyline2D(position.xy);

  let finalDist = d.f32(0.0);
  if (poly2D.t > 0.94) {
    finalDist = cap3D(position);
  } else {
    const body = sdf.opExtrudeZ(position, poly2D.distance, LINE_HALF_THICK) - LINE_RADIUS;
    finalDist = body;
  }

  return LineInfo({
    t: poly2D.t,
    distance: finalDist,
    normal: poly2D.normal,
  });
}

function sliderApproxDist(position: d.v3f) {
  'use gpu';
  const bbox = sliderBBoxAccess.$;

  const p = position.xy;
  if (p.x < bbox.left || p.x > bbox.right || p.y < bbox.bottom || p.y > bbox.top) {
    return 1e9;
  }

  const poly2D = sdInflatedPolyline2D(p);
  const dist3D = sdf.opExtrudeZ(position, poly2D.distance, LINE_HALF_THICK) - LINE_RADIUS;

  return dist3D;
}

function getSceneDist(position: d.v3f) {
  'use gpu';
  const mainScene = getMainSceneDist(position);
  const poly3D = sliderSdf3D(position);

  const hitInfo = HitInfo();

  if (poly3D.distance < mainScene) {
    hitInfo.distance = poly3D.distance;
    hitInfo.objectType = ObjectType.SLIDER;
    hitInfo.t = poly3D.t;
  } else {
    hitInfo.distance = mainScene;
    hitInfo.objectType = ObjectType.BACKGROUND;
  }
  return hitInfo;
}

function getSceneDistForAO(position: d.v3f) {
  'use gpu';
  const mainScene = getMainSceneDist(position);
  const sliderApprox = sliderApproxDist(position);
  return std.min(mainScene, sliderApprox);
}

const sdfSlot = tgpu.slot<(pos: d.v3f) => number>();

const getNormalFromSdf = tgpu.fn(
  [d.vec3f, d.f32],
  d.vec3f,
)((position, epsilon) => {
  'use gpu';
  const k = d.vec3f(1, -1, 0);

  const offset1 = k.xyy * epsilon;
  const offset2 = k.yyx * epsilon;
  const offset3 = k.yxy * epsilon;
  const offset4 = k.xxx * epsilon;

  const sample1 = offset1 * sdfSlot.$(position + offset1);
  const sample2 = offset2 * sdfSlot.$(position + offset2);
  const sample3 = offset3 * sdfSlot.$(position + offset3);
  const sample4 = offset4 * sdfSlot.$(position + offset4);

  return std.normalize(sample1 + sample2 + sample3 + sample4);
});

const getNormalCapSdf = getNormalFromSdf.with(sdfSlot, cap3D);
const getNormalMainSdf = getNormalFromSdf.with(sdfSlot, getMainSceneDist);

function getNormalCap(pos: d.v3f) {
  'use gpu';
  return getNormalCapSdf(pos, 0.01);
}

function getNormalMain(position: d.v3f) {
  'use gpu';
  if (std.abs(position.z) > 0.22 || std.abs(position.x) > 1.02) {
    return d.vec3f(0, 1, 0);
  }
  return getNormalMainSdf(position, 0.0001);
}

function getSliderNormal(position: d.v3f, hitInfo: d.Infer<typeof HitInfo>) {
  'use gpu';
  const poly2D = sdInflatedPolyline2D(position.xy);
  const gradient2D = poly2D.normal;

  const threshold = LINE_HALF_THICK * 0.85;
  const absZ = std.abs(position.z);
  const zDistance = std.max(
    0,
    ((absZ - threshold) * LINE_HALF_THICK) / (LINE_HALF_THICK - threshold),
  );
  const edgeDistance = LINE_RADIUS - poly2D.distance;

  const edgeContrib = 0.9;
  const zContrib = 1.0 - edgeContrib;

  const zDirection = std.sign(position.z);
  const zAxisVector = d.vec3f(0, 0, zDirection);

  const edgeBlendDistance = edgeContrib * LINE_RADIUS + zContrib * LINE_HALF_THICK;

  const blendFactor = std.smoothstep(
    edgeBlendDistance,
    0.0,
    zDistance * zContrib + edgeDistance * edgeContrib,
  );

  const normal2D = d.vec3f(gradient2D.xy, 0);
  const blendedNormal = std.mix(zAxisVector, normal2D, blendFactor * 0.5 + 0.5);

  let normal = std.normalize(blendedNormal);

  if (hitInfo.t > 0.94) {
    const ratio = (hitInfo.t - 0.94) / 0.02;
    const fullNormal = getNormalCap(position);
    normal = std.normalize(std.mix(normal, fullNormal, ratio));
  }

  return normal;
}

function getNormal(position: d.v3f, hitInfo: d.Infer<typeof HitInfo>) {
  'use gpu';
  if (hitInfo.objectType === ObjectType.SLIDER && hitInfo.t < 0.96) {
    return getSliderNormal(position, hitInfo);
  }

  return std.select(
    getNormalCap(position),
    getNormalMain(position),
    hitInfo.objectType === ObjectType.BACKGROUND,
  );
}

function sqLength(a: d.v3f) {
  'use gpu';
  return std.dot(a, a);
}

function getFakeShadow(position: d.v3f, lightDir: d.v3f): d.v3f {
  'use gpu';
  const jellyColor = layout.$.sceneParams.jellyColor;
  const endCapX = layout.$.endCap.x;

  if (position.y < -GroundParams.groundThickness) {
    // Applying darkening under the ground (the shadow cast by the upper ground layer)
    const fadeSharpness = d.f32(30);
    const inset = 0.02;
    const cutout = rectangleCutoutDist(position.xz) + inset;
    const edgeDarkening = std.saturate(1 - cutout * fadeSharpness);

    // Applying a slight gradient based on the light direction
    const lightGradient = std.saturate(-position.z * 4 * lightDir.z + 1);

    return d.vec3f(1) * edgeDarkening * (lightGradient * 0.5);
  } else {
    const finalUV = d.vec2f(
      (position.x - position.z * lightDir.x * std.sign(lightDir.z)) * 0.5 + 0.5,
      1 - (-position.z / lightDir.z) * 0.5 - 0.2,
    );
    const data = std.textureSampleLevel(
      layout.$.bezierTexture,
      layout.$.filteringSampler,
      finalUV,
      0,
    );

    // Normally it would be just data.y, but there transition is too sudden when the jelly is bunched up.
    // To mitigate this, we transition into a position-based transition.
    const jellySaturation = std.mix(0, data.y, std.saturate(position.x * 1.5 + 1.1));
    const shadowColor = std.mix(d.vec3f(0, 0, 0), jellyColor.rgb, jellySaturation);

    const contrast = 20 * std.saturate(finalUV.y) * (0.8 + endCapX * 0.2);
    const shadowOffset = -0.3;
    const featherSharpness = d.f32(10);
    const uvEdgeFeather =
      std.saturate(finalUV.x * featherSharpness) *
      std.saturate((1 - finalUV.x) * featherSharpness) *
      std.saturate((1 - finalUV.y) * featherSharpness) *
      std.saturate(finalUV.y);
    const influence = std.saturate((1 - lightDir.y) * 2) * uvEdgeFeather;
    return std.mix(
      d.vec3f(1),
      std.mix(shadowColor, d.vec3f(1), std.saturate(data.x * contrast + shadowOffset)),
      influence,
    );
  }
}

function calculateAO(position: d.v3f, normal: d.v3f) {
  'use gpu';
  let totalOcclusion = d.f32(0.0);
  let sampleWeight = d.f32(1.0);
  const stepDistance = AO_RADIUS / AO_STEPS;

  for (let i = 1; i <= AO_STEPS; i++) {
    const sampleHeight = stepDistance * d.f32(i);
    const samplePosition = position + normal * sampleHeight;
    const distanceToSurface = getSceneDistForAO(samplePosition) - AO_BIAS;
    const occlusionContribution = std.max(0.0, sampleHeight - distanceToSurface);
    totalOcclusion += occlusionContribution * sampleWeight;
    sampleWeight *= 0.5;
    if (totalOcclusion > AO_RADIUS / AO_INTENSITY) {
      break;
    }
  }

  const rawAO = 1.0 - (AO_INTENSITY * totalOcclusion) / AO_RADIUS;
  return std.saturate(rawAO);
}

function calculateLighting(hitPosition: d.v3f, normal: d.v3f, rayOrigin: d.v3f) {
  'use gpu';
  const lightDir = std.neg(layout.$.sceneParams.light.direction);

  const fakeShadow = getFakeShadow(hitPosition, lightDir);
  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const viewDir = std.normalize(rayOrigin - hitPosition);
  const reflectDir = std.reflect(std.neg(lightDir), normal);
  const specularFactor = std.max(std.dot(viewDir, reflectDir), 0) ** SPECULAR_POWER;
  const specular = layout.$.sceneParams.light.color * (specularFactor * SPECULAR_INTENSITY);

  const baseColor = d.vec3f(0.9);

  const directionalLight = baseColor * layout.$.sceneParams.light.color * diffuse * fakeShadow;
  const ambientLight = baseColor * AMBIENT_COLOR * AMBIENT_INTENSITY;

  const finalSpecular = specular * fakeShadow;

  return std.saturate(directionalLight + ambientLight + finalSpecular);
}

function applyAO(litColor: d.v3f, hitPosition: d.v3f, normal: d.v3f) {
  'use gpu';
  const ao = calculateAO(hitPosition, normal);
  const finalColor = litColor * ao;
  return d.vec4f(finalColor, 1.0);
}

function rayMarchNoJelly(rayOrigin: d.v3f, rayDirection: d.v3f) {
  'use gpu';
  let distanceFromOrigin = d.f32();
  let hit = d.f32();

  for (let i = 0; i < 6; i++) {
    const p = rayOrigin + rayDirection * distanceFromOrigin;
    hit = getMainSceneDist(p);
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST * 10) {
      break;
    }
  }

  if (distanceFromOrigin < MAX_DIST) {
    return renderBackground(
      rayOrigin,
      rayDirection,
      distanceFromOrigin,
      d.f32(layout.$.sceneParams.blurEnabled === 1 ? 0.87 : 0),
    ).rgb;
  }
  return d.vec3f();
}

function renderPercentageOnGround(hitPosition: d.v3f, center: d.v3f, percentage: number) {
  'use gpu';

  const textWidth = 0.38;
  const textHeight = 0.33;

  if (
    std.abs(hitPosition.x - center.x) > textWidth * 0.5 ||
    std.abs(hitPosition.z - center.z) > textHeight * 0.5
  ) {
    return d.vec4f();
  }

  const localX = hitPosition.x - center.x;
  const localZ = hitPosition.z - center.z;

  const uvX = (localX + textWidth * 0.5) / textWidth;
  const uvZ = (localZ + textHeight * 0.5) / textHeight;

  if (uvX < 0.0 || uvX > 1.0 || uvZ < 0.0 || uvZ > 1.0) {
    return d.vec4f();
  }

  return std.textureSampleLevel(
    layout.$.digitsTexture,
    layout.$.filteringSampler,
    d.vec2f(uvX, uvZ),
    percentage,
    0,
  );
}

function renderBackground(
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  backgroundHitDist: number,
  offset: number,
) {
  'use gpu';
  const hitPosition = rayOrigin + rayDirection * backgroundHitDist;

  const percentageSample = renderPercentageOnGround(
    hitPosition,
    d.vec3f(0.72, 0, 0),
    d.u32((layout.$.endCap.x + 0.43) * 84),
  );

  let highlights = d.f32();

  const highlightWidth = d.f32(1);
  const highlightHeight = 0.2;
  let offsetX = d.f32();
  let offsetZ = d.f32(0.05);

  const lightDir = layout.$.sceneParams.light.direction;
  const causticScale = 0.2;
  offsetX -= lightDir.x * causticScale;
  offsetZ += lightDir.z * causticScale;

  const endCapX = layout.$.endCap.x;
  const sliderStretch = (endCapX + 1) * 0.5;

  if (
    std.abs(hitPosition.x + offsetX) < highlightWidth &&
    std.abs(hitPosition.z + offsetZ) < highlightHeight
  ) {
    const uvX_orig = ((hitPosition.x + offsetX + highlightWidth * 2) / highlightWidth) * 0.5;
    const uvZ_orig = ((hitPosition.z + offsetZ + highlightHeight * 2) / highlightHeight) * 0.5;

    const centeredUV = d.vec2f(uvX_orig - 0.5, uvZ_orig - 0.5);
    const finalUV = d.vec2f(centeredUV.x, 1 - (std.abs(centeredUV.y - 0.5) * 2) ** 2 * 0.3);

    const density = std.max(
      0,
      (std.textureSampleLevel(layout.$.bezierTexture, layout.$.filteringSampler, finalUV, 0).x -
        0.25) *
        8,
    );

    const fadeX = std.smoothstep(0, -0.2, hitPosition.x - endCapX);
    const fadeZ = 1 - (std.abs(centeredUV.y - 0.5) * 2) ** 3;
    const fadeStretch = std.saturate(1 - sliderStretch);
    const edgeFade = std.saturate(fadeX) * std.saturate(fadeZ) * fadeStretch;

    highlights = (density ** 3 * edgeFade * 3 * (1 + lightDir.z)) / 1.5;
  }

  const originYBound = std.saturate(rayOrigin.y + 0.01);
  const posOffset =
    hitPosition +
    d.vec3f(0, 1, 0) * (offset * (originYBound / (1.0 + originYBound)) * (1 + randf.sample() / 2));
  const newNormal = getNormalMain(posOffset);

  // Calculate fake bounce lighting
  const jellyColor = layout.$.sceneParams.jellyColor;
  const sqDist = sqLength(hitPosition - d.vec3f(endCapX, 0, 0));
  const bounceLight = jellyColor.rgb * ((1 / (sqDist * 15 + 1)) * 0.4);
  const sideBounceLight = jellyColor.rgb * ((1 / (sqDist * 40 + 1)) * 0.3) * std.abs(newNormal.z);

  const litColor = calculateLighting(posOffset, newNormal, rayOrigin);
  const backgroundColor =
    applyAO(GROUND_ALBEDO * litColor, posOffset, newNormal) +
    d.vec4f(bounceLight, 0) +
    d.vec4f(sideBounceLight, 0);

  const textColor = std.saturate(backgroundColor.rgb * 0.5);

  return d.vec4f(std.mix(backgroundColor.rgb, textColor, percentageSample.x) * (1 + highlights), 1);
}

function rayMarch(rayOrigin: d.v3f, rayDirection: d.v3f, _uv: d.v2f) {
  'use gpu';
  let backgroundDist = d.f32();
  for (let i = 0; i < MAX_STEPS; i++) {
    const p = rayOrigin + rayDirection * backgroundDist;
    const hit = getMainSceneDist(p);
    backgroundDist += hit;
    if (hit < SURF_DIST) {
      break;
    }
  }
  const background = renderBackground(rayOrigin, rayDirection, backgroundDist, d.f32());

  const bbox = sliderBBoxAccess.$;
  const zDepth = d.f32(0.25);

  const sliderMin = d.vec3f(bbox.left, bbox.bottom, -zDepth);
  const sliderMax = d.vec3f(bbox.right, bbox.top, zDepth);

  const intersection = intersectBox(rayOrigin, rayDirection, sliderMin, sliderMax);

  if (!intersection.hit) {
    return background;
  }

  let distanceFromOrigin = std.max(d.f32(0), intersection.tMin);

  let totalSteps = d.u32();
  for (let i = 0; i < MAX_STEPS; i++) {
    if (totalSteps >= MAX_STEPS) {
      break;
    }

    const currentPosition = rayOrigin + rayDirection * distanceFromOrigin;

    const hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;
    totalSteps++;

    if (hitInfo.distance < SURF_DIST) {
      const hitPosition = rayOrigin + rayDirection * distanceFromOrigin;

      if (!(hitInfo.objectType === ObjectType.SLIDER)) {
        break;
      }

      const N = getNormal(hitPosition, hitInfo);
      const I = rayDirection;
      const cosi = std.saturate(std.dot(std.neg(I), N));
      const F = fresnelSchlick(cosi, d.f32(1), d.f32(JELLY_IOR));

      const reflection = std.saturate(d.vec3f(hitPosition.y + 0.2));

      const eta = 1 / JELLY_IOR;
      const k = 1 - eta * eta * (1 - cosi * cosi);
      let refractedColor = d.vec3f();
      if (k > 0) {
        const refrDir = std.normalize(I * eta + N * (eta * cosi - std.sqrt(k)));
        const p = hitPosition + refrDir * (SURF_DIST * 2);
        const exitPos = p + refrDir * (SURF_DIST * 2);

        const env = rayMarchNoJelly(exitPos, refrDir);
        const progress = hitInfo.t;
        const jellyColor = layout.$.sceneParams.jellyColor;

        const scatterTint = jellyColor.rgb * 1.5;
        const density = d.f32(20);
        const absorb = (1 - jellyColor.rgb) * density;

        const T = beerLambert(absorb * progress ** 2, 0.08);

        const lightDir = layout.$.sceneParams.light.direction * -1;

        const forward = std.max(0, std.dot(lightDir, refrDir));
        const scatter = scatterTint.mul(JELLY_SCATTER_STRENGTH * forward * progress ** 3);
        refractedColor = env * T + scatter;
      }

      return d.vec4f(std.mix(refractedColor, reflection, F), 1);
    }

    if (distanceFromOrigin > backgroundDist) {
      break;
    }
  }

  return background;
}

const rayMarchFragmentFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  randf.seed2(layout.$.sceneParams.seed * uv);

  const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
  const ray = getRay(ndc);

  const color = rayMarch(ray.origin, ray.direction, uv);
  // Tonemapping using hyperbolic tangent
  return d.vec4f(std.tanh(color.rgb * 1.3), 1);
});

// #endregion

// #region Blit

const blitLayout = tgpu.bindGroupLayout({
  currentTexture: { texture: d.texture2d() },
  filteringSampler: { sampler: 'filtering' },
});

/**
 * Responsible for rendering the bound texture to the screen as is
 */
const blitFragmentFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  return std.textureSample(blitLayout.$.currentTexture, blitLayout.$.filteringSampler, uv);
});

// #endregion

export const shaderModules = {
  rayMarchWgsl: [common.fullScreenTriangle, rayMarchFragmentFn],
  taaResolveWgsl: [taaResolveFn],
  blitWgsl: [common.fullScreenTriangle, blitFragmentFn],
  bezierWgsl: [computeBezierMain],
};
