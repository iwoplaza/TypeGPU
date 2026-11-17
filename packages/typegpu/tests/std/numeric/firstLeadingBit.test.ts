import { describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('firstLeadingBit', () => {
  it('finds the most significant 1 bit of unsigned values', () => {
    expect(std.firstLeadingBit(0)).toBe(0xffffffff);
    expect(std.firstLeadingBit(1)).toBe(0);
    expect(std.firstLeadingBit(0x00f00000)).toBe(23);
    expect(std.firstLeadingBit(0x80000000)).toBe(31);
    expect(std.firstLeadingBit(d.vec2u(0, 0xffffffff))).toStrictEqual(d.vec2u(0xffffffff, 31));
    expect(std.firstLeadingBit(d.vec3u(2, 3, 4))).toStrictEqual(d.vec3u(1, 1, 2));
    expect(std.firstLeadingBit(d.vec4u(0, 1, 0x40000000, 0x80000000))).toStrictEqual(
      d.vec4u(0xffffffff, 0, 30, 31),
    );
  });

  it('finds the most significant bit different from the sign bit of signed values', () => {
    expect(std.firstLeadingBit(-1)).toBe(-1);
    expect(std.firstLeadingBit(-2)).toBe(0);
    expect(std.firstLeadingBit(-8)).toBe(2);
    expect(std.firstLeadingBit(-0x80000000)).toBe(30);
    expect(std.firstLeadingBit(d.vec2i(0, -1))).toStrictEqual(d.vec2i(-1, -1));
    expect(std.firstLeadingBit(d.vec3i(1, 0x7fffffff, -0x80000000))).toStrictEqual(
      d.vec3i(0, 30, 30),
    );
    expect(std.firstLeadingBit(d.vec4i(-2, 2, -9, 9))).toStrictEqual(d.vec4i(0, 1, 3, 3));
  });

  it('is not folded at compile time', () => {
    const f = () => {
      'use gpu';
      return std.firstLeadingBit(d.i32(0));
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return firstLeadingBit(0i);
      }"
    `);
  });
});
