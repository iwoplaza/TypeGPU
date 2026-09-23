/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockGlyphLoading, mockResizeObserver } from './utils/commonMocks.ts';

describe('glyph text example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'glyph-text',
        setupMocks: () => {
          mockGlyphLoading();
          mockResizeObserver();
        },
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "fn corner(index: u32) -> vec2f {
        let x_1 = (((index == 1u) || (index == 4u)) || (index == 5u));
        let y = (((index == 2u) || (index == 3u)) || (index == 5u));
        return vec2f(f32(select(0i, 1i, x_1)), f32(select(0i, 1i, y)));
      }

      @group(1) @binding(2) var<storage, read> placementSlots: array<u32>;

      @group(1) @binding(3) var<storage, read> placements: array<vec2f>;

      fn placedOrigin(origin: vec2f, instance: u32) -> vec2f {
        return (origin + placements[placementSlots[instance]]);
      }

      fn srgbChannelToLinear(encoded: f32) -> f32 {
        if ((encoded <= 0.04045f)) {
          return (encoded / 12.92f);
        }
        return pow(((encoded + 0.055f) / 1.055f), 2.4f);
      }

      fn decorationPaint(packed: vec2u) -> vec4f {
        const byte = 0.00392156862745098;
        let encoded = vec3f((f32((packed.x & 255u)) * byte), (f32(((packed.x >> 8u) & 255u)) * byte), (f32(((packed.x >> 16u) & 255u)) * byte));
        return vec4f(srgbChannelToLinear(encoded.x), srgbChannelToLinear(encoded.y), srgbChannelToLinear(encoded.z), (f32(((packed.x >> 24u) & 255u)) * byte));
      }

      struct f {
        origin: vec2f,
        size: vec2f,
        uvOrigin: vec2f,
        uvSize: vec2f,
        uvBounds: vec4f,
        fillColor: vec4f,
        outlineColor: vec4f,
        shadowColor: vec4f,
        shadowOffset: vec2f,
        outlineWidth: f32,
        pageIndex: u32,
      }

      struct p {
        unitPosition: vec3f,
        unitUv: vec2f,
        instance: f,
      }

      fn msdfAtlasCoordinate(uvOrigin: vec2f, uvSize: vec2f, unitUv: vec2f) -> vec2f {
        return (uvOrigin + (unitUv * uvSize));
      }

      fn msdfPosition(origin: vec2f, size: vec2f, unitPosition: vec3f) -> vec3f {
        return vec3f((origin.x + (unitPosition.x * size.x)), -((origin.y + (unitPosition.y * size.y))), 0f);
      }

      struct m {
        position: vec3f,
        atlasCoordinate: vec2f,
        shadowCoordinate: vec2f,
        uvBounds: vec4f,
        fillColor: vec4f,
        outlineColor: vec4f,
        shadowColor: vec4f,
        outlineWidth: f32,
        pageIndex: u32,
      }

      fn C(input: p) -> m {
        let instance = input.instance;
        let atlasCoordinate = msdfAtlasCoordinate(instance.uvOrigin, instance.uvSize, input.unitUv);
        return m(msdfPosition(instance.origin, instance.size, input.unitPosition), atlasCoordinate, (atlasCoordinate - instance.shadowOffset), instance.uvBounds, instance.fillColor, instance.outlineColor, instance.shadowColor, instance.outlineWidth, instance.pageIndex);
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

      fn project(position: vec3f) -> vec4f {
        return projectWithScene(position, viewport, position_1);
      }

      struct x_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) shadowUv: vec2f,
        @location(2) bounds: vec4f,
        @location(3) color: vec4f,
        @location(4) outline: vec4f,
        @location(5) shadow: vec4f,
        @location(6) width: f32,
        @location(7) @interpolate(flat) layer: u32,
      }

      @vertex fn x(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32, @location(0) rect: vec4f, @location(1) uvRect: vec4f, @location(2) bounds: vec4f, @location(3) color: vec4f, @location(4) effect: vec2u, @location(5) page: vec4f) -> x_Output {
        let unit = corner(index);
        let output = C(p(vec3f(unit, 0f), unit, f(placedOrigin(rect.xy, instance), rect.zw, uvRect.xy, uvRect.zw, bounds, color, decorationPaint(vec2u(effect.x, 0u)), decorationPaint(vec2u(effect.y, 0u)), (page.xy * vec2f(0.03134182095527649, 0.125)), (page.z * 8f), u32(page.w))));
        return x_Output(project(output.position), output.atlasCoordinate, output.shadowCoordinate, output.uvBounds, output.fillColor, output.outlineColor, output.shadowColor, output.outlineWidth, output.pageIndex);
      }

      fn msdfClampedCoordinates(atlasCoordinate: vec2f, shadowCoordinate: vec2f, uvBounds: vec4f, atlasSize: vec2f) -> vec4f {
        let halfTexel = (vec2f(0.5) / atlasSize);
        let minimum = (uvBounds.xy + halfTexel);
        let maximum = (uvBounds.zw - halfTexel);
        return vec4f(clamp(atlasCoordinate, minimum, maximum), clamp(shadowCoordinate, minimum, maximum));
      }

      @group(0) @binding(0) var l: texture_2d_array<f32>;

      @group(0) @binding(1) var u: sampler;

      fn item(uv: vec2f, layer: u32) -> vec4f {
        return textureSample(l, u, uv, layer);
      }

      struct item_1 {
        atlasCoordinate: vec2f,
        shadowCoordinate: vec2f,
        uvBounds: vec4f,
        atlasSize: vec2f,
        pixelRange: f32,
        baseSample: vec4f,
        shadowSample: vec4f,
        fillColor: vec4f,
        outlineColor: vec4f,
        outlineWidth: f32,
        shadowColor: vec4f,
      }

      struct v {
        atlasCoordinate: vec2f,
        shadowCoordinate: vec2f,
        uvBounds: vec4f,
        atlasSize: vec2f,
        pixelRange: f32,
        baseSample: vec4f,
        shadowSample: vec4f,
        outlineWidth: f32,
      }

      fn msdfDistances(baseSample: vec4f, atlasCoordinate: vec2f, atlasSize: vec2f, range: f32) -> vec3f {
        let rgb = baseSample.rgb;
        let fillDistance = (max(min(rgb.r, rgb.g), min(max(rgb.r, rgb.g), rgb.b)) - 0.5f);
        let trueDistance = (baseSample.a - 0.5f);
        let dx = dpdx(atlasCoordinate);
        let dy = dpdy(atlasCoordinate);
        let screenTexels = inverseSqrt(max(((dx * dx) + (dy * dy)), vec2f(9.999999960041972e-13)));
        let pixelRange = max((0.5f * dot((vec2f(range) / atlasSize), screenTexels)), 1f);
        return vec3f(fillDistance, trueDistance, pixelRange);
      }

      fn insideRectangle(point: vec2f, bounds: vec4f) -> f32 {
        let inside = (step(bounds.xy, point) * step(point, bounds.zw));
        return (inside.x * inside.y);
      }

      fn distanceCoverage(distance_1: f32, pixelsPerDistanceUnit: f32) -> f32 {
        return clamp(((distance_1 * pixelsPerDistanceUnit) + 0.5f), 0f, 1f);
      }

      fn msdfCoverageFromDistances(input: v, distances: vec3f) -> vec3f {
        let baseInside = insideRectangle(input.atlasCoordinate, input.uvBounds);
        let fillCoverage = (distanceCoverage(distances.x, distances.z) * baseInside);
        let outlineCoverage = (distanceCoverage((distances.y + input.outlineWidth), distances.z) * baseInside);
        let outlineOnly = max((outlineCoverage - fillCoverage), 0f);
        let shadowCoverage = (distanceCoverage((input.shadowSample.a - 0.5f), distances.z) * insideRectangle(input.shadowCoordinate, input.uvBounds));
        return vec3f(fillCoverage, outlineOnly, shadowCoverage);
      }

      struct y {
        coverage: vec3f,
        fillColor: vec4f,
        outlineColor: vec4f,
        shadowColor: vec4f,
      }

      fn msdfComposite(input: y) -> vec4f {
        let fillAlpha = (input.fillColor.a * input.coverage.x);
        let outlineAlpha = (input.outlineColor.a * input.coverage.y);
        let glyphAlpha = (fillAlpha + outlineAlpha);
        let shadowAlpha = ((input.shadowColor.a * input.coverage.z) * (1f - glyphAlpha));
        let outputAlpha = (glyphAlpha + shadowAlpha);
        let outputPremultiplied = (((input.fillColor.rgb * fillAlpha) + (input.outlineColor.rgb * outlineAlpha)) + (input.shadowColor.rgb * shadowAlpha));
        return vec4f((outputPremultiplied / max(outputAlpha, 1e-6f)), outputAlpha);
      }

      struct g {
        fillCoverage: f32,
        outlineCoverage: f32,
        shadowCoverage: f32,
        color: vec3f,
        opacity: f32,
        fillDistance: f32,
        trueDistance: f32,
        pixelRange: f32,
      }

      fn msdfRenderDetailed(input: item_1) -> g {
        let coverageInput = v(input.atlasCoordinate, input.shadowCoordinate, input.uvBounds, input.atlasSize, input.pixelRange, input.baseSample, input.shadowSample, input.outlineWidth);
        let distances = msdfDistances(input.baseSample, input.atlasCoordinate, input.atlasSize, input.pixelRange);
        let coverage = msdfCoverageFromDistances(coverageInput, distances);
        let composite = msdfComposite(y(coverage, input.fillColor, input.outlineColor, input.shadowColor));
        return g(coverage.x, coverage.y, coverage.z, composite.rgb, composite.a, distances.x, distances.y, distances.z);
      }

      fn w(input: m) -> g {
        let atlasSize = vec2f(1021, 256);
        let coordinates = msdfClampedCoordinates(input.atlasCoordinate, input.shadowCoordinate, input.uvBounds, atlasSize);
        let baseSample = item(coordinates.xy, input.pageIndex);
        let shadowSample = item(coordinates.zw, input.pageIndex);
        return msdfRenderDetailed(item_1(input.atlasCoordinate, input.shadowCoordinate, input.uvBounds, atlasSize, 4f, baseSample, shadowSample, input.fillColor, input.outlineColor, input.outlineWidth, input.shadowColor));
      }

      @group(0) @binding(2) var<uniform> timeUniform: f32;

      fn transformColor(color: vec4f, fragPos: vec4f) -> vec4f {
        let phase = ((fragPos.x * 4e-3f) - (timeUniform * 2f));
        let rainbow = ((cos(vec3f(phase, (phase + 2.1f), (phase + 4.2f))) * 0.5f) + 0.5f);
        return vec4f((color.rgb * rainbow), color.a);
      }

      struct ee_Input {
        @location(0) uv: vec2f,
        @location(1) shadowUv: vec2f,
        @location(2) bounds: vec4f,
        @location(3) color: vec4f,
        @location(4) outline: vec4f,
        @location(5) shadow: vec4f,
        @location(6) width: f32,
        @location(7) @interpolate(flat) layer: u32,
      }

      @fragment fn ee(_arg_0: ee_Input, @builtin(position) position: vec4f) -> @location(0) vec4f {
        let output = w(m(vec3f(), _arg_0.uv, _arg_0.shadowUv, _arg_0.bounds, _arg_0.color, _arg_0.outline, _arg_0.shadow, _arg_0.width, _arg_0.layer));
        return transformColor(vec4f(output.color, output.opacity), position);
      }"
    `);
  });
});
