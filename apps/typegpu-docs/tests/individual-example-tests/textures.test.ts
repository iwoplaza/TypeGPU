/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockImageLoading, mockCreateImageBitmap } from './utils/commonMocks.ts';

describe('textures example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'textures',
        setupMocks: () => {
          mockImageLoading();
          mockCreateImageBitmap();
        },
        expectedCalls: 3,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "
      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
        const pos = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
        return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
      }


      @group(0) @binding(0) var src: texture_2d<f32>;
      @group(0) @binding(1) var samp: sampler;

      @fragment
      fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(src, samp, uv);
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

      struct Params {
        time: f32,
        tiling: f32,
        aspect: f32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      @group(0) @binding(1) var textureView: texture_2d<f32>;

      @group(1) @binding(0) var sampler_1: sampler;

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let p = (&params);
        let depth = (1.25f / (_arg_0.uv.y + 0.25f));
        let planeUv = vec2f(((((_arg_0.uv.x - 0.5f) * depth) * (*p).aspect) + 0.5f), depth);
        let rotation = ((*p).time * 0.1f);
        let c = cos(rotation);
        let s = sin(rotation);
        let centered = (planeUv - 0.5f);
        let rotated = vec2f(((c * centered.x) - (s * centered.y)), ((s * centered.x) + (c * centered.y)));
        let sampleUv = ((rotated * (*p).tiling) + 0.5f);
        return textureSample(textureView, sampler_1, sampleUv);
      }"
    `);
  });
});
