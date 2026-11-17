import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('step', () => {
  it('compares scalars', () => {
    expect(std.step(2, 3)).toBe(1);
    expect(std.step(2, 2)).toBe(1);
    expect(std.step(2, 1)).toBe(0);
  });

  it('compares vectors component-wise', () => {
    expect(std.step(d.vec2f(2, 2), d.vec2f(3, 1))).toStrictEqual(d.vec2f(1, 0));
    expect(std.step(d.vec3h(0, 1, 2), d.vec3h(0, 0.5, 2.5))).toStrictEqual(d.vec3h(1, 0, 1));
    expect(std.step(d.vec4f(-1, 0, 1, 2), d.vec4f(0, 0, 0, 0))).toStrictEqual(d.vec4f(1, 1, 0, 0));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.step(2, d.vec2f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'number, vec2f'.]`,
    );
  });
});
