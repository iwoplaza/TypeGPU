import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('radians', () => {
  it('converts scalars', () => {
    expect(std.radians(180)).toBeCloseTo(Math.PI);
    expect(std.radians(-90)).toBeCloseTo(-Math.PI / 2);
  });

  it('works component-wise on vectors', () => {
    expect(std.isCloseTo(std.radians(d.vec2f(180, 0)), d.vec2f(Math.PI, 0))).toBe(true);
    expect(
      std.isCloseTo(
        std.radians(d.vec3h(90, -180, 360)),
        d.vec3h(Math.PI / 2, -Math.PI, 2 * Math.PI),
      ),
    ).toBe(true);
    expect(
      std.isCloseTo(
        std.radians(d.vec4f(0, 45, 90, 360)),
        d.vec4f(0, Math.PI / 4, Math.PI / 2, 2 * Math.PI),
      ),
    ).toBe(true);
  });
});
