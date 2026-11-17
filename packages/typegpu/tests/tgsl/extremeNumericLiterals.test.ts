import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('extreme numeric literals', () => {
  it('emits the smallest i32 as a conversion of an abstract int', () => {
    const fromReturn = tgpu.fn(
      [],
      d.i32,
    )(() => {
      'use gpu';
      return -2147483648;
    });

    const fromCast = () => {
      'use gpu';
      return d.i32(-2147483648);
    };

    const minI32 = tgpu.const(d.i32, -2147483648);
    const fromConst = () => {
      'use gpu';
      return minI32.$;
    };

    const maxI32 = () => {
      'use gpu';
      return d.i32(2147483647);
    };

    expect(tgpu.resolve([fromReturn, fromCast, fromConst, maxI32])).toMatchInlineSnapshot(`
      "fn fromReturn() -> i32 {
        return i32(-2147483648);
      }

      fn fromCast() -> i32 {
        return i32(-2147483648);
      }

      const minI32: i32 = i32(-2147483648);

      fn fromConst() -> i32 {
        return minI32;
      }

      fn maxI32() -> i32 {
        return 2147483647i;
      }"
    `);
  });

  it('throws when a float literal overflows f32', () => {
    const fn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return 1e40;
    });

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn: Value '1e+40' is out of range for type 'f32'.]
    `);
  });

  it('throws when a float literal overflows f16', () => {
    const fn = tgpu.fn(
      [],
      d.f16,
    )(() => {
      'use gpu';
      return 70000;
    });

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn: Value '70000' is out of range for type 'f16'.]
    `);
  });

  it('keeps the largest finite floats', () => {
    const maxF32 = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return 3.4028234663852886e38;
    });

    const maxF16 = tgpu.fn(
      [],
      d.f16,
    )(() => {
      'use gpu';
      return 65504;
    });

    expect(tgpu.resolve([maxF32, maxF16])).toMatchInlineSnapshot(`
      "fn maxF32() -> f32 {
        return 3.4028234663852886e+38f;
      }

      fn maxF16() -> f16 {
        return 65504h;
      }"
    `);
  });

  it('keeps the sign of negative zero', () => {
    const fn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      return -0.0;
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> f32 {
        return -0f;
      }"
    `);
  });
});
