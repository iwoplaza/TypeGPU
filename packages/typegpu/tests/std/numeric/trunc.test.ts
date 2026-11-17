import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('trunc', () => {
  it('truncates scalars towards zero', () => {
    expect(std.trunc(2.7)).toBe(2);
    expect(std.trunc(-2.7)).toBe(-2);
    expect(std.trunc(0.5)).toBe(0);
    expect(std.trunc(3)).toBe(3);
  });

  it('works component-wise on vectors', () => {
    expect(std.trunc(d.vec2f(1.5, -1.5))).toStrictEqual(d.vec2f(1, -1));
    expect(std.trunc(d.vec3h(0.25, -3.75, 8))).toStrictEqual(d.vec3h(0, -3, 8));
    expect(std.trunc(d.vec4f(9.99, -9.99, 0.1, -0.1))).toStrictEqual(d.vec4f(9, -9, 0, -0));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.trunc(d.vec2i(1, 2))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected one of 'number, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h', got 'vec2i'.]`,
    );
  });
});
