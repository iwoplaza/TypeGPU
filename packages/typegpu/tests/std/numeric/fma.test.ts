import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('fma', () => {
  it('computes e1 * e2 + e3 for scalars', () => {
    expect(std.fma(2, 3, 4)).toBe(10);
  });

  it('works component-wise on vectors', () => {
    expect(std.fma(d.vec2f(1, 2), d.vec2f(3, 4), d.vec2f(5, 6))).toStrictEqual(d.vec2f(8, 14));
    expect(std.fma(d.vec3h(1, 2, 3), d.vec3h(-1, 0.5, 2), d.vec3h(0, 1, -6))).toStrictEqual(
      d.vec3h(-1, 2, 0),
    );
    expect(
      std.fma(d.vec4f(1, 2, 3, 4), d.vec4f(2, 2, 2, 2), d.vec4f(0.5, 0.5, 0.5, 0.5)),
    ).toStrictEqual(d.vec4f(2.5, 4.5, 6.5, 8.5));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.fma(2, d.vec2f(), 3)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'number, vec2f'.]`,
    );
  });
});
