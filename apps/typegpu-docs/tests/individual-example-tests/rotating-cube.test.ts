/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('rotating cube example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'rotating-cube',

        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Camera {
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      @group(0) @binding(1) var<uniform> modelUniform: mat4x4f;

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) worldNormal: vec3f,
        @location(1) uv: vec2f,
      }

      struct VertexIn {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        let camera = (&cameraUniform);
        let worldPosition = (modelUniform * vec4f(_arg_0.position, 1f));
        return VertexOut((((*camera).projection * (*camera).view) * worldPosition), (modelUniform * vec4f(_arg_0.normal, 0f)).xyz, _arg_0.uv);
      }

      @group(0) @binding(2) var<uniform> colorUniform: vec3f;

      struct FragmentIn {
        @location(0) worldNormal: vec3f,
        @location(1) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let n = normalize(_arg_0.worldNormal);
        let diffuse = max(dot(n, vec3f(0.36369648575782776, 0.7273929715156555, 0.5819143652915955)), 0f);
        let halfVector = vec3f(0.18402941524982452, 0.5704577565193176, 0.8004443049430847);
        let specular = (pow(max(dot(n, halfVector), 0f), 32f) * 0.4f);
        let cell = floor((_arg_0.uv * 4f));
        let checker = select(0.7f, 1f, (((cell.x + cell.y) % 2f) == 0f));
        let color = (((colorUniform * checker) * (0.15f + (0.85f * diffuse))) + specular);
        return vec4f(color, 1f);
      }"
    `);
  });
});
