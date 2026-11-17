import { describe, expect, expectTypeOf } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { modf } from 'typegpu/std';
import { tgpu, d } from 'typegpu';
import { vec2f, vec3h, vec4f } from 'typegpu/data';
import type { v2f, v3h } from 'typegpu/data';

describe('modf', () => {
  it('gets inferred correctly', () => {
    const x = modf(1);
    expectTypeOf(x).toEqualTypeOf<{ fract: number; whole: number }>();

    const y = modf(vec2f(1, 2));
    expectTypeOf(y).toEqualTypeOf<{
      fract: v2f;
      whole: v2f;
    }>();

    const z = modf(vec3h(1, 2, 3));
    expectTypeOf(z).toEqualTypeOf<{
      fract: v3h;
      whole: v3h;
    }>();
  });

  it('splits scalars into fractional and whole parts', () => {
    expect(modf(1.5)).toStrictEqual({ fract: 0.5, whole: 1 });
    expect(modf(-1.5)).toStrictEqual({ fract: -0.5, whole: -1 });
    expect(modf(3)).toStrictEqual({ fract: 0, whole: 3 });
  });

  it('works component-wise on vectors', () => {
    expect(modf(vec2f(1.25, -2.75))).toStrictEqual({
      fract: vec2f(0.25, -0.75),
      whole: vec2f(1, -2),
    });
    expect(modf(vec3h(0.5, 4, -0.25))).toStrictEqual({
      fract: vec3h(0.5, 0, -0.25),
      whole: vec3h(0, 4, -0),
    });
    expect(modf(vec4f(9.5, -9.5, 0.125, 100))).toStrictEqual({
      fract: vec4f(0.5, -0.5, 0.125, 0),
      whole: vec4f(9, -9, 0, 100),
    });
  });

  it('is not folded at compile time', () => {
    const f = () => {
      'use gpu';
      const r = modf(d.f32(1.5));
      return r.fract;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> f32 {
        let r = modf(1.5f);
        return r.fract;
      }"
    `);
  });
});
