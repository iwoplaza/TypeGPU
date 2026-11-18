import { describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('firstTrailingBit', () => {
  it('finds the least significant 1 bit of scalars', () => {
    expect(std.firstTrailingBit(0)).toBe(-1);
    expect(std.firstTrailingBit(1)).toBe(0);
    expect(std.firstTrailingBit(8)).toBe(3);
    expect(std.firstTrailingBit(0x80000000)).toBe(31);
    expect(std.firstTrailingBit(-8)).toBe(3);
  });

  it('truncates non-integer scalars like an integer cast', () => {
    expect(std.firstTrailingBit(0.5)).toBe(-1);
    expect(std.firstTrailingBit(8.9)).toBe(3);
  });

  it('works component-wise on vectors', () => {
    expect(std.firstTrailingBit(d.vec2u(0, 12))).toStrictEqual(d.vec2u(0xffffffff, 2));
    expect(std.firstTrailingBit(d.vec2i(0, -0x80000000))).toStrictEqual(d.vec2i(-1, 31));
    expect(std.firstTrailingBit(d.vec3i(0, 1, -1))).toStrictEqual(d.vec3i(-1, 0, 0));
    expect(std.firstTrailingBit(d.vec4u(1, 2, 0, 0x80000000))).toStrictEqual(
      d.vec4u(0, 1, 0xffffffff, 31),
    );
  });

  it('is not folded at compile time', () => {
    const f = () => {
      'use gpu';
      return std.firstTrailingBit(d.i32(0));
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return firstTrailingBit(0i);
      }"
    `);
  });
});
