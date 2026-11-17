import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('ldexp', () => {
  it('computes e1 * 2^e2 for scalars', () => {
    expect(std.ldexp(0.75, 1)).toBe(1.5);
    expect(std.ldexp(1, -3)).toBe(0.125);
    expect(std.ldexp(-3, 4)).toBe(-48);
    expect(std.ldexp(0, 10)).toBe(0);
  });

  it('works component-wise on vectors', () => {
    expect(std.ldexp(d.vec2f(0.75, 1), d.vec2i(1, -1))).toStrictEqual(d.vec2f(1.5, 0.5));
    expect(std.ldexp(d.vec3h(1, 2, 3), d.vec3i(0, 1, 2))).toStrictEqual(d.vec3h(1, 4, 12));
    expect(std.ldexp(d.vec4f(1, -1, 0.5, 0), d.vec4i(10, 2, -1, 5))).toStrictEqual(
      d.vec4f(1024, -4, 0.25, 0),
    );
  });

  it('inverts frexp', () => {
    for (const value of [1.5, -6, 0.1, 1234.5678]) {
      const { fract, exp } = std.frexp(value);
      expect(std.ldexp(fract, exp)).toBe(value);
    }
  });

  it('throws when the exponent does not match the value', () => {
    // @ts-expect-error
    expect(() => std.ldexp(d.vec2f(1, 2), d.vec3i(1, 2, 3))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected exponent of kind 'vec2i', got 'vec3i'.]`,
    );
  });
});
