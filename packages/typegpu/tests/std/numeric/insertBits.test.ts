import { describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('insertBits', () => {
  it('inserts bits into scalars', () => {
    expect(std.insertBits(0, 0xf, 4, 4)).toBe(0xf0);
    expect(std.insertBits(0xffffffff, 0, 8, 8)).toBe(0xffff00ff);
    expect(std.insertBits(0x12345678, 0x9abcdef0, 0, 32)).toBe(0x9abcdef0);
    expect(std.insertBits(-1, 0, 0, 1)).toBe(-2);
  });

  it('works component-wise on vectors', () => {
    expect(std.insertBits(d.vec2u(0, 0xffffffff), d.vec2u(1, 0), 31, 1)).toStrictEqual(
      d.vec2u(0x80000000, 0x7fffffff),
    );
    expect(std.insertBits(d.vec2i(0, -1), d.vec2i(1, 0), 31, 1)).toStrictEqual(
      d.vec2i(-0x80000000, 0x7fffffff),
    );
    expect(std.insertBits(d.vec3i(0, 0, 0), d.vec3i(1, 2, 3), 2, 2)).toStrictEqual(
      d.vec3i(4, 8, 12),
    );
    expect(std.insertBits(d.vec4u(0, 0, 0, 0), d.vec4u(0xff, 1, 2, 3), 0, 4)).toStrictEqual(
      d.vec4u(0xf, 1, 2, 3),
    );
  });

  it('returns e when count is 0', () => {
    expect(std.insertBits(0x12345678, 0xffffffff, 4, 0)).toBe(0x12345678);
    expect(std.insertBits(d.vec2i(-5, 5), d.vec2i(-1, -1), 0, 0)).toStrictEqual(d.vec2i(-5, 5));
  });

  it('clamps offset and count to the bit width', () => {
    expect(std.insertBits(0x12345678, 0xffffffff, 32, 4)).toBe(0x12345678);
    expect(std.insertBits(0x12345678, 0xffffffff, 40, 4)).toBe(0x12345678);
    expect(std.insertBits(0, 0xff, 28, 8)).toBe(-0x10000000);
    expect(std.insertBits(0x80000000, 0xff, 28, 8)).toBe(0xf0000000);
    expect(std.insertBits(d.vec2i(0, 0), d.vec2i(0xff, 0x7), 28, 8)).toStrictEqual(
      d.vec2i(-0x10000000, 0x70000000),
    );
  });

  it('is not folded at compile time', () => {
    const f = () => {
      'use gpu';
      return std.insertBits(d.i32(0), d.i32(1), 31, 1);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return insertBits(0i, 1i, 31u, 1u);
      }"
    `);
  });
});
