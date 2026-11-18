import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { describe, expect, it } from 'vitest';
import { tgpu, d } from 'typegpu';
import { toTSL } from '@typegpu/three';
import { buildMaterial, isNagaAvailable, validateWgsl } from './utils/build-material.ts';

function materialCalling(fn: () => number) {
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = TSL.vec4(
    toTSL(() => {
      'use gpu';
      return fn();
    }),
    0,
    0,
    1,
  );
  return material;
}

describe('names used by three.js', () => {
  it.each(['main', 'output', 'nodeVar0'])(
    'are not given to TypeGPU functions in WGSL (%s)',
    (name) => {
      const fn = tgpu
        .fn(
          [],
          d.f32,
        )(() => 0.5)
        .$name(name);
      const { fragmentShader } = buildMaterial(materialCalling(fn), 'webgpu');

      expect(fragmentShader).not.toMatch(new RegExp(`fn ${name}\\(\\)`));
      expect(fragmentShader).toContain(`fn ${name}_1() -> f32`);
      if (isNagaAvailable) {
        expect(validateWgsl(fragmentShader)).toBeUndefined();
      }
    },
  );

  it('are not given to TypeGPU functions in GLSL', () => {
    const main = tgpu.fn([], d.f32)(() => 0.5);
    const { fragmentShader } = buildMaterial(materialCalling(main), 'webgl');

    expect(fragmentShader).not.toContain('float main()');
    expect(fragmentShader).toContain('float main_1()');
    expect(fragmentShader.match(/\bmain\(/g)).toHaveLength(1);
  });

  it('are not given to TypeGPU variables', () => {
    const output = tgpu.privateVar(d.f32, 0.5);
    const fn = tgpu.fn([], d.f32)(() => output.$);
    const { fragmentShader } = buildMaterial(materialCalling(fn), 'webgpu');

    expect(fragmentShader).toContain('var<private> output_1: f32 = 0.5f;');
    if (isNagaAvailable) {
      expect(validateWgsl(fragmentShader)).toBeUndefined();
    }
  });

  it.each([
    ['fragCoord', TSL.screenUV.x],
    ['isFront', TSL.select(TSL.frontFacing, 1, 0)],
  ] as const)(
    'are not given to TypeGPU functions when they are builtins of main in WGSL (%s)',
    (name, threeNode) => {
      const fn = tgpu
        .fn(
          [],
          d.f32,
        )(() => 0.5)
        .$name(name);
      const material = new THREE.MeshBasicNodeMaterial();
      material.colorNode = TSL.vec4(toTSL(fn), threeNode, 0, 1);
      const { fragmentShader } = buildMaterial(material, 'webgpu');

      expect(fragmentShader).toMatch(new RegExp(`@builtin\\( \\w+ \\) ${name} :`));
      expect(fragmentShader).not.toMatch(new RegExp(`fn ${name}\\(\\)`));
      expect(fragmentShader).toContain(`fn ${name}_1() -> f32`);
      if (isNagaAvailable) {
        expect(validateWgsl(fragmentShader)).toBeUndefined();
      }
    },
  );

  it.each(['webgpu', 'webgl'] as const)(
    'are not given to TypeGPU functions when they are vertex attributes (%s)',
    (backend) => {
      const normal = tgpu.fn([], d.f32)(() => 0.5);
      const material = new THREE.MeshBasicNodeMaterial();
      material.positionNode = TSL.positionLocal.add(TSL.normalLocal.mul(toTSL(normal)));
      const { vertexShader } = buildMaterial(material, backend);

      if (backend === 'webgl') {
        expect(vertexShader).toMatch(/in vec3 normal;/);
        expect(vertexShader).not.toContain('float normal()');
        expect(vertexShader).toContain('float normal_1()');
      } else {
        expect(vertexShader).toMatch(/@location\( \d+ \) normal :/);
        expect(vertexShader).not.toContain('fn normal()');
        expect(vertexShader).toContain('fn normal_1() -> f32');
        if (isNagaAvailable) {
          expect(validateWgsl(vertexShader)).toBeUndefined();
        }
      }
    },
  );
});
