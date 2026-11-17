import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('countOneBits', () => {
  it('counts set bits of scalars', () => {
    expect(std.countOneBits(0)).toBe(0);
    expect(std.countOneBits(7)).toBe(3);
    expect(std.countOneBits(0x80000001)).toBe(2);
    expect(std.countOneBits(0xffffffff)).toBe(32);
    expect(std.countOneBits(-1)).toBe(32);
    expect(std.countOneBits(-0x80000000)).toBe(1);
  });

  it('works component-wise on vectors', () => {
    expect(std.countOneBits(d.vec2u(0, 0xffffffff))).toStrictEqual(d.vec2u(0, 32));
    expect(std.countOneBits(d.vec3i(-1, 5, -2))).toStrictEqual(d.vec3i(32, 2, 31));
    expect(std.countOneBits(d.vec4u(1, 3, 7, 15))).toStrictEqual(d.vec4u(1, 2, 3, 4));
  });
});
