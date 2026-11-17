import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('degrees', () => {
  it('converts scalars', () => {
    expect(std.degrees(Math.PI)).toBeCloseTo(180);
    expect(std.degrees(-Math.PI / 2)).toBeCloseTo(-90);
  });

  it('works component-wise on vectors', () => {
    expect(std.isCloseTo(std.degrees(d.vec2f(Math.PI, 0)), d.vec2f(180, 0))).toBe(true);
    expect(
      std.isCloseTo(std.degrees(d.vec3h(Math.PI / 2, -Math.PI, 1)), d.vec3h(90, -180, 57.29578)),
    ).toBe(true);
    expect(
      std.isCloseTo(
        std.degrees(d.vec4f(0, Math.PI / 4, Math.PI / 2, 2 * Math.PI)),
        d.vec4f(0, 45, 90, 360),
      ),
    ).toBe(true);
  });
});
