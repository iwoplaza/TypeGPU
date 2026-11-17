import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('tan', () => {
  it('computes the tangent of scalars', () => {
    expect(std.tan(0)).toBe(0);
    expect(std.tan(Math.PI / 4)).toBeCloseTo(1);
  });

  it('works component-wise on vectors', () => {
    expect(std.isCloseTo(std.tan(d.vec2f(0, Math.PI / 4)), d.vec2f(0, 1))).toBe(true);
    expect(std.isCloseTo(std.tan(d.vec3h(-Math.PI / 4, 0, 1)), d.vec3h(-1, 0, 1.5574077))).toBe(
      true,
    );
    expect(
      std.isCloseTo(std.tan(d.vec4f(0, Math.PI / 4, -Math.PI / 4, Math.PI)), d.vec4f(0, 1, -1, 0)),
    ).toBe(true);
  });
});
