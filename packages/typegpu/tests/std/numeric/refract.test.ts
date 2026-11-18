import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('refract', () => {
  it('passes straight through with an index ratio of 1', () => {
    const e1 = std.normalize(d.vec3f(1, -1, 0));
    expect(std.isCloseTo(std.refract(e1, d.vec3f(0, 1, 0), 1), e1)).toBe(true);
  });

  it('bends towards the normal when entering a denser medium', () => {
    const e1 = std.normalize(d.vec2f(1, -1));
    const eta = 1 / 1.5;
    const cosI = -std.dot(d.vec2f(0, 1), e1);
    const k = 1 - eta * eta * (1 - cosI * cosI);
    const expected = d.vec2f(eta * e1.x, eta * e1.y + (eta * cosI - Math.sqrt(k)));
    expect(std.isCloseTo(std.refract(e1, d.vec2f(0, 1), eta), expected)).toBe(true);
    expect(
      std.isCloseTo(
        std.refract(d.vec4f(0, -1, 0, 0), d.vec4f(0, 1, 0, 0), 0.5),
        d.vec4f(0, -1, 0, 0),
      ),
    ).toBe(true);
  });

  it('returns the zero vector on total internal reflection', () => {
    const e1 = std.normalize(d.vec2f(1, -0.1));
    expect(std.refract(e1, d.vec2f(0, 1), 1.5)).toStrictEqual(d.vec2f(0, 0));
    expect(std.refract(std.normalize(d.vec3h(1, -0.1, 0)), d.vec3h(0, 1, 0), 2)).toStrictEqual(
      d.vec3h(0, 0, 0),
    );
  });
});
