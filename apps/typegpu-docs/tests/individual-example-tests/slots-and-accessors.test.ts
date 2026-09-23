/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('slots and accessors example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'slots-and-accessors',

        expectedCalls: 3,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "const quadCorners: array<vec2f, 6> = array<vec2f, 6>(vec2f(), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1));

      @group(0) @binding(0) var<uniform> columnAspectUniform: f32;

      struct vertex_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertex(@builtin(vertex_index) index: u32) -> vertex_Output {
        let corner = quadCorners[index];
        const columnWidth = 0.6666666666666666;
        let left = (-1f + (0f * columnWidth));
        return vertex_Output(vec4f((left + (corner.x * columnWidth)), ((corner.y * 2f) - 1f), 0f, 1f), vec2f((((corner.x - 0.5f) * columnAspectUniform) + 0.5f), (1f - corner.y)));
      }

      @group(0) @binding(1) var<uniform> scaleUniform: f32;

      @group(0) @binding(2) var<uniform> timeUniform: f32;

      fn stripes(uv: vec2f) -> f32 {
        let t = sin((((uv.x + uv.y) * scaleUniform) + (timeUniform * 2f)));
        return smoothstep(-0.1f, 0.1f, t);
      }

      struct fragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
        let brightness = stripes(_arg_0.uv);
        return vec4f((vec3f(1, 0.44999998807907104, 0.3499999940395355) * brightness), 1f);
      }

      const quadCorners: array<vec2f, 6> = array<vec2f, 6>(vec2f(), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1));

      @group(0) @binding(0) var<uniform> columnAspectUniform: f32;

      struct vertex_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertex(@builtin(vertex_index) index: u32) -> vertex_Output {
        let corner = quadCorners[index];
        const columnWidth = 0.6666666666666666;
        let left = (-1f + (1f * columnWidth));
        return vertex_Output(vec4f((left + (corner.x * columnWidth)), ((corner.y * 2f) - 1f), 0f, 1f), vec2f((((corner.x - 0.5f) * columnAspectUniform) + 0.5f), (1f - corner.y)));
      }

      @group(0) @binding(1) var<uniform> scaleUniform: f32;

      @group(0) @binding(2) var<uniform> timeUniform: f32;

      fn rings(uv: vec2f) -> f32 {
        let dist = ((length((uv - 0.5f)) * scaleUniform) - (timeUniform * 2f));
        return smoothstep(-0.2f, 0.2f, sin((dist * 2f)));
      }

      @group(0) @binding(3) var<uniform> animatedTint: vec3f;

      struct fragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
        let brightness = rings(_arg_0.uv);
        return vec4f((animatedTint * brightness), 1f);
      }

      const quadCorners: array<vec2f, 6> = array<vec2f, 6>(vec2f(), vec2f(1, 0), vec2f(0, 1), vec2f(0, 1), vec2f(1, 0), vec2f(1));

      @group(0) @binding(0) var<uniform> columnAspectUniform: f32;

      struct vertex_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertex(@builtin(vertex_index) index: u32) -> vertex_Output {
        let corner = quadCorners[index];
        const columnWidth = 0.6666666666666666;
        let left = (-1f + (2f * columnWidth));
        return vertex_Output(vec4f((left + (corner.x * columnWidth)), ((corner.y * 2f) - 1f), 0f, 1f), vec2f((((corner.x - 0.5f) * columnAspectUniform) + 0.5f), (1f - corner.y)));
      }

      @group(0) @binding(1) var<uniform> timeUniform: f32;

      @group(0) @binding(2) var<uniform> scaleUniform: f32;

      fn checker(uv: vec2f) -> f32 {
        let angle = (timeUniform * 0.3f);
        let centered = (uv - 0.5f);
        let rotated = vec2f(((centered.x * cos(angle)) - (centered.y * sin(angle))), ((centered.x * sin(angle)) + (centered.y * cos(angle))));
        let cell = floor((rotated * scaleUniform));
        return select(0.2f, 1f, (((cell.x + cell.y) % 2f) == 0f));
      }

      fn cyclingTint() -> vec3f {
        return mix(vec3f(0.30000001192092896, 0.6000000238418579, 1), vec3f(0.699999988079071, 1, 0.800000011920929), ((sin(timeUniform) * 0.5f) + 0.5f));
      }

      struct fragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
        let brightness = checker(_arg_0.uv);
        return vec4f((cyclingTint() * brightness), 1f);
      }"
    `);
  });
});
