import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import { isCloseTo } from 'typegpu/std';

describe('infix operators', () => {
  it('correctly applies add to vectors', () => {
    // vector + scalar
    expect(isCloseTo(d.vec2f(1, 2).add(2), d.vec2f(3, 4))).toBe(true);

    // vector + vector
    expect(d.vec3i(1, 2, 3).add(d.vec3i(-1, -2, -3))).toStrictEqual(d.vec3i());
  });

  it('correctly applies add to matrices', () => {
    // matrix + matrix
    expect(
      d.mat3x3f(10, 10, 10, 10, 10, 10, 10, 10, 10).add(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)),
    ).toStrictEqual(d.mat3x3f(11, 12, 13, 14, 15, 16, 17, 18, 19));
  });

  it('correctly applies sub to vectors', () => {
    // vector - scalar
    expect(isCloseTo(d.vec2f(1, 2).sub(2), d.vec2f(-1, 0))).toBe(true);

    // vector - vector
    expect(d.vec3i(1, 2, 3).sub(d.vec3i(-1, -2, -3))).toStrictEqual(d.vec3i(2, 4, 6));
  });

  it('correctly applies sub to matrices', () => {
    // matrix - matrix
    expect(
      d.mat3x3f(10, 10, 10, 10, 10, 10, 10, 10, 10).sub(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)),
    ).toStrictEqual(d.mat3x3f(9, 8, 7, 6, 5, 4, 3, 2, 1));
  });

  it('correctly applies mul to vectors', () => {
    // vector * scalar
    expect(isCloseTo(d.vec2f(1, 2).mul(2), d.vec2f(2, 4))).toBe(true);

    // vector * vector
    expect(d.vec3i(1, 2, 3).mul(d.vec3i(-1, -2, -3))).toStrictEqual(d.vec3i(-1, -4, -9));

    // vector * matrix
    expect(
      isCloseTo(
        d.vec4f(1, 2, 3, 4).mul(d.mat4x4f.scaling(d.vec3f(10, 20, 30))),
        d.vec4f(10, 40, 90, 4),
      ),
    ).toBe(true);
  });

  it('correctly applies mul to matrices', () => {
    // Matrix * scalar
    expect(d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9).mul(2)).toStrictEqual(
      d.mat3x3f(2, 4, 6, 8, 10, 12, 14, 16, 18),
    );

    // Matrix * vector
    expect(d.mat2x2f(1, 2, 3, 4).mul(d.vec2f(5, 6))).toStrictEqual(d.vec2f(23, 34));

    // Matrix * matrix
    expect(d.mat2x2f(1, 2, 3, 4).mul(d.mat2x2f(2, 0, 0, 3))).toStrictEqual(d.mat2x2f(2, 4, 9, 12));
  });

  it('correctly applies div to vectors', () => {
    // vector / scalar
    expect(isCloseTo(d.vec2f(1, 2).div(2), d.vec2f(0.5, 1))).toBe(true);

    // vector / vector
    expect(d.vec3i(-1, -4, -9).div(d.vec3i(-1, -2, -3))).toStrictEqual(d.vec3i(1, 2, 3));
  });
});

describe('** operator on vectors', () => {
  it('raises float vectors to a vector power on the CPU', () => {
    const square = (v: d.v2f) => {
      'use gpu';
      return v ** d.vec2f(2, 2);
    };

    const mixed = (v: d.v3h) => {
      'use gpu';
      return v ** d.vec3h(2, 3, 0.5);
    };

    expect(square(d.vec2f(3, 4))).toStrictEqual(d.vec2f(9, 16));
    expect(mixed(d.vec3h(3, 2, 16))).toStrictEqual(d.vec3h(9, 8, 4));
  });

  it('keeps the sign of negative bases for odd integer powers, like the GPU', () => {
    const cube = (v: d.v3f) => {
      'use gpu';
      return v ** d.vec3f(3);
    };

    expect(cube(d.vec3f(-2, 0, 2))).toStrictEqual(d.vec3f(-8, 0, 8));
    expect(tgpu.resolve([tgpu.fn([d.vec3f], d.vec3f)(cube)])).toMatchInlineSnapshot(`
      "fn cube(v: vec3f) -> vec3f {
        return (sign(v) * pow(abs(v), vec3f(3)));
      }"
    `);
  });

  it('rejects a scalar exponent on the CPU, like on the GPU', () => {
    const square = (v: d.v2f): d.v2f => {
      'use gpu';
      // @ts-expect-error: the exponent has to be a vector of the same type
      return v ** 2;
    };

    expect(() => square(d.vec2f(3, 4))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, number'.]`,
    );
    expect(() => tgpu.resolve([tgpu.fn([d.vec2f], d.vec2f)(square)])).toThrow(
      'Unsupported data types: vec2f, abstractInt',
    );
  });

  it('rejects integer vectors on the CPU, like on the GPU', () => {
    const square = (v: d.v2i): d.v2i => {
      'use gpu';
      // @ts-expect-error: only float vectors support `**`
      return v ** d.vec2i(2);
    };

    expect(() => square(d.vec2i(3, 4))).toThrow('Unsupported signature');
    expect(() => tgpu.resolve([tgpu.fn([d.vec2i], d.vec2i)(square)])).toThrow();
  });

  it('generates the same WGSL as before', () => {
    const square = (v: d.v2f) => {
      'use gpu';
      return v ** d.vec2f(2, 2);
    };

    expect(tgpu.resolve([tgpu.fn([d.vec2f], d.vec2f)(square)])).toMatchInlineSnapshot(`
      "fn square(v: vec2f) -> vec2f {
        return (v * v);
      }"
    `);
  });
});
