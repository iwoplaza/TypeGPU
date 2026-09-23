/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockGlyphLoading } from './utils/commonMocks.ts';

describe('slug text tunnel example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'slug-text-tunnel',
        setupMocks: () => {
          mockGlyphLoading();
        },
        expectedCalls: 5,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "fn corner(index: u32) -> vec2f {
        let x = (((index == 1u) || (index == 4u)) || (index == 5u));
        let y = (((index == 2u) || (index == 3u)) || (index == 5u));
        return vec2f(f32(select(0i, 1i, x)), f32(select(0i, 1i, y)));
      }

      @group(1) @binding(2) var<storage, read> placements: array<vec2f>;

      fn placedSlugOrigin(origin: vec2f, placementSlot: u32) -> vec2f {
        return (origin + placements[placementSlot]);
      }

      struct TunnelParams {
        cameraX: f32,
        twist: f32,
        roll: f32,
        cameraOffset: vec2f,
        fogNear: f32,
        fogFar: f32,
      }

      @group(0) @binding(0) var<uniform> tunnelParams: TunnelParams;

      @group(0) @binding(1) var<uniform> projection: mat4x4f;

      fn transformPosition(position: vec3f, _arg_1: vec2f) -> vec4f {
        let params = (&tunnelParams);
        let depth = ((position.x - (*params).cameraX) / 180f);
        let angle = (((position.y / 180f) + (depth * (*params).twist)) + (*params).roll);
        let wall = ((vec2f(cos(angle), sin(angle)) * 1f) - (*params).cameraOffset);
        return (projection * vec4f(wall, -(depth), 1f));
      }

      fn projectWithScene(position: vec3f, viewport: vec2f, offset: vec2f) -> vec4f {
        let pixel = (vec2f(position.x, -(position.y)) + offset);
        return transformPosition(vec3f(pixel, position.z), viewport);
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

      @group(0) @binding(2) var f: texture_2d<u32>;

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

      @group(0) @binding(3) var p_1: texture_2d<u32>;

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

      @group(0) @binding(4) var d: texture_2d<f32>;

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

      fn transformColor(color: vec4f, fragPos: vec4f) -> vec4f {
        let params = (&tunnelParams);
        let depth = (1f / fragPos.w);
        let fog = (1f - smoothstep((*params).fogNear, (*params).fogFar, depth));
        let glow = (1f + (2.5f * exp((-(depth) * 0.4f))));
        return vec4f((color.rgb * glow), (color.a * fog));
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

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

      @group(1) @binding(0) var src: texture_2d<f32>;

      @group(1) @binding(2) var linear: sampler;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let size = vec2f(textureDimensions(dst));
        let uv = ((vec2f(f32(x), f32(y)) + 0.5f) / size);
        let color = textureSampleLevel(src, linear, uv, 0).rgb;
        let brightness = max(max(color.r, color.g), color.b);
        let weight = (max((brightness - 0.9f), 0f) / max(brightness, 1e-4f));
        textureStore(dst, vec2u(x, y), vec4f((color * weight), 1f));
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

      @group(1) @binding(0) var src: texture_2d<f32>;

      @group(1) @binding(2) var linear: sampler;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let size = vec2f(textureDimensions(dst));
        let uv = ((vec2f(f32(x), f32(y)) + 0.5f) / size);
        let texel = (vec2f(1.5, 0) / size);
        var sum = vec3f();
        var total = 0f;
        // unrolled iteration #0
        {
          const weight = 0.07642628699076809;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -6f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #1
        {
          const weight = 0.16767724875179707;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -5f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #2
        {
          const weight = 0.31890655732397044;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -4f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #3
        {
          const weight = 0.5257880244257798;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -3f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #4
        {
          const weight = 0.751477293075286;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -2f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #5
        {
          const weight = 0.9310627797040227;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -1f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #6
        {
          const weight = 1.;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 0f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #7
        {
          const weight = 0.9310627797040227;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 1f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #8
        {
          const weight = 0.751477293075286;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 2f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #9
        {
          const weight = 0.5257880244257798;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 3f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #10
        {
          const weight = 0.31890655732397044;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 4f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #11
        {
          const weight = 0.16767724875179707;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 5f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #12
        {
          const weight = 0.07642628699076809;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 6f)), 0).rgb * weight);
          total += weight;
        }
        // ---
        textureStore(dst, vec2u(x, y), vec4f((sum / total), 1f));
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

      @group(1) @binding(0) var src: texture_2d<f32>;

      @group(1) @binding(2) var linear: sampler;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let size = vec2f(textureDimensions(dst));
        let uv = ((vec2f(f32(x), f32(y)) + 0.5f) / size);
        let texel = (vec2f(0, 1.5) / size);
        var sum = vec3f();
        var total = 0f;
        // unrolled iteration #0
        {
          const weight = 0.07642628699076809;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -6f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #1
        {
          const weight = 0.16767724875179707;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -5f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #2
        {
          const weight = 0.31890655732397044;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -4f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #3
        {
          const weight = 0.5257880244257798;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -3f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #4
        {
          const weight = 0.751477293075286;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -2f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #5
        {
          const weight = 0.9310627797040227;
          sum += (textureSampleLevel(src, linear, (uv + (texel * -1f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #6
        {
          const weight = 1.;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 0f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #7
        {
          const weight = 0.9310627797040227;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 1f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #8
        {
          const weight = 0.751477293075286;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 2f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #9
        {
          const weight = 0.5257880244257798;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 3f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #10
        {
          const weight = 0.31890655732397044;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 4f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #11
        {
          const weight = 0.16767724875179707;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 5f)), 0).rgb * weight);
          total += weight;
        }
        // unrolled iteration #12
        {
          const weight = 0.07642628699076809;
          sum += (textureSampleLevel(src, linear, (uv + (texel * 6f)), 0).rgb * weight);
          total += weight;
        }
        // ---
        textureStore(dst, vec2u(x, y), vec4f((sum / total), 1f));
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
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

      struct PostParams {
        time: f32,
        aspect: f32,
        bloomIntensity: f32,
        speed: f32,
      }

      @group(0) @binding(0) var<uniform> postParams: PostParams;

      @group(1) @binding(0) var hdr: texture_2d<f32>;

      @group(1) @binding(2) var linear: sampler;

      @group(1) @binding(1) var bloom: texture_2d<f32>;

      fn hash(n: f32) -> f32 {
        return fract((sin(((n * 127.1f) + 311.7f)) * 43758.5453f));
      }

      fn warpStreaks(uv: vec2f, time: f32, aspect: f32) -> f32 {
        let p = ((uv - 0.5f) * vec2f(aspect, 1f));
        let r = length(p);
        let angle = atan2(p.y, p.x);
        var glow = 0f;
        // unrolled iteration #0
        {
          const count = 90f;
          let slot = floor((((angle / 6.283185307179586f) + 0.5f) * count));
          let seed = hash((slot + 0f));
          let centerAngle = ((((slot + 0.5f) / count) - 0.5f) * 6.283185307179586f);
          let angularDist = ((abs((angle - centerAngle)) * r) * count);
          let head = fract(((seed * 7f) + (time * (0.18f + (seed * 0.35f)))));
          let along = (r - (head * 0.9f));
          let tail = (smoothstep(0f, (0.25f + (seed * 0.3f)), along) * (1f - smoothstep(0.3f, 0.45f, along)));
          let line = max(0f, (1f - (angularDist * 6f)));
          glow += (((tail * line) * (0.3f + (seed * 0.7f))) * smoothstep(0.02f, 0.25f, r));
        }
        // unrolled iteration #1
        {
          const count = 140f;
          let slot = floor((((angle / 6.283185307179586f) + 0.5f) * count));
          let seed = hash((slot + 977f));
          let centerAngle = ((((slot + 0.5f) / count) - 0.5f) * 6.283185307179586f);
          let angularDist = ((abs((angle - centerAngle)) * r) * count);
          let head = fract(((seed * 7f) + (time * (0.18f + (seed * 0.35f)))));
          let along = (r - (head * 0.9f));
          let tail = (smoothstep(0f, (0.25f + (seed * 0.3f)), along) * (1f - smoothstep(0.3f, 0.45f, along)));
          let line = max(0f, (1f - (angularDist * 6f)));
          glow += (((tail * line) * (0.3f + (seed * 0.7f))) * smoothstep(0.02f, 0.25f, r));
        }
        // ---
        return glow;
      }

      fn aces(x: vec3f) -> vec3f {
        return saturate(((x * ((x * 2.51f) + 0.03f)) / ((x * ((x * 2.43f) + 0.59f)) + 0.14f)));
      }

      struct compositeFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn compositeFragment(_arg_0: compositeFragment_Input) -> @location(0) vec4f {
        let params = (&postParams);
        let centered = ((_arg_0.uv - 0.5f) * vec2f((*params).aspect, 1f));
        let dist = length(centered);
        let shift = (((_arg_0.uv - 0.5f) * dist) * (4e-3f + ((*params).speed * 8e-4f)));
        let text = vec4f(textureSample(hdr, linear, (_arg_0.uv + shift)).r, textureSample(hdr, linear, _arg_0.uv).g, textureSample(hdr, linear, (_arg_0.uv - shift)).b, textureSample(hdr, linear, _arg_0.uv).a);
        let bloom_1 = textureSample(bloom, linear, _arg_0.uv).rgb;
        let streaks = (warpStreaks(_arg_0.uv, (*params).time, (*params).aspect) * saturate(((*params).speed * 0.12f)));
        var color = mix(vec3f(0.05999999865889549, 0.029999999329447746, 0.11999999731779099), vec3f(0.009999999776482582, 0.009999999776482582, 0.029999999329447746), saturate((dist * 1.6f)));
        color += ((vec3f(0.44999998807907104, 0.3499999940395355, 1) * streaks) * 0.5f);
        color = ((color * (1f - text.a)) + text.rgb);
        color += (bloom_1 * (*params).bloomIntensity);
        let vignette = (1f - smoothstep(0.45f, 1.05f, dist));
        return vec4f(aces((color * vignette)), 1f);
      }"
    `);
  });
});
