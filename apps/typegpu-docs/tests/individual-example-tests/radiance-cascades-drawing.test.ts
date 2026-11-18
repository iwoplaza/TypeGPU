/**
 * @vitest-environment jsdom
 */

import { assert, describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('radiance cascades drawing example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);

    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'radiance-cascades-drawing',
        controlTriggers: ['Clear'],
        expectedCalls: 33,
        beforeCleanup: () => {
          const frame = frames.mock.calls[0]?.[0];
          assert(frame);
          frame(0);
        },
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      @group(0) @binding(2) var radiance: texture_2d<f32>;

      @group(0) @binding(3) var<uniform> displayMode: u32;

      @group(0) @binding(4) var sectors: texture_2d_array<f32>;

      struct fragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
        let material = textureSampleLevel(sceneRead, sampler_1, _arg_0.uv, 0);
        var light = textureSampleLevel(radiance, sampler_1, _arg_0.uv, 0).rgb;
        if ((displayMode >= 2u)) {
          light = textureSampleLevel(sectors, sampler_1, _arg_0.uv, (displayMode - 2u), 0).rgb;
        }
        let color = select((material.rgb + (light * (1f - material.a))), material.rgb, (displayMode == 1u));
        return vec4f(color, 1f);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return p;
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 524288u));
        if ((id >= 524288u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 2u)) * 1i);
        let x = i32((id / 1024u));
        let index = ((((x * 2i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(1f, f32(((2i * direction) - 1i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 1i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 3u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return p;
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 393216u));
        if ((id >= 393216u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 3u)) * 1i);
        let x = i32((id / 1536u));
        let index = ((((x * 3i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(2f, f32(((2i * direction) - 2i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 2i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 5u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return p;
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 327680u));
        if ((id >= 327680u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 5u)) * 1i);
        let x = i32((id / 2560u));
        let index = ((((x * 5i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(4f, f32(((2i * direction) - 4i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 4i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 9u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(0) var<storage, read> source: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      fn load(x: i32, y: i32, direction: i32) -> Interval {
        if (((((x < 0i) || (x >= 128i)) || (y < 0i)) || (y >= 512i))) {
          return empty();
        }
        return unpack(source[((((x * 5i) + direction) * 512i) + y)]);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(0) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn average(a: Interval, b: Interval) -> Interval {
        return Interval(((a.radiance + b.radiance) * 0.5f), ((a.transmission + b.transmission) * 0.5f));
      }

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 163840u));
        if ((id >= 163840u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 5u)) * 2i);
        let x = i32((id / 2560u));
        let index = ((((x * 9i) + direction) * 512i) + y);
        var value = empty();
        {
          let lower = (direction / 2i);
          let offset = ((2i * lower) - 4i);
          let near = load((x * 2i), y, lower);
          value = over(near, load(((x * 2i) + 1i), (y + offset), lower));
          if ((direction < 8i)) {
            let lowerPath = over(near, load(((x * 2i) + 1i), (y + offset), (lower + 1i)));
            let upperPath = over(load((x * 2i), y, (lower + 1i)), load(((x * 2i) + 1i), ((y + offset) + 2i), lower));
            target_1[(index + 512i)] = pack(average(lowerPath, upperPath));
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(0) var<storage, read> source: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      fn load(x: i32, y: i32, direction: i32) -> Interval {
        if (((((x < 0i) || (x >= 64i)) || (y < 0i)) || (y >= 512i))) {
          return empty();
        }
        return unpack(source[((((x * 9i) + direction) * 512i) + y)]);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(0) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn average(a: Interval, b: Interval) -> Interval {
        return Interval(((a.radiance + b.radiance) * 0.5f), ((a.transmission + b.transmission) * 0.5f));
      }

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 147456u));
        if ((id >= 147456u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 9u)) * 2i);
        let x = i32((id / 4608u));
        let index = ((((x * 17i) + direction) * 512i) + y);
        var value = empty();
        {
          let lower = (direction / 2i);
          let offset = ((2i * lower) - 8i);
          let near = load((x * 2i), y, lower);
          value = over(near, load(((x * 2i) + 1i), (y + offset), lower));
          if ((direction < 16i)) {
            let lowerPath = over(near, load(((x * 2i) + 1i), (y + offset), (lower + 1i)));
            let upperPath = over(load((x * 2i), y, (lower + 1i)), load(((x * 2i) + 1i), ((y + offset) + 2i), lower));
            target_1[(index + 512i)] = pack(average(lowerPath, upperPath));
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(0) var<storage, read> source: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      fn load(x: i32, y: i32, direction: i32) -> Interval {
        if (((((x < 0i) || (x >= 32i)) || (y < 0i)) || (y >= 512i))) {
          return empty();
        }
        return unpack(source[((((x * 17i) + direction) * 512i) + y)]);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(0) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn average(a: Interval, b: Interval) -> Interval {
        return Interval(((a.radiance + b.radiance) * 0.5f), ((a.transmission + b.transmission) * 0.5f));
      }

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 139264u));
        if ((id >= 139264u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 17u)) * 2i);
        let x = i32((id / 8704u));
        let index = ((((x * 33i) + direction) * 512i) + y);
        var value = empty();
        {
          let lower = (direction / 2i);
          let offset = ((2i * lower) - 16i);
          let near = load((x * 2i), y, lower);
          value = over(near, load(((x * 2i) + 1i), (y + offset), lower));
          if ((direction < 32i)) {
            let lowerPath = over(near, load(((x * 2i) + 1i), (y + offset), (lower + 1i)));
            let upperPath = over(load((x * 2i), y, (lower + 1i)), load(((x * 2i) + 1i), ((y + offset) + 2i), lower));
            target_1[(index + 512i)] = pack(average(lowerPath, upperPath));
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(0) var<storage, read> source: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      fn load(x: i32, y: i32, direction: i32) -> Interval {
        if (((((x < 0i) || (x >= 16i)) || (y < 0i)) || (y >= 512i))) {
          return empty();
        }
        return unpack(source[((((x * 33i) + direction) * 512i) + y)]);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(0) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn average(a: Interval, b: Interval) -> Interval {
        return Interval(((a.radiance + b.radiance) * 0.5f), ((a.transmission + b.transmission) * 0.5f));
      }

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 135168u));
        if ((id >= 135168u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 33u)) * 2i);
        let x = i32((id / 16896u));
        let index = ((((x * 65i) + direction) * 512i) + y);
        var value = empty();
        {
          let lower = (direction / 2i);
          let offset = ((2i * lower) - 32i);
          let near = load((x * 2i), y, lower);
          value = over(near, load(((x * 2i) + 1i), (y + offset), lower));
          if ((direction < 64i)) {
            let lowerPath = over(near, load(((x * 2i) + 1i), (y + offset), (lower + 1i)));
            let upperPath = over(load((x * 2i), y, (lower + 1i)), load(((x * 2i) + 1i), ((y + offset) + 2i), lower));
            target_1[(index + 512i)] = pack(average(lowerPath, upperPath));
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(0) var<storage, read> source: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      fn load(x: i32, y: i32, direction: i32) -> Interval {
        if (((((x < 0i) || (x >= 8i)) || (y < 0i)) || (y >= 512i))) {
          return empty();
        }
        return unpack(source[((((x * 65i) + direction) * 512i) + y)]);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(0) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn average(a: Interval, b: Interval) -> Interval {
        return Interval(((a.radiance + b.radiance) * 0.5f), ((a.transmission + b.transmission) * 0.5f));
      }

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 133120u));
        if ((id >= 133120u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 65u)) * 2i);
        let x = i32((id / 33280u));
        let index = ((((x * 129i) + direction) * 512i) + y);
        var value = empty();
        {
          let lower = (direction / 2i);
          let offset = ((2i * lower) - 64i);
          let near = load((x * 2i), y, lower);
          value = over(near, load(((x * 2i) + 1i), (y + offset), lower));
          if ((direction < 128i)) {
            let lowerPath = over(near, load(((x * 2i) + 1i), (y + offset), (lower + 1i)));
            let upperPath = over(load((x * 2i), y, (lower + 1i)), load(((x * 2i) + 1i), ((y + offset) + 2i), lower));
            target_1[(index + 512i)] = pack(average(lowerPath, upperPath));
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(0) var<storage, read> source: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      fn load(x: i32, y: i32, direction: i32) -> Interval {
        if (((((x < 0i) || (x >= 4i)) || (y < 0i)) || (y >= 512i))) {
          return empty();
        }
        return unpack(source[((((x * 129i) + direction) * 512i) + y)]);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(0) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn average(a: Interval, b: Interval) -> Interval {
        return Interval(((a.radiance + b.radiance) * 0.5f), ((a.transmission + b.transmission) * 0.5f));
      }

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 132096u));
        if ((id >= 132096u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 129u)) * 2i);
        let x = i32((id / 66048u));
        let index = ((((x * 257i) + direction) * 512i) + y);
        var value = empty();
        {
          let lower = (direction / 2i);
          let offset = ((2i * lower) - 128i);
          let near = load((x * 2i), y, lower);
          value = over(near, load(((x * 2i) + 1i), (y + offset), lower));
          if ((direction < 256i)) {
            let lowerPath = over(near, load(((x * 2i) + 1i), (y + offset), (lower + 1i)));
            let upperPath = over(load((x * 2i), y, (lower + 1i)), load(((x * 2i) + 1i), ((y + offset) + 2i), lower));
            target_1[(index + 512i)] = pack(average(lowerPath, upperPath));
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(0) var<storage, read> source: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      fn load(x: i32, y: i32, direction: i32) -> Interval {
        if (((((x < 0i) || (x >= 2i)) || (y < 0i)) || (y >= 512i))) {
          return empty();
        }
        return unpack(source[((((x * 257i) + direction) * 512i) + y)]);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(0) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn average(a: Interval, b: Interval) -> Interval {
        return Interval(((a.radiance + b.radiance) * 0.5f), ((a.transmission + b.transmission) * 0.5f));
      }

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 131584u));
        if ((id >= 131584u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 257u)) * 2i);
        let x = i32((id / 131584u));
        let index = ((((x * 513i) + direction) * 512i) + y);
        var value = empty();
        {
          let lower = (direction / 2i);
          let offset = ((2i * lower) - 256i);
          let near = load((x * 2i), y, lower);
          value = over(near, load(((x * 2i) + 1i), (y + offset), lower));
          if ((direction < 512i)) {
            let lowerPath = over(near, load(((x * 2i) + 1i), (y + offset), (lower + 1i)));
            let upperPath = over(load((x * 2i), y, (lower + 1i)), load(((x * 2i) + 1i), ((y + offset) + 2i), lower));
            target_1[(index + 512i)] = pack(average(lowerPath, upperPath));
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(0) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        return vec3f();
      }

      @group(0) @binding(3) var<storage, read_write> target_1: array<vec2u>;

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 256u));
        let x = i32((id / 131072u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 512i)) / 512f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 512i)) / 512f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 513i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 257i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 256i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 512i)) / 512f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 512i)) / 512f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 513i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 257i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 256i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        target_1[id] = pack(vec4f(result, 0f));
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(0) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(0) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 2i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 128i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      @group(0) @binding(3) var<storage, read_write> target_1: array<vec2u>;

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 128u));
        let x = i32((id / 65536u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 256i)) / 256f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 256i)) / 256f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 257i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 129i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 128i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 256i)) / 256f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 256i)) / 256f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 257i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 129i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 128i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        target_1[id] = pack(vec4f(result, 0f));
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(0) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(0) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 4i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 64i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      @group(0) @binding(3) var<storage, read_write> target_1: array<vec2u>;

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 64u));
        let x = i32((id / 32768u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 128i)) / 128f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 128i)) / 128f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 129i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 65i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 64i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 128i)) / 128f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 128i)) / 128f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 129i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 65i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 64i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        target_1[id] = pack(vec4f(result, 0f));
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(0) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(0) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 8i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 32i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      @group(0) @binding(3) var<storage, read_write> target_1: array<vec2u>;

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 32u));
        let x = i32((id / 16384u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 64i)) / 64f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 64i)) / 64f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 65i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 33i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 32i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 64i)) / 64f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 64i)) / 64f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 65i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 33i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 32i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        target_1[id] = pack(vec4f(result, 0f));
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(0) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(0) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 16i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 16i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      @group(0) @binding(3) var<storage, read_write> target_1: array<vec2u>;

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 16u));
        let x = i32((id / 8192u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 32i)) / 32f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 32i)) / 32f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 33i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 17i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 16i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 32i)) / 32f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 32i)) / 32f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 33i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 17i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 16i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        target_1[id] = pack(vec4f(result, 0f));
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(0) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(0) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 32i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 8i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      @group(0) @binding(3) var<storage, read_write> target_1: array<vec2u>;

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 8u));
        let x = i32((id / 4096u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 16i)) / 16f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 16i)) / 16f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 17i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 9i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 8i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 16i)) / 16f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 16i)) / 16f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 17i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 9i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 8i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        target_1[id] = pack(vec4f(result, 0f));
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(0) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(0) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 64i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 4i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      @group(0) @binding(3) var<storage, read_write> target_1: array<vec2u>;

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 4u));
        let x = i32((id / 2048u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 8i)) / 8f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 8i)) / 8f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 9i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 5i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 4i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 8i)) / 8f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 8i)) / 8f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 9i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 5i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 4i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        target_1[id] = pack(vec4f(result, 0f));
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(0) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(0) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(0) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 128i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 2i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      @group(0) @binding(3) var<storage, read_write> target_1: array<vec2u>;

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 2u));
        let x = i32((id / 1024u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 4i)) / 4f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 4i)) / 4f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 5i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 3i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 2i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 4i)) / 4f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 4i)) / 4f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 5i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 3i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 2i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        target_1[id] = pack(vec4f(result, 0f));
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(1) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(1) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(1) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 256i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 1i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return p;
      }

      @group(0) @binding(0) var sectorWrite: texture_storage_2d_array<rgba16float, write>;

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 1u));
        let x = i32((id / 512u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 2i)) / 2f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 2i)) / 2f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 3i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 2i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 1i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 2i)) / 2f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 2i)) / 2f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 3i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 2i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 1i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        {
          let pixel = vec2i(select((x - 1i), 511i, (x == 0i)), y);
          let value = select(unpack_1(pack(vec4f(result, 0f))), vec4f(), (x == 0i));
          textureStore(sectorWrite, worldPixel(pixel), 0, value);
        }
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i((511i - p.y), p.x);
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 524288u));
        if ((id >= 524288u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 2u)) * 1i);
        let x = i32((id / 1024u));
        let index = ((((x * 2i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(1f, f32(((2i * direction) - 1i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 1i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 3u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i((511i - p.y), p.x);
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 393216u));
        if ((id >= 393216u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 3u)) * 1i);
        let x = i32((id / 1536u));
        let index = ((((x * 3i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(2f, f32(((2i * direction) - 2i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 2i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 5u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i((511i - p.y), p.x);
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 327680u));
        if ((id >= 327680u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 5u)) * 1i);
        let x = i32((id / 2560u));
        let index = ((((x * 5i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(4f, f32(((2i * direction) - 4i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 4i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 9u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(1) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(1) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(1) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 256i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 1i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i((511i - p.y), p.x);
      }

      @group(0) @binding(0) var sectorWrite: texture_storage_2d_array<rgba16float, write>;

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 1u));
        let x = i32((id / 512u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 2i)) / 2f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 2i)) / 2f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 3i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 2i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 1i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 2i)) / 2f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 2i)) / 2f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 3i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 2i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 1i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        {
          let pixel = vec2i(select((x - 1i), 511i, (x == 0i)), y);
          let value = select(unpack_1(pack(vec4f(result, 0f))), vec4f(), (x == 0i));
          textureStore(sectorWrite, worldPixel(pixel), 1, value);
        }
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i((511i - p.x), (511i - p.y));
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 524288u));
        if ((id >= 524288u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 2u)) * 1i);
        let x = i32((id / 1024u));
        let index = ((((x * 2i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(1f, f32(((2i * direction) - 1i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 1i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 3u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i((511i - p.x), (511i - p.y));
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 393216u));
        if ((id >= 393216u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 3u)) * 1i);
        let x = i32((id / 1536u));
        let index = ((((x * 3i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(2f, f32(((2i * direction) - 2i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 2i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 5u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i((511i - p.x), (511i - p.y));
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 327680u));
        if ((id >= 327680u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 5u)) * 1i);
        let x = i32((id / 2560u));
        let index = ((((x * 5i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(4f, f32(((2i * direction) - 4i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 4i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 9u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(1) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(1) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(1) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 256i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 1i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i((511i - p.x), (511i - p.y));
      }

      @group(0) @binding(0) var sectorWrite: texture_storage_2d_array<rgba16float, write>;

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 1u));
        let x = i32((id / 512u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 2i)) / 2f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 2i)) / 2f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 3i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 2i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 1i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 2i)) / 2f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 2i)) / 2f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 3i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 2i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 1i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        {
          let pixel = vec2i(select((x - 1i), 511i, (x == 0i)), y);
          let value = select(unpack_1(pack(vec4f(result, 0f))), vec4f(), (x == 0i));
          textureStore(sectorWrite, worldPixel(pixel), 2, value);
        }
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i(p.y, (511i - p.x));
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 524288u));
        if ((id >= 524288u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 2u)) * 1i);
        let x = i32((id / 1024u));
        let index = ((((x * 2i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(1f, f32(((2i * direction) - 1i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 1i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 3u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i(p.y, (511i - p.x));
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 393216u));
        if ((id >= 393216u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 3u)) * 1i);
        let x = i32((id / 1536u));
        let index = ((((x * 3i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(2f, f32(((2i * direction) - 2i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 2i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 5u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i(p.y, (511i - p.x));
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      fn integrate(emission: vec3f, extinction: f32, distance_1: f32) -> Interval {
        let sigma = vec3f(extinction);
        let transmission = exp((-(sigma.r) * distance_1));
        var integral = distance_1;
        if ((sigma.r > 1e-5f)) {
          integral = ((1f - transmission) / sigma.r);
        }
        return Interval((emission * integral), transmission);
      }

      fn over(near: Interval, far: Interval) -> Interval {
        return Interval((near.radiance + (near.transmission * far.radiance)), (near.transmission * far.transmission));
      }

      @group(1) @binding(1) var<storage, read_write> target_1: array<array<u32, 2>>;

      fn pack(value: Interval) -> array<u32, 2> {
        let transmission = vec3f(value.transmission);
        var packed = array<u32, 2>();
        packed[0i] = pack2x16float(value.radiance.rg);
        packed[1i] = pack2x16float(vec2f(value.radiance.b, transmission.r));
        return packed;
      }

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 327680u));
        if ((id >= 327680u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = (i32(((id / 512u) % 5u)) * 1i);
        let x = i32((id / 2560u));
        let index = ((((x * 5i) + direction) * 512i) + y);
        var value = empty();
        {
          let delta = vec2f(4f, f32(((2i * direction) - 4i)));
          let length_1 = length(delta);
          let crossingStep = (length_1 / max(abs(delta), vec2f(9.999999747378752e-6)));
          var crossing = (crossingStep * 0.5f);
          var pixel = vec2i((x * 4i), y);
          var distance_1 = 0f;
          for (var sample = 0u; (sample < 9u); sample++) {
            if (((((pixel.x >= 512i) || (pixel.y < 0i)) || (pixel.y >= 512i)) || (distance_1 >= length_1))) {
              break;
            }
            let end = min(length_1, min(crossing.x, crossing.y));
            let sampleLength = (end - distance_1);
            let world = vec2u(worldPixel(pixel));
            let material = medium(world);
            let emission = material.emission;
            value = over(value, integrate(emission, material.extinction, sampleLength));
            if ((crossing.x <= end)) {
              pixel.x += 1i;
              crossing.x += crossingStep.x;
            }
            if ((crossing.y <= end)) {
              pixel.y += select(-1i, 1i, (delta.y >= 0f));
              crossing.y += crossingStep.y;
            }
            distance_1 = end;
          }
        }
        target_1[index] = pack(value);
      }

      struct Interval {
        radiance: vec3f,
        transmission: f32,
      }

      fn empty() -> Interval {
        return Interval(vec3f(), 1f);
      }

      @group(1) @binding(1) var<storage, read> far: array<array<u32, 2>>;

      fn unpack(packed: array<u32, 2>) -> Interval {
        let rg = unpack2x16float(packed[0i]);
        let bt = unpack2x16float(packed[1i]);
        return Interval(vec3f(rg, bt.x), bt.y);
      }

      @group(1) @binding(0) var<storage, read> near: array<array<u32, 2>>;

      @group(1) @binding(2) var<storage, read> upper: array<vec2u>;

      fn unpack_1(v: vec2u) -> vec4f {
        return vec4f(unpack2x16float(v.x), unpack2x16float(v.y));
      }

      fn readUpper(x: i32, y: i32, direction: i32) -> vec3f {
        if ((((x >= 256i) || (y < 0i)) || (y >= 512i))) {
          return vec3f();
        }
        return unpack_1(upper[(((((x * 1i) * 2i) + direction) * 512i) + y)]).rgb;
      }

      fn pack(v: vec4f) -> vec2u {
        return vec2u(pack2x16float(v.xy), pack2x16float(v.zw));
      }

      fn worldPixel(p: vec2i) -> vec2i {
        return vec2i(p.y, (511i - p.x));
      }

      @group(0) @binding(0) var sectorWrite: texture_storage_2d_array<rgba16float, write>;

      @compute @workgroup_size(64) fn compute(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let y = i32((id % 512u));
        let direction = i32(((id / 512u) % 1u));
        let x = i32((id / 512u));
        let even = ((x % 2i) == 0i);
        var result = vec3f();
        // unrolled iteration #0
        {
          let boundary = (direction + 0i);
          let upperDirection = ((direction * 2i) + 0i);
          let slope0 = (f32(((2i * upperDirection) - 2i)) / 2f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 2i)) / 2f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 3i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 2i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 1i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // unrolled iteration #1
        {
          let boundary = (direction + 1i);
          let upperDirection = ((direction * 2i) + 1i);
          let slope0 = (f32(((2i * upperDirection) - 2i)) / 2f);
          let slope1 = (f32(((2i * (upperDirection + 1i)) - 2i)) / 2f);
          let angle = ((atan(slope1) - atan(slope0)) / 6.283185307179586f);
          var segment = empty();
          if (even) {
            segment = unpack(far[(((((x / 2i) * 3i) + (boundary * 2i)) * 512i) + y)]);
          }
          else {
            segment = unpack(near[((((x * 2i) + boundary) * 512i) + y)]);
          }
          let targetY = (y + (((2i * boundary) - 1i) * select(1i, 2i, even)));
          let distant = readUpper(((x / 2i) + 1i), targetY, upperDirection);
          var contribution = ((segment.radiance * angle) + (segment.transmission * distant));
          if (even) {
            contribution = ((contribution + readUpper((x / 2i), y, upperDirection)) * 0.5f);
          }
          result += contribution;
        }
        // ---
        {
          let pixel = vec2i(select((x - 1i), 511i, (x == 0i)), y);
          let value = select(unpack_1(pack(vec4f(result, 0f))), vec4f(), (x == 0i));
          textureStore(sectorWrite, worldPixel(pixel), 3, value);
        }
      }

      @group(0) @binding(0) var sceneRead: texture_2d<f32>;

      struct Medium {
        emission: vec3f,
        extinction: f32,
      }

      fn medium(pixel: vec2u) -> Medium {
        let material = textureLoad(sceneRead, pixel, 0);
        return Medium((material.rgb * 16f), (material.a * 16f));
      }

      @group(0) @binding(1) var sectorRead: texture_2d_array<f32>;

      fn sum(p: vec2i) -> vec3f {
        var value = vec3f();
        // unrolled iteration #0
        value += textureLoad(sectorRead, p, 0, 0).rgb;
        // unrolled iteration #1
        value += textureLoad(sectorRead, p, 1, 0).rgb;
        // unrolled iteration #2
        value += textureLoad(sectorRead, p, 2, 0).rgb;
        // unrolled iteration #3
        value += textureLoad(sectorRead, p, 3, 0).rgb;
        // ---
        return value;
      }

      @group(0) @binding(2) var outputWrite: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(64) fn integrate(@builtin(global_invocation_id) gid: vec3u) {
        let id = (gid.x + (gid.y * 262144u));
        if ((id >= 262144u)) {
          return;
        }
        let pixel = vec2i(i32((id % 512u)), i32((id / 512u)));
        let opacity = exp((vec3f(medium(vec2u(pixel)).extinction) * -1f));
        var value = (sum(pixel) * 4f);
        var weight = 4f;
        // unrolled iteration #0
        {
          let offset = vec2i(1, 0);
          let p = (pixel + offset);
          if ((all((p >= vec2i())) && all((p < vec2i(512))))) {
            let neighborOpacity = exp((vec3f(medium(vec2u(p)).extinction) * -1f));
            if (all((abs((opacity - neighborOpacity)) < vec3f(0.10000000149011612)))) {
              value += sum(p);
              weight += 1f;
            }
          }
        }
        // unrolled iteration #1
        {
          let offset = vec2i(0, 1);
          let p = (pixel + offset);
          if ((all((p >= vec2i())) && all((p < vec2i(512))))) {
            let neighborOpacity = exp((vec3f(medium(vec2u(p)).extinction) * -1f));
            if (all((abs((opacity - neighborOpacity)) < vec3f(0.10000000149011612)))) {
              value += sum(p);
              weight += 1f;
            }
          }
        }
        // unrolled iteration #2
        {
          let offset = vec2i(-1, 0);
          let p = (pixel + offset);
          if ((all((p >= vec2i())) && all((p < vec2i(512))))) {
            let neighborOpacity = exp((vec3f(medium(vec2u(p)).extinction) * -1f));
            if (all((abs((opacity - neighborOpacity)) < vec3f(0.10000000149011612)))) {
              value += sum(p);
              weight += 1f;
            }
          }
        }
        // unrolled iteration #3
        {
          let offset = vec2i(0, -1);
          let p = (pixel + offset);
          if ((all((p >= vec2i())) && all((p < vec2i(512))))) {
            let neighborOpacity = exp((vec3f(medium(vec2u(p)).extinction) * -1f));
            if (all((abs((opacity - neighborOpacity)) < vec3f(0.10000000149011612)))) {
              value += sum(p);
              weight += 1f;
            }
          }
        }
        // ---
        textureStore(outputWrite, pixel, vec4f((value / weight), 1f));
      }"
    `);
  });
});
