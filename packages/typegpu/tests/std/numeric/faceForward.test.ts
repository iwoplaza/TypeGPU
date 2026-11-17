import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('faceForward', () => {
  it('returns e1 when dot(e2, e3) is negative', () => {
    expect(std.faceForward(d.vec2f(1, 2), d.vec2f(0, 1), d.vec2f(0, -1))).toStrictEqual(
      d.vec2f(1, 2),
    );
    expect(std.faceForward(d.vec3h(1, -2, 3), d.vec3h(1, 1, 0), d.vec3h(-1, 0, 0))).toStrictEqual(
      d.vec3h(1, -2, 3),
    );
  });

  it('returns -e1 otherwise', () => {
    expect(std.faceForward(d.vec2f(1, 2), d.vec2f(0, 1), d.vec2f(0, 1))).toStrictEqual(
      d.vec2f(-1, -2),
    );
    expect(
      std.faceForward(d.vec4f(1, -2, 3, 0.5), d.vec4f(1, 0, 0, 0), d.vec4f(0, 1, 0, 0)),
    ).toStrictEqual(d.vec4f(-1, 2, -3, -0.5));
  });

  it('does not return the same instance as e1', () => {
    const e1 = d.vec2f(1, 2);
    expect(std.faceForward(e1, d.vec2f(0, 1), d.vec2f(0, -1))).not.toBe(e1);
  });
});
