/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockGlyphLoading } from './utils/commonMocks.ts';

describe('text radiance cascades example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'text-radiance-cascades',
        setupMocks: () => {
          mockGlyphLoading();
        },
        expectedCalls: 8,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var writeView: texture_storage_2d<rgba16uint, write>;

      @group(1) @binding(0) var scene: texture_2d<f32>;

      fn classify(coord: vec2u, _arg_1: vec2u) -> bool {
        return (textureLoad(scene, vec2i(coord), 0).a > 0.5f);
      }

      @compute @workgroup_size(8, 8) fn initFromSeedCompute(@builtin(global_invocation_id) gid: vec3u) {
        let size = textureDimensions(writeView);
        if (((gid.x >= size.x) || (gid.y >= size.y))) {
          return;
        }
        let isInside = classify(gid.xy, size);
        let invalid = vec2u(65535);
        let insideCoord = select(invalid, gid.xy, isInside);
        let outsideCoord = select(gid.xy, invalid, isInside);
        textureStore(writeView, vec2i(gid.xy), vec4u(insideCoord, outsideCoord));
      }

      @group(1) @binding(0) var readView: texture_storage_2d<rgba16uint, read>;

      @group(0) @binding(0) var<uniform> offsetUniform: i32;

      fn sampleWithOffset(tex: texture_storage_2d<rgba16uint, read>, dims: vec2u, pos: vec2i, offset: vec2i) -> vec4u {
        let samplePos = (pos + offset);
        let outOfBounds = ((((samplePos.x < 0i) || (samplePos.y < 0i)) || (samplePos.x >= i32(dims.x))) || (samplePos.y >= i32(dims.y)));
        if (outOfBounds) {
          return vec4u(65535);
        }
        return textureLoad(tex, samplePos);
      }

      @group(1) @binding(1) var writeView: texture_storage_2d<rgba16uint, write>;

      @compute @workgroup_size(8, 8) fn jumpFloodCompute(@builtin(global_invocation_id) gid: vec3u) {
        let size = textureDimensions(readView);
        if (((gid.x >= size.x) || (gid.y >= size.y))) {
          return;
        }
        let offset = offsetUniform;
        let pos = vec2i(gid.xy);
        let invalid = vec2u(65535);
        var bestInsideCoord = invalid;
        var bestOutsideCoord = invalid;
        var bestInsideDist2 = 2147483647i;
        var bestOutsideDist2 = 2147483647i;
        // unrolled iteration #0
        // unrolled iteration #0 / #0
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i(-1) * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #0 / #1
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i(0, -1) * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #0 / #2
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i(1, -1) * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // ---
        // unrolled iteration #1
        // unrolled iteration #1 / #0
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i(-1, 0) * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #1 / #1
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i() * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #1 / #2
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i(1, 0) * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // ---
        // unrolled iteration #2
        // unrolled iteration #2 / #0
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i(-1, 1) * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #2 / #1
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i(0, 1) * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #2 / #2
        {
          let sample = sampleWithOffset(readView, size, pos, (vec2i(1) * offset));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // ---
        // ---
        textureStore(writeView, vec2i(gid.xy), vec4u(bestInsideCoord, bestOutsideCoord));
      }

      @group(0) @binding(0) var readView: texture_storage_2d<rgba16uint, read>;

      fn sampleWithOffset(tex: texture_storage_2d<rgba16uint, read>, dims: vec2u, pos: vec2i, offset: vec2i) -> vec4u {
        let samplePos = (pos + offset);
        let outOfBounds = ((((samplePos.x < 0i) || (samplePos.y < 0i)) || (samplePos.x >= i32(dims.x))) || (samplePos.y >= i32(dims.y)));
        if (outOfBounds) {
          return vec4u(65535);
        }
        return textureLoad(tex, samplePos);
      }

      fn getSdf(_coord: vec2u, size: vec2u, signedDist: f32, _arg_3: vec2u, _arg_4: vec2u) -> f32 {
        return (signedDist / f32(min(size.x, size.y)));
      }

      @group(1) @binding(0) var scene: texture_2d<f32>;

      fn getColor(_coord: vec2u, _size: vec2u, _signedDist: f32, insidePx: vec2u, _arg_4: vec2u) -> vec4f {
        return vec4f(textureLoad(scene, vec2i(insidePx), 0).rgb, 1f);
      }

      @group(2) @binding(0) var sdfTexture: texture_storage_2d<rgba16float, write>;

      @group(2) @binding(1) var colorTexture: texture_storage_2d<rgba8unorm, write>;

      @compute @workgroup_size(8, 8) fn finalizeCompute(@builtin(global_invocation_id) gid: vec3u) {
        let size = textureDimensions(readView);
        if (((gid.x >= size.x) || (gid.y >= size.y))) {
          return;
        }
        let pos = vec2i(gid.xy);
        let invalid = vec2u(65535);
        var bestInsideCoord = invalid;
        var bestOutsideCoord = invalid;
        var bestInsideDist2 = 2147483647i;
        var bestOutsideDist2 = 2147483647i;
        // unrolled iteration #0
        // unrolled iteration #0 / #0
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i(-1));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #0 / #1
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i(0, -1));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #0 / #2
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i(1, -1));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // ---
        // unrolled iteration #1
        // unrolled iteration #1 / #0
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i(-1, 0));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #1 / #1
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i());
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #1 / #2
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i(1, 0));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // ---
        // unrolled iteration #2
        // unrolled iteration #2 / #0
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i(-1, 1));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #2 / #1
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i(0, 1));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // unrolled iteration #2 / #2
        {
          let sample = sampleWithOffset(readView, size, pos, vec2i(1));
          if ((sample.x != 65535u)) {
            let deltaIn = (pos - vec2i(sample.xy));
            let dist2 = ((deltaIn.x * deltaIn.x) + (deltaIn.y * deltaIn.y));
            if ((dist2 < bestInsideDist2)) {
              bestInsideDist2 = dist2;
              bestInsideCoord = sample.xy;
            }
          }
          if ((sample.z != 65535u)) {
            let deltaOut = (pos - vec2i(sample.zw));
            let dist2 = ((deltaOut.x * deltaOut.x) + (deltaOut.y * deltaOut.y));
            if ((dist2 < bestOutsideDist2)) {
              bestOutsideDist2 = dist2;
              bestOutsideCoord = sample.zw;
            }
          }
        }
        // ---
        // ---
        let posF = vec2f(gid.xy);
        var insideDist = 3.3999999521443642e+38f;
        var outsideDist = 3.3999999521443642e+38f;
        if ((bestInsideCoord.x != 65535u)) {
          insideDist = distance(posF, vec2f(bestInsideCoord));
        }
        if ((bestOutsideCoord.x != 65535u)) {
          outsideDist = distance(posF, vec2f(bestOutsideCoord));
        }
        let signedDist = (insideDist - outsideDist);
        let sdfValue = getSdf(gid.xy, size, signedDist, bestInsideCoord, bestOutsideCoord);
        let colorValue = getColor(gid.xy, size, signedDist, bestInsideCoord, bestOutsideCoord);
        textureStore(sdfTexture, vec2i(gid.xy), vec4f(sdfValue, 0f, 0f, 0f));
        textureStore(colorTexture, vec2i(gid.xy), colorValue);
      }

      @group(1) @binding(4) var dst: texture_storage_2d<rgba16float, write>;

      struct CascadeStaticParams {
        baseProbes: vec2u,
        cascadeDim: vec2u,
        cascadeCount: u32,
      }

      @group(1) @binding(0) var<uniform> staticParams: CascadeStaticParams;

      @group(1) @binding(1) var<uniform> layer_1: u32;

      @group(0) @binding(0) var sdfView: texture_2d<f32>;

      @group(0) @binding(1) var linearSampler: sampler;

      fn sdf(uv: vec2f) -> f32 {
        if (((((uv.x < 0f) || (uv.x > 1f)) || (uv.y < 0f)) || (uv.y > 1f))) {
          return 1;
        }
        return textureSampleLevel(sdfView, linearSampler, uv, 0).x;
      }

      @group(0) @binding(2) var seedView: texture_2d<f32>;

      struct Params {
        time: f32,
        intensity: f32,
        animateHue: u32,
        neonText: u32,
        displayMode: u32,
        resolution: vec2f,
        lampPos: vec2f,
        lampRadius: f32,
        lampColor: vec3f,
      }

      @group(0) @binding(3) var<uniform> params_1: Params;

      fn color(uv: vec2f) -> vec3f {
        return (textureSampleLevel(seedView, linearSampler, uv, 0).rgb * params_1.intensity);
      }

      struct RayMarchResult {
        color: vec3f,
        transmittance: f32,
      }

      fn defaultRayMarch(probePos: vec2f, rayDir: vec2f, startT: f32, endT: f32, eps: f32, minStep: f32, bias: f32) -> RayMarchResult {
        var rgb = vec3f();
        var T = 1f;
        var t = startT;
        var hitPos = vec2f();
        var didHit = false;
        for (var step_1 = 0; (step_1 < 64i); step_1++) {
          if ((t > endT)) {
            break;
          }
          let pos = (probePos + (rayDir * t));
          if ((any((pos < vec2f())) || any((pos > vec2f(1))))) {
            break;
          }
          let dist = max((sdf(pos) + bias), 0f);
          if ((dist <= eps)) {
            hitPos = pos;
            didHit = true;
            T = 0f;
            break;
          }
          t += max(dist, minStep);
        }
        if (didHit) {
          rgb = color(hitPos);
        }
        return RayMarchResult(rgb, T);
      }

      @group(1) @binding(2) var upper: texture_2d<f32>;

      @group(1) @binding(3) var upperSampler: sampler;

      @compute @workgroup_size(8, 8) fn cascadePassCompute(@builtin(global_invocation_id) gid: vec3u) {
        let dim2 = textureDimensions(dst);
        if (((gid.x >= dim2.x) || (gid.y >= dim2.y))) {
          return;
        }
        let params = (&staticParams);
        let layer = layer_1;
        let probes = max(vec2u(((*params).baseProbes.x >> layer), ((*params).baseProbes.y >> layer)), vec2u(1));
        let dirStored = (gid.xy / probes);
        let probe = (gid.xy % probes);
        let raysDimStored = (2u << layer);
        let raysDimActual = (raysDimStored * 2u);
        let rayCountActual = pow(f32(raysDimActual), 2f);
        if (((dirStored.x >= raysDimStored) || (dirStored.y >= raysDimStored))) {
          textureStore(dst, gid.xy, vec4f(0, 0, 0, 1));
          return;
        }
        let probePos = ((vec2f(probe) + 0.5f) / vec2f(probes));
        let aspect = (f32((*params).baseProbes.x) / f32((*params).baseProbes.y));
        let cascadeProbesMinVal = f32(min((*params).baseProbes.x, (*params).baseProbes.y));
        let interval0 = (1f / cascadeProbesMinVal);
        let pow4 = f32((1u << (layer * 2u)));
        let startUv = ((interval0 * (pow4 - 1f)) / 3f);
        let endUv = (startUv + (interval0 * pow4));
        let sdfDim = vec2u(256);
        let texelSizeMin = (1f / f32(max(min(sdfDim.x, sdfDim.y), 1u)));
        let eps = max(texelSizeMin, (0.25f / cascadeProbesMinVal));
        let minStep = max((texelSizeMin * 0.5f), (0.125f / cascadeProbesMinVal));
        let biasUv = (2f / cascadeProbesMinVal);
        var accum = vec4f();
        for (var i = 0u; (i < 4u); i++) {
          let dirActual = ((dirStored * 2u) + vec2u((i & 1u), (i >> 1u)));
          let rayIndex = (f32(((dirActual.y * raysDimActual) + dirActual.x)) + 0.5f);
          let angle = (((rayIndex / rayCountActual) * 6.283185307179586f) - 3.141592653589793f);
          let cosA = cos(angle);
          let sinA = -(sin(angle));
          var rayDir = vec2f(cosA, sinA);
          if ((aspect >= 1f)) {
            rayDir = vec2f((cosA / aspect), sinA);
          }
          else {
            rayDir = vec2f(cosA, (sinA * aspect));
          }
          let marchResult = defaultRayMarch(probePos, rayDir, startUv, endUv, eps, minStep, biasUv);
          var rgb = marchResult.color;
          var T = marchResult.transmittance;
          if (((layer < ((*params).cascadeCount - 1u)) && (T > 0.01f))) {
            let probesU = max(vec2u((probes.x >> 1u), (probes.y >> 1u)), vec2u(1));
            let tileOrigin = (vec2f(dirActual) * vec2f(probesU));
            let probePixel = clamp((probePos * vec2f(probesU)), vec2f(0.5), (vec2f(probesU) - 0.5f));
            let uvU = ((tileOrigin + probePixel) / vec2f(dim2));
            let upper_1 = textureSampleLevel(upper, upperSampler, uvU, 0);
            rgb = (rgb + (upper_1.xyz * T));
            T *= upper_1.w;
          }
          accum += vec4f(rgb, T);
        }
        textureStore(dst, gid.xy, (accum * 0.25f));
      }

      @group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

      struct BuildRadianceFieldParams {
        outputProbes: vec2u,
        cascadeProbes: vec2u,
      }

      @group(0) @binding(0) var<uniform> params_1: BuildRadianceFieldParams;

      @group(0) @binding(1) var src: texture_2d<f32>;

      @group(0) @binding(2) var srcSampler: sampler;

      @compute @workgroup_size(8, 8) fn buildRadianceFieldCompute(@builtin(global_invocation_id) gid: vec3u) {
        let dim2 = textureDimensions(dst);
        if (((gid.x >= dim2.x) || (gid.y >= dim2.y))) {
          return;
        }
        let params = (&params_1);
        let cascadeDim = ((*params).cascadeProbes * 2u);
        let invCascadeDim = (1f / vec2f(cascadeDim));
        let uv = ((vec2f(gid.xy) + 0.5f) / vec2f((*params).outputProbes));
        let probePixel = clamp((uv * vec2f((*params).cascadeProbes)), vec2f(0.5), (vec2f((*params).cascadeProbes) - 0.5f));
        let uvStride = (vec2f((*params).cascadeProbes) * invCascadeDim);
        let baseSampleUV = (probePixel * invCascadeDim);
        var sum = vec3f();
        for (var i = 0u; (i < 4u); i++) {
          let offset = (vec2f(f32((i & 1u)), f32((i >> 1u))) * uvStride);
          let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
          sum = (sum + sample.xyz);
        }
        let avg = (sum * 0.25f);
        let res = avg;
        textureStore(dst, gid.xy, vec4f(res, 1f));
      }

      fn corner(index: u32) -> vec2f {
        let x = (((index == 1u) || (index == 4u)) || (index == 5u));
        let y = (((index == 2u) || (index == 3u)) || (index == 5u));
        return vec2f(f32(select(0i, 1i, x)), f32(select(0i, 1i, y)));
      }

      @group(1) @binding(2) var<storage, read> placements: array<vec2f>;

      fn placedSlugOrigin(origin: vec2f, placementSlot: u32) -> vec2f {
        return (origin + placements[placementSlot]);
      }

      fn defaultPosition(position: vec3f, viewport: vec2f) -> vec4f {
        return vec4f((((position.x * 2f) / viewport.x) - 1f), (1f - ((position.y * 2f) / viewport.y)), position.z, 1f);
      }

      fn projectWithScene(position: vec3f, viewport: vec2f, offset: vec2f) -> vec4f {
        let pixel = (vec2f(position.x, -(position.y)) + offset);
        return defaultPosition(vec3f(pixel, position.z), viewport);
      }

      @group(1) @binding(0) var<uniform> viewport: vec2f;

      @group(1) @binding(1) var<uniform> position_1: vec2f;

      fn projectSlug(position: vec3f) -> vec4f {
        return projectWithScene(position, viewport, position_1);
      }

      fn slugDilate(position: vec2f, outwardNormal: vec2f, textureCoordinate: vec2f, inverseScale: f32, mvpRow0: vec4f, mvpRow1: vec4f, mvpRow3: vec4f, viewport_1: vec2f) -> vec4f {
        let normal = normalize(outwardNormal);
        let homogeneousW = (dot(mvpRow3.xy, position) + mvpRow3.w);
        let wGradient = dot(mvpRow3.xy, normal);
        let projectedX = (((homogeneousW * dot(mvpRow0.xy, normal)) - (wGradient * (dot(mvpRow0.xy, position) + mvpRow0.w))) * viewport_1.x);
        let projectedY = (((homogeneousW * dot(mvpRow1.xy, normal)) - (wGradient * (dot(mvpRow1.xy, position) + mvpRow1.w))) * viewport_1.y);
        let squaredW = (homogeneousW * homogeneousW);
        let projectedLengthSquared = ((projectedX * projectedX) + (projectedY * projectedY));
        let denominator = (projectedLengthSquared - ((squaredW * wGradient) * wGradient));
        let distance_1 = ((squaredW * ((homogeneousW * wGradient) + sqrt(projectedLengthSquared))) / denominator);
        let offset = (distance_1 * normal);
        return vec4f((position + offset), (textureCoordinate + (inverseScale * offset)));
      }

      struct h_Output {
        @builtin(position) position: vec4f,
        @location(0) coordinate: vec2f,
        @location(1) color: vec4f,
        @location(2) band: vec4f,
        @location(3) @interpolate(flat) starts: vec4u,
        @location(4) @interpolate(flat) counts: vec4u,
      }

      @vertex fn h(@builtin(vertex_index) index: u32, @location(0) rect: vec4f, @location(1) plane: vec4f, @location(2) band: vec4f, @location(3) color: vec4f, @location(4) inverse: vec4f, @location(5) starts: vec4u, @location(6) counts: vec4u) -> h_Output {
        let unit = corner(index);
        let origin = placedSlugOrigin(rect.xy, counts.z);
        let local = vec2f((origin.x + (unit.x * rect.z)), -((origin.y + (unit.y * rect.w))));
        let normal = vec2f(((unit.x - 0.5f) * rect.z), (-((unit.y - 0.5f)) * rect.w));
        let em = vec2f((plane.x + (unit.x * plane.z)), (plane.y - (unit.y * plane.w)));
        let clip = projectSlug(vec3f(local, 0f));
        let dx = (projectSlug(vec3f((local.x + 1f), local.y, 0f)) - clip);
        let dy = (projectSlug(vec3f(local.x, (local.y + 1f), 0f)) - clip);
        let dilated = slugDilate(vec2f(), normal, em, inverse.x, vec4f(dx.x, dy.x, 0f, clip.x), vec4f(dx.y, dy.y, 0f, clip.y), vec4f(dx.w, dy.w, 0f, clip.w), viewport);
        return h_Output(projectSlug(vec3f((local + dilated.xy), 0f)), dilated.zw, color, band, starts, counts);
      }

      struct p {
        curveBaseTexel: u32,
        horizontalHeaderBase: u32,
        verticalHeaderBase: u32,
        referenceBase: u32,
        horizontalBandCount: u32,
        verticalBandCount: u32,
        bandTransform: vec4f,
      }

      fn slugPixelsPerEm(renderCoordinate: vec2f) -> vec3f {
        let emsPerPixel = fwidth(renderCoordinate);
        let pixelsPerEmX = (1f / max(emsPerPixel.x, 1.52587890625e-5f));
        let pixelsPerEmY = (1f / max(emsPerPixel.y, 1.52587890625e-5f));
        return vec3f(pixelsPerEmX, pixelsPerEmY, ((pixelsPerEmX + pixelsPerEmY) * 0.5f));
      }

      fn slugThickenFactor(thicken: f32, pixelsPerEm: f32) -> f32 {
        return (1f + (thicken * max(0f, (1f - (pixelsPerEm / 24f)))));
      }

      fn slugBandIndex(coordinate: f32, scale: f32, offset: f32, declaredBandCount: u32) -> u32 {
        return u32(clamp(((coordinate * scale) + offset), 0f, (f32(declaredBandCount) - 1f)));
      }

      fn gridCoordinate(index: u32, width: u32) -> vec2i {
        let integerIndex = i32(index);
        let integerWidth = i32(width);
        return vec2i((integerIndex % integerWidth), (integerIndex / integerWidth));
      }

      @group(0) @binding(0) var f: texture_2d<u32>;

      fn item(coords: vec2i) -> vec4u {
        return textureLoad(f, coords, 0);
      }

      fn loadHeader(index: u32) -> u32 {
        let texel = item(gridCoordinate(index, 4096u));
        return texel.x;
      }

      fn slugBandReferenceOffset(header: u32) -> u32 {
        return (header & 65535u);
      }

      fn slugBandCurveCount(header: u32) -> u32 {
        return min((header >> 16u), 512u);
      }

      @group(0) @binding(1) var p_1: texture_2d<u32>;

      fn item_1(coords: vec2i) -> vec4u {
        return textureLoad(p_1, coords, 0);
      }

      fn slugReferenceFromPair(pair: u32, referenceIndex: u32) -> u32 {
        return ((pair >> ((referenceIndex & 1u) * 16u)) & 65535u);
      }

      fn loadReference(index: u32) -> u32 {
        let pair = item_1(gridCoordinate((index >> 1u), 4096u)).x;
        return slugReferenceFromPair(pair, index);
      }

      @group(0) @binding(2) var d: texture_2d<f32>;

      fn item_2(coords: vec2i) -> vec4f {
        return textureLoad(d, coords, 0);
      }

      struct m {
        p0: vec2f,
        p1: vec2f,
        p2: vec2f,
      }

      fn loadCurve(texelIndex: u32) -> m {
        let first = item_2(gridCoordinate(texelIndex, 4096u));
        let second = item_2(gridCoordinate((texelIndex + 1u), 4096u));
        return m(vec2f(first.x, first.y), vec2f(first.z, first.w), vec2f(second.x, second.y));
      }

      fn calcRootCode(y1: f32, y2: f32, y3: f32) -> u32 {
        let s1 = select(0u, 1u, (y1 < 0f));
        let s2 = select(0u, 1u, (y2 < 0f));
        let s3 = select(0u, 1u, (y3 < 0f));
        let shift = ((s1 | (s2 << 1u)) | (s3 << 2u));
        return ((11892u >> shift) & 257u);
      }

      fn stableRoots(a: f32, b: f32, c: f32) -> vec2f {
        let discriminant = ((b * b) - (a * c));
        var t1 = 0f;
        var t2 = 0f;
        let linearAxis = (abs(a) < 1.52587890625e-5f);
        if (linearAxis) {
          let twiceB = (b * 2f);
          let linearRoot = (c / twiceB);
          t1 = linearRoot;
          t2 = linearRoot;
        }
        else {
          if ((discriminant <= 0f)) {
            let extremum = (b / a);
            t1 = extremum;
            t2 = extremum;
          }
          else {
            let distance_1 = sqrt(discriminant);
            let sign_1 = select(-1f, 1f, (b >= 0f));
            let signedDistance = (sign_1 * distance_1);
            let q = (b + signedDistance);
            let rootA = (q / a);
            let rootB = (c / q);
            t1 = select(rootA, rootB, (b >= 0f));
            t2 = select(rootB, rootA, (b >= 0f));
          }
        }
        return vec2f(t1, t2);
      }

      fn solveHorizontalPolynomial(p0: vec2f, p1: vec2f, p2: vec2f) -> vec2f {
        let roots = stableRoots(((p0.y - (p1.y * 2f)) + p2.y), (p0.y - p1.y), p0.y);
        let a = ((p0.x - (p1.x * 2f)) + p2.x);
        let b = (p0.x - p1.x);
        return vec2f(((((a * roots.x) - (b * 2f)) * roots.x) + p0.x), ((((a * roots.y) - (b * 2f)) * roots.y) + p0.x));
      }

      fn curveContribution_1(curveP0: vec2f, curveP1: vec2f, curveP2: vec2f, renderCoordinate: vec2f, pixelsPerEm: f32, thickenFactor: f32) -> vec3f {
        let p0 = (curveP0 - renderCoordinate);
        let p1 = (curveP1 - renderCoordinate);
        let p2 = (curveP2 - renderCoordinate);
        let maximum = (max(max(p0.x, p1.x), p2.x) * pixelsPerEm);
        if ((maximum < -0.5f)) {
          return vec3f(0f, 0f, maximum);
        }
        let rootCode = calcRootCode(p0.y, p1.y, p2.y);
        var coverage = 0f;
        var weight = 0f;
        if ((rootCode > 0u)) {
          let roots = solveHorizontalPolynomial(p0, p1, p2);
          let firstRoot = (roots.x * pixelsPerEm);
          let secondRoot = (roots.y * pixelsPerEm);
          let hasFirstRoot = ((rootCode & 1u) > 0u);
          let hasSecondRoot = ((rootCode & 256u) > 0u);
          let firstContribution = select(0f, saturate(((firstRoot * thickenFactor) + 0.5f)), hasFirstRoot);
          let secondContribution = select(0f, saturate(((secondRoot * thickenFactor) + 0.5f)), hasSecondRoot);
          coverage = (firstContribution - secondContribution);
          weight = max(select(0f, saturate((1f - (abs(firstRoot) * 2f))), hasFirstRoot), select(0f, saturate((1f - (abs(secondRoot) * 2f))), hasSecondRoot));
        }
        return vec3f(coverage, weight, maximum);
      }

      fn slugHorizontalCurveContribution(curveP0: vec2f, curveP1: vec2f, curveP2: vec2f, renderCoordinate: vec2f, pixelsPerEm: f32, thickenFactor: f32) -> vec3f {
        return curveContribution_1(curveP0, curveP1, curveP2, renderCoordinate, pixelsPerEm, thickenFactor);
      }

      fn curveContribution(curve: m, renderCoordinate: vec2f, pixelsPerEm: f32, thickenFactor: f32) -> vec3f {
        return slugHorizontalCurveContribution(curve.p0, curve.p1, curve.p2, renderCoordinate, pixelsPerEm, thickenFactor);
      }

      struct m_1 {
        coverage: f32,
        weight: f32,
      }

      fn genericEvaluateBand(glyph: p, renderCoordinate: vec2f, pixelsPerEm: f32, thickenFactor: f32) -> m_1 {
        let coordinate = renderCoordinate.y;
        let transformScale = glyph.bandTransform.y;
        let transformOffset = glyph.bandTransform.w;
        let declaredBandCount = glyph.horizontalBandCount;
        let headerBase = glyph.horizontalHeaderBase;
        let bandIndex = slugBandIndex(coordinate, transformScale, transformOffset, declaredBandCount);
        let header = loadHeader((headerBase + bandIndex));
        let localReferenceOffset = slugBandReferenceOffset(header);
        let curveCount = slugBandCurveCount(header);
        var coverage = 0f;
        var weight = 0f;
        var curveIndex = 0u;
        while ((curveIndex < curveCount)) {
          let referenceIndex = ((glyph.referenceBase + localReferenceOffset) + curveIndex);
          let curveReference = loadReference(referenceIndex);
          let curve = loadCurve((glyph.curveBaseTexel + curveReference));
          let contribution = curveContribution(curve, renderCoordinate, pixelsPerEm, thickenFactor);
          if ((contribution.z < -0.5f)) {
            curveIndex = curveCount;
          }
          else {
            coverage += contribution.x;
            weight = max(weight, contribution.y);
            curveIndex++;
          }
        }
        return m_1(coverage, weight);
      }

      fn slugVerticalCurveContribution(curveP0: vec2f, curveP1: vec2f, curveP2: vec2f, renderCoordinate: vec2f, pixelsPerEm: f32, thickenFactor: f32) -> vec3f {
        let contribution = curveContribution_1(curveP0.yx, curveP1.yx, curveP2.yx, renderCoordinate.yx, pixelsPerEm, thickenFactor);
        return vec3f(-(contribution.x), contribution.y, contribution.z);
      }

      fn curveContribution_2(curve: m, renderCoordinate: vec2f, pixelsPerEm: f32, thickenFactor: f32) -> vec3f {
        return slugVerticalCurveContribution(curve.p0, curve.p1, curve.p2, renderCoordinate, pixelsPerEm, thickenFactor);
      }

      fn genericEvaluateBand_1(glyph: p, renderCoordinate: vec2f, pixelsPerEm: f32, thickenFactor: f32) -> m_1 {
        let coordinate = renderCoordinate.x;
        let transformScale = glyph.bandTransform.x;
        let transformOffset = glyph.bandTransform.z;
        let declaredBandCount = glyph.verticalBandCount;
        let headerBase = glyph.verticalHeaderBase;
        let bandIndex = slugBandIndex(coordinate, transformScale, transformOffset, declaredBandCount);
        let header = loadHeader((headerBase + bandIndex));
        let localReferenceOffset = slugBandReferenceOffset(header);
        let curveCount = slugBandCurveCount(header);
        var coverage = 0f;
        var weight = 0f;
        var curveIndex = 0u;
        while ((curveIndex < curveCount)) {
          let referenceIndex = ((glyph.referenceBase + localReferenceOffset) + curveIndex);
          let curveReference = loadReference(referenceIndex);
          let curve = loadCurve((glyph.curveBaseTexel + curveReference));
          let contribution = curveContribution_2(curve, renderCoordinate, pixelsPerEm, thickenFactor);
          if ((contribution.z < -0.5f)) {
            curveIndex = curveCount;
          }
          else {
            coverage += contribution.x;
            weight = max(weight, contribution.y);
            curveIndex++;
          }
        }
        return m_1(coverage, weight);
      }

      fn calcCoverage(xCoverage: f32, xWeight: f32, yCoverage: f32, yWeight: f32, evenOdd: bool, weightBoost: bool, stemDarken: f32, pixelsPerEm: f32) -> f32 {
        let weighted = (abs(((xCoverage * xWeight) + (yCoverage * yWeight))) / max((xWeight + yWeight), 1.52587890625e-5f));
        let fallback = min(abs(xCoverage), abs(yCoverage));
        let rawCoverage = max(weighted, fallback);
        let evenOddCoverage = (1f - abs((1f - (fract((rawCoverage * 0.5f)) * 2f))));
        let filledCoverage = select(saturate(rawCoverage), evenOddCoverage, evenOdd);
        let boostedCoverage = select(filledCoverage, sqrt(filledCoverage), weightBoost);
        let darken = (stemDarken * max(0f, (1f - (pixelsPerEm / 24f))));
        return min((boostedCoverage + ((darken * boostedCoverage) * (1f - boostedCoverage))), 1f);
      }

      fn slugRenderWithOptions(glyph: p, renderCoordinate: vec2f, evenOdd: bool, weightBoost: bool, stemDarken: f32, thicken: f32) -> f32 {
        let pixelsPerEm = slugPixelsPerEm(renderCoordinate);
        let thickenFactor = slugThickenFactor(thicken, pixelsPerEm.z);
        let horizontal = genericEvaluateBand(glyph, renderCoordinate, pixelsPerEm.x, thickenFactor);
        let vertical = genericEvaluateBand_1(glyph, renderCoordinate, pixelsPerEm.y, thickenFactor);
        return calcCoverage(horizontal.coverage, horizontal.weight, vertical.coverage, vertical.weight, evenOdd, weightBoost, stemDarken, pixelsPerEm.z);
      }

      fn slugRender(glyph: p, renderCoordinate: vec2f) -> f32 {
        return slugRenderWithOptions(glyph, renderCoordinate, false, false, 0f, 0f);
      }

      struct Params {
        time: f32,
        intensity: f32,
        animateHue: u32,
        neonText: u32,
        displayMode: u32,
        resolution: vec2f,
        lampPos: vec2f,
        lampRadius: f32,
        lampColor: vec3f,
      }

      @group(0) @binding(3) var<uniform> params: Params;

      fn hueColor(phase: f32) -> vec3f {
        return ((cos(vec3f(phase, (phase + 2.1f), (phase + 4.2f))) * 0.5f) + 0.5f);
      }

      fn transformColor(color: vec4f, fragPos: vec4f) -> vec4f {
        let emissive = (step(0.5f, color.r) * f32(params.neonText));
        let phase = ((fragPos.x * 3e-3f) + ((params.time * f32(params.animateHue)) * 0.4f));
        let neon = (mix(hueColor(phase), vec3f(1), 0.15f) * 0.45f);
        let base = min(color.rgb, vec3f(0.029999999329447746, 0.029999999329447746, 0.05000000074505806));
        return vec4f(mix(base, neon, emissive), color.a);
      }

      struct g_Input {
        @location(0) coordinate: vec2f,
        @location(1) color: vec4f,
        @location(2) band: vec4f,
        @location(3) @interpolate(flat) starts: vec4u,
        @location(4) @interpolate(flat) counts: vec4u,
      }

      @fragment fn g(_arg_0: g_Input, @builtin(position) position: vec4f) -> @location(0) vec4f {
        let coverage = slugRender(p(_arg_0.starts.x, _arg_0.starts.y, _arg_0.starts.z, _arg_0.starts.w, _arg_0.counts.x, _arg_0.counts.y, _arg_0.band), _arg_0.coordinate);
        return transformColor(vec4f(_arg_0.color.rgb, (_arg_0.color.a * coverage)), position);
      }

      struct Params {
        time: f32,
        intensity: f32,
        animateHue: u32,
        neonText: u32,
        displayMode: u32,
        resolution: vec2f,
        lampPos: vec2f,
        lampRadius: f32,
        lampColor: vec3f,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) local: vec2f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        let corner = ((vec2f(f32((_arg_0.vertexIndex & 1u)), f32(((_arg_0.vertexIndex >> 1u) & 1u))) * 2f) - 1f);
        let pixel = (params.lampPos + (corner * params.lampRadius));
        let clip = (((pixel / params.resolution) * 2f) - 1f);
        return VertexOut(vec4f(clip.x, -(clip.y), 0f, 1f), corner);
      }

      struct FragmentIn {
        @location(0) local: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let dist = length(_arg_0.local);
        let alpha = (1f - smoothstep(0.85f, 1f, dist));
        return vec4f(params.lampColor, alpha);
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      @group(1) @binding(0) var sdf: texture_2d<f32>;

      @group(0) @binding(0) var linearSampler: sampler;

      struct Params {
        time: f32,
        intensity: f32,
        animateHue: u32,
        neonText: u32,
        displayMode: u32,
        resolution: vec2f,
        lampPos: vec2f,
        lampRadius: f32,
        lampColor: vec3f,
      }

      @group(0) @binding(1) var<uniform> params: Params;

      @group(1) @binding(1) var seed: texture_2d<f32>;

      @group(1) @binding(2) var radiance: texture_2d<f32>;

      fn aces(x: vec3f) -> vec3f {
        return saturate(((x * ((x * 2.51f) + 0.03f)) / ((x * ((x * 2.43f) + 0.59f)) + 0.14f)));
      }

      struct fragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
        let signedDist = textureSample(sdf, linearSampler, _arg_0.uv).x;
        if ((params.displayMode == 1u)) {
          let bands = (abs((fract((signedDist * 30f)) - 0.5f)) * 2f);
          let tint = select(vec3f(0.20000000298023224, 0.5, 1), vec3f(1, 0.4000000059604645, 0.20000000298023224), (signedDist < 0f));
          return vec4f(((tint * (0.3f + (0.7f * bands))) * exp((-(abs(signedDist)) * 3f))), 1f);
        }
        let seed_1 = textureSample(seed, linearSampler, _arg_0.uv).rgb;
        let radiance_1 = textureSample(radiance, linearSampler, _arg_0.uv).rgb;
        let texel = (1f / f32(textureDimensions(sdf).y));
        let edge = max(fwidth(signedDist), texel);
        let surface = (1f - smoothstep(-(edge), edge, signedDist));
        let color = mix(radiance_1, (seed_1 * params.intensity), surface);
        return vec4f(aces(color), 1f);
      }"
    `);
  });
});
