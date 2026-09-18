/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('instancing example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'instancing',

        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Particle {
        position: vec2f,
        velocity: vec2f,
        color: vec3f,
        size: f32,
      }

      @group(0) @binding(1) var<storage, read_write> particleBuffer: array<Particle, 2500>;

      struct Params {
        deltaTime: f32,
        time: f32,
        aspect: f32,
        speed: f32,
      }

      @group(0) @binding(2) var<uniform> params: Params;

      fn wrappedCallback(index: u32, _arg_1: u32, _arg_2: u32) {
        let p = (&particleBuffer[index]);
        let swirl = (vec2f(-((*p).position.y), (*p).position.x) * 0.15f);
        let drift = (vec2f(sin((params.time + ((*p).position.y * 3f))), cos(((params.time * 0.7f) + ((*p).position.x * 3f)))) * 0.1f);
        var position = ((*p).position + (((((*p).velocity + swirl) + drift) * params.deltaTime) * params.speed));
        position = ((fract(((position + 1f) * 0.5f)) * 2f) - 1f);
        particleBuffer[index].position = position;
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
      }

      struct Params {
        deltaTime: f32,
        time: f32,
        aspect: f32,
        speed: f32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) color: vec3f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
        @location(0) size: f32,
        @location(1) position: vec2f,
        @location(2) color: vec3f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        let corner = vec2f(f32(select(-1i, 1i, (((_arg_0.vertexIndex == 1u) || (_arg_0.vertexIndex == 4u)) || (_arg_0.vertexIndex == 5u)))), f32(select(-1i, 1i, (((_arg_0.vertexIndex == 2u) || (_arg_0.vertexIndex == 3u)) || (_arg_0.vertexIndex == 5u)))));
        let offset = ((corner * _arg_0.size) * vec2f((1f / params.aspect), 1f));
        return VertexOut(vec4f((_arg_0.position + offset), 0f, 1f), corner, _arg_0.color);
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
        @location(1) color: vec3f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let dist = length(_arg_0.uv);
        let alpha = (1f - smoothstep(0.7f, 1f, dist));
        return vec4f((_arg_0.color * 0.8f), (alpha * 0.8f));
      }"
    `);
  });
});
