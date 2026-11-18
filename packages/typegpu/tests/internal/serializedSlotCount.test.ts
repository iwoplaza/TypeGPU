import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { d, tgpu } from '../../src/index.js';
import { serializedSlotCount } from '../../src/tgsl/consoleLog/serializedLayout.ts';

const leafTypes = [
  d.f32,
  d.f16,
  d.i32,
  d.u32,
  d.bool,
  d.vec2f,
  d.vec3f,
  d.vec4f,
  d.vec2h,
  d.vec3h,
  d.vec4h,
  d.vec2i,
  d.vec3i,
  d.vec4i,
  d.vec2u,
  d.vec3u,
  d.vec4u,
  d.vec2b,
  d.vec3b,
  d.vec4b,
  d.mat2x2f,
  d.mat3x3f,
  d.mat4x4f,
];

describe('serializedSlotCount', () => {
  it.for(leafTypes.map((schema) => [schema.type, schema] as const))(
    'matches the number of slots written for %s',
    ([, schema], { root }) => {
      const fn = tgpu.computeFn({ workgroupSize: [1] })(() => {
        'use gpu';
        console.log(schema());
      });
      const wgsl = tgpu.resolve([root.createComputePipeline({ compute: fn })]);
      const writes = wgsl.match(/serializedData\[nextByteIndex\(\)\] =/g)?.length;

      expect(serializedSlotCount(schema)).toBe(writes);
    },
  );

  it('counts struct fields and array elements without padding', () => {
    const Inner = d.struct({ a: d.f32, b: d.vec3f });

    expect(serializedSlotCount(Inner)).toBe(4);
    expect(serializedSlotCount(d.arrayOf(d.vec3f, 2))).toBe(6);
    expect(serializedSlotCount(d.struct({ inner: Inner, list: d.arrayOf(Inner, 3) }))).toBe(16);
  });
});
