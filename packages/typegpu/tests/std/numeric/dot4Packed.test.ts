import { describe, expect, it } from 'vitest';
import { std } from 'typegpu';

describe('dot4U8Packed', () => {
  it('computes the dot product of packed unsigned bytes', () => {
    expect(std.dot4U8Packed(0, 0xffffffff)).toBe(0);
    expect(std.dot4U8Packed(0x01020304, 0x05060708)).toBe(1 * 5 + 2 * 6 + 3 * 7 + 4 * 8);
    expect(std.dot4U8Packed(0xffffffff, 0xffffffff)).toBe(4 * 255 * 255);
  });
});

describe('dot4I8Packed', () => {
  it('computes the dot product of packed signed bytes', () => {
    expect(std.dot4I8Packed(0, 0xffffffff)).toBe(0);
    expect(std.dot4I8Packed(0x01020304, 0x05060708)).toBe(1 * 5 + 2 * 6 + 3 * 7 + 4 * 8);
    expect(std.dot4I8Packed(0xffffffff, 0x01020304)).toBe(-(1 + 2 + 3 + 4));
    expect(std.dot4I8Packed(0x80808080, 0x80808080)).toBe(65536);
    expect(std.dot4I8Packed(0x80808080, 0x7f7f7f7f)).toBe(-65024);
  });
});
