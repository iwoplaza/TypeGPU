import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('round', () => {
  it('rounds to even numbers', () => {
    const myRound = tgpu.fn([d.f32], d.f32)((a) => std.round(a));

    expect(myRound(2.4)).toBe(2);
    expect(myRound(2.5)).toBe(2);
    expect(myRound(2.6)).toBe(3);
    expect(myRound(3.4)).toBe(3);
    expect(myRound(3.5)).toBe(4);
    expect(myRound(3.6)).toBe(4);
    expect(tgpu.resolve([myRound])).toMatchInlineSnapshot(`
      "fn myRound(a: f32) -> f32 {
        return round(a);
      }"
    `);
  });

  it('rounds vectors component-wise, with ties to even', () => {
    expect(std.round(d.vec2f(0.5, 1.5))).toStrictEqual(d.vec2f(0, 2));
    expect(std.round(d.vec3h(-1.5, -2.5, -3.5))).toStrictEqual(d.vec3h(-2, -2, -4));
    expect(std.round(d.vec4f(2.4, 2.6, -2.4, -2.6))).toStrictEqual(d.vec4f(2, 3, -2, -3));
  });
});
