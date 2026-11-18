import { describe, expect, expectTypeOf } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { frexp } from 'typegpu/std';
import { tgpu, d } from 'typegpu';
import { vec2f, vec3h, vec4f, vec2i, vec3i, vec4i } from 'typegpu/data';
import type { v2f, v2i, v3i } from 'typegpu/data';
import type { v3h } from 'typegpu/data';

describe('frexp', () => {
  it('gets inferred correctly', () => {
    const x = frexp(1);
    expectTypeOf(x).toEqualTypeOf<{ fract: number; exp: number }>();

    const y = frexp(vec2f(1, 2));
    expectTypeOf(y).toEqualTypeOf<{
      fract: v2f;
      exp: v2i;
    }>();

    const z = frexp(vec3h(1, 2, 3));
    expectTypeOf(z).toEqualTypeOf<{
      fract: v3h;
      exp: v3i;
    }>();
  });

  it('splits scalars into a fraction and an exponent', () => {
    expect(frexp(1.5)).toStrictEqual({ fract: 0.75, exp: 1 });
    expect(frexp(1)).toStrictEqual({ fract: 0.5, exp: 1 });
    expect(frexp(-6)).toStrictEqual({ fract: -0.75, exp: 3 });
    expect(frexp(0.125)).toStrictEqual({ fract: 0.5, exp: -2 });
    expect(frexp(2 ** 100)).toStrictEqual({ fract: 0.5, exp: 101 });
    expect(frexp(0)).toStrictEqual({ fract: 0, exp: 0 });
  });

  it('keeps the fraction in [0.5, 1) and recomposes the value', () => {
    for (const value of [0.1, 0.3, 1 / 3, 7, 1023.75, 3.4e38, 1.2e-38, -123.456]) {
      const { fract, exp } = frexp(value);
      expect(Math.abs(fract)).toBeGreaterThanOrEqual(0.5);
      expect(Math.abs(fract)).toBeLessThan(1);
      expect(Number.isInteger(exp)).toBe(true);
      expect(fract * 2 ** exp).toBe(value);
    }
  });

  it('handles the whole double range, including subnormals', () => {
    expect(frexp(1e308)).toStrictEqual({ fract: 1e308 / 2 ** 1023 / 2, exp: 1024 });
    expect(frexp(-Number.MAX_VALUE)).toStrictEqual({ fract: -(1 - 2 ** -53), exp: 1024 });
    expect(frexp(Number.MIN_VALUE)).toStrictEqual({ fract: 0.5, exp: -1073 });
    expect(frexp(-3 * 2 ** -1070)).toStrictEqual({ fract: -0.75, exp: -1068 });
    expect(frexp(2 ** -1022)).toStrictEqual({ fract: 0.5, exp: -1021 });
  });

  it('works component-wise on vectors', () => {
    expect(frexp(vec2f(1.5, 0))).toStrictEqual({ fract: vec2f(0.75, 0), exp: vec2i(1, 0) });
    expect(frexp(vec3h(-6, 1, 0.25))).toStrictEqual({
      fract: vec3h(-0.75, 0.5, 0.5),
      exp: vec3i(3, 1, -1),
    });
    expect(frexp(vec4f(1, 2, 4, 8))).toStrictEqual({
      fract: vec4f(0.5, 0.5, 0.5, 0.5),
      exp: vec4i(1, 2, 3, 4),
    });
  });

  it('is not folded at compile time', () => {
    const f = () => {
      'use gpu';
      const r = frexp(d.f32(1.5));
      return r.exp;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        let r = frexp(1.5f);
        return r.exp;
      }"
    `);
  });
});
