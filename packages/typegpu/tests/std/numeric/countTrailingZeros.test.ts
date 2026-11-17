import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('countTrailingZeros', () => {
  it('counts trailing zeros of scalars', () => {
    expect(std.countTrailingZeros(0)).toBe(32);
    expect(std.countTrailingZeros(1)).toBe(0);
    expect(std.countTrailingZeros(8)).toBe(3);
    expect(std.countTrailingZeros(0x80000000)).toBe(31);
    expect(std.countTrailingZeros(-8)).toBe(3);
  });

  it('works component-wise on vectors', () => {
    expect(std.countTrailingZeros(d.vec2u(0, 0x80000000))).toStrictEqual(d.vec2u(32, 31));
    expect(std.countTrailingZeros(d.vec3i(-0x80000000, 0, 12))).toStrictEqual(d.vec3i(31, 32, 2));
    expect(std.countTrailingZeros(d.vec4u(1, 2, 4, 6))).toStrictEqual(d.vec4u(0, 1, 2, 1));
  });
});
