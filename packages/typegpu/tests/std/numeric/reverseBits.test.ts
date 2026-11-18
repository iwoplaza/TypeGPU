import { describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('reverseBits', () => {
  it('reverses bits of scalars', () => {
    expect(std.reverseBits(0)).toBe(0);
    expect(std.reverseBits(1)).toBe(-0x80000000);
    expect(std.reverseBits(d.i32(1))).toBe(-0x80000000);
    expect(std.reverseBits(0x80000000)).toBe(1);
    expect(std.reverseBits(0xf0000000)).toBe(0xf);
    expect(std.reverseBits(0x12345678)).toBe(0x1e6a2c48);
    expect(std.reverseBits(-2)).toBe(0x7fffffff);
    expect(std.reverseBits(-1)).toBe(-1);
  });

  it('works component-wise on vectors', () => {
    expect(std.reverseBits(d.vec2u(1, 0x80000000))).toStrictEqual(d.vec2u(0x80000000, 1));
    expect(std.reverseBits(d.vec2i(1, 3))).toStrictEqual(d.vec2i(-0x80000000, -0x40000000));
    expect(std.reverseBits(d.vec3i(0, -1, 0x00ff0000))).toStrictEqual(d.vec3i(0, -1, 0x0000ff00));
    expect(std.reverseBits(d.vec4u(0, 2, 4, 0xffffffff))).toStrictEqual(
      d.vec4u(0, 0x40000000, 0x20000000, 0xffffffff),
    );
  });

  it('is not folded at compile time', () => {
    const f = () => {
      'use gpu';
      return std.reverseBits(d.i32(1));
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return reverseBits(1i);
      }"
    `);
  });
});
