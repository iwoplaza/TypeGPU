import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('countLeadingZeros', () => {
  it('counts leading zeros of scalars', () => {
    expect(std.countLeadingZeros(0)).toBe(32);
    expect(std.countLeadingZeros(1)).toBe(31);
    expect(std.countLeadingZeros(0x00ff0000)).toBe(8);
    expect(std.countLeadingZeros(0x80000000)).toBe(0);
    expect(std.countLeadingZeros(-1)).toBe(0);
  });

  it('works component-wise on vectors', () => {
    expect(std.countLeadingZeros(d.vec2u(0, 1))).toStrictEqual(d.vec2u(32, 31));
    expect(std.countLeadingZeros(d.vec3i(-1, 0, 255))).toStrictEqual(d.vec3i(0, 32, 24));
    expect(std.countLeadingZeros(d.vec4u(0xffffffff, 2, 4, 0x40000000))).toStrictEqual(
      d.vec4u(0, 30, 29, 1),
    );
  });
});
