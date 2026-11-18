import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';

describe('quantizeToF16', () => {
  it('rounds scalars to the nearest f16 value', () => {
    expect(std.quantizeToF16(1)).toBe(1);
    expect(std.quantizeToF16(1.0001)).toBe(1);
    expect(std.quantizeToF16(0.1)).toBe(0.0999755859375);
    expect(std.quantizeToF16(65504)).toBe(65504);
    expect(std.quantizeToF16(-2049)).toBe(-2048);
  });

  it('works component-wise on vectors', () => {
    expect(std.quantizeToF16(d.vec2f(1.0001, 0.1))).toStrictEqual(d.vec2f(1, 0.0999755859375));
    expect(std.quantizeToF16(d.vec3f(2049, 3, -0.5))).toStrictEqual(d.vec3f(2048, 3, -0.5));
    expect(std.quantizeToF16(d.vec4f(1, 2, 3, 4.0001))).toStrictEqual(d.vec4f(1, 2, 3, 4));
  });

  it('matches unpack2x16float(pack2x16float(e))', () => {
    const e = d.vec2f(0.3, -1234.567);
    expect(std.quantizeToF16(e)).toStrictEqual(std.unpack2x16float(std.pack2x16float(e)));
  });
});
