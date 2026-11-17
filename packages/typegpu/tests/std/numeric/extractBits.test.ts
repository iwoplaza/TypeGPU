import { describe, expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('extractBits', () => {
  it('extracts bits of unsigned values without sign extension', () => {
    expect(std.extractBits(0xf0, 4, 4)).toBe(0xf);
    expect(std.extractBits(0xffffffff, 0, 32)).toBe(0xffffffff);
    expect(std.extractBits(0x80000000, 31, 1)).toBe(1);
    expect(std.extractBits(d.vec2u(0xf0, 0xabcd), 4, 8)).toStrictEqual(d.vec2u(0xf, 0xbc));
    expect(std.extractBits(d.vec3u(0xf0, 0x80, 0), 4, 4)).toStrictEqual(d.vec3u(0xf, 0x8, 0));
    expect(std.extractBits(d.vec4u(1, 2, 3, 4), 1, 1)).toStrictEqual(d.vec4u(0, 1, 1, 0));
  });

  it('extracts bits of signed values with sign extension', () => {
    expect(std.extractBits(-1, 4, 4)).toBe(-1);
    expect(std.extractBits(-0x80000000, 28, 4)).toBe(-8);
    expect(std.extractBits(d.vec2i(0xf0, 0x70), 4, 4)).toStrictEqual(d.vec2i(-1, 7));
    expect(std.extractBits(d.vec3i(-1, 0x80, 0), 0, 8)).toStrictEqual(d.vec3i(-1, -128, 0));
    expect(std.extractBits(d.vec4i(-1, 1, 2, 3), 0, 32)).toStrictEqual(d.vec4i(-1, 1, 2, 3));
  });

  it('returns 0 when count is 0', () => {
    expect(std.extractBits(0xffffffff, 4, 0)).toBe(0);
    expect(std.extractBits(d.vec2i(-1, -1), 0, 0)).toStrictEqual(d.vec2i(0, 0));
  });

  it('clamps offset and count to the bit width', () => {
    expect(std.extractBits(0xffffffff, 32, 4)).toBe(0);
    expect(std.extractBits(0xffffffff, 40, 4)).toBe(0);
    expect(std.extractBits(0xf0000000, 28, 8)).toBe(0xf);
    expect(std.extractBits(d.vec2i(-0x80000000, 0x70000000), 28, 8)).toStrictEqual(d.vec2i(-8, 7));
  });

  it('is not folded at compile time', () => {
    const f = () => {
      'use gpu';
      return std.extractBits(d.i32(0xf0), 4, 4);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return extractBits(240i, 4u, 4u);
      }"
    `);
  });
});
