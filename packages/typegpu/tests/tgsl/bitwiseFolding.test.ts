import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('bitwise operators on compile-time known values', () => {
  it('folds abstract operands with 32-bit JS semantics', () => {
    const xor = () => {
      'use gpu';
      return d.u32(-1 ^ 3);
    };
    const shl = () => {
      'use gpu';
      return d.i32(3 << 30);
    };
    const shlBy32 = () => {
      'use gpu';
      return d.i32(1 << 32);
    };
    const and = () => {
      'use gpu';
      const x = 6 & 3;
      return x;
    };

    expect(xor()).toBe(4294967292);
    expect(shl()).toBe(-1073741824);
    expect(shlBy32()).toBe(1);
    expect(and()).toBe(2);
    expect(tgpu.resolve([xor, shl, shlBy32, and])).toMatchInlineSnapshot(`
      "fn xor() -> u32 {
        return 4294967292u;
      }

      fn shl() -> i32 {
        return -1073741824i;
      }

      fn shlBy32() -> i32 {
        return 1i;
      }

      fn and() -> i32 {
        const x = 2;
        return x;
      }"
    `);
  });

  it('truncates non-integral abstract floats', () => {
    const f = () => {
      'use gpu';
      return 2.7 | 0;
    };

    expect(f()).toBe(2);
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 2;
      }"
    `);
  });

  it('gives `>>>` results that do not fit an i32 the u32 type', () => {
    const typed = () => {
      'use gpu';
      return d.u32(-1 >>> 0);
    };
    const untyped = () => {
      'use gpu';
      return -1 >>> 0;
    };
    const small = () => {
      'use gpu';
      return -1 >>> 28;
    };

    expect(typed()).toBe(4294967295);
    expect(untyped()).toBe(4294967295);
    expect(small()).toBe(15);
    expect(tgpu.resolve([typed, untyped, small])).toMatchInlineSnapshot(`
      "fn typed() -> u32 {
        return 4294967295u;
      }

      fn untyped() -> u32 {
        return 4294967295u;
      }

      fn small() -> i32 {
        return 15;
      }"
    `);
  });

  it('wraps results to the concrete operand type', () => {
    const shlI32 = () => {
      'use gpu';
      return d.i32(3) << d.u32(30);
    };
    const shlU32 = () => {
      'use gpu';
      return d.u32(0x80000001) << 1;
    };
    const mixed = () => {
      'use gpu';
      return d.u32(0xf0000000) | 3;
    };
    const ushr = () => {
      'use gpu';
      return d.u32(0xffffffff) >>> 4;
    };

    expect(shlI32()).toBe(-1073741824);
    expect(shlU32()).toBe(2);
    expect(ushr()).toBe(0x0fffffff);
    expect(tgpu.resolve([shlI32, shlU32, mixed, ushr])).toMatchInlineSnapshot(`
      "fn shlI32() -> i32 {
        return -1073741824i;
      }

      fn shlU32() -> u32 {
        return 2u;
      }

      fn mixed() -> u32 {
        return 4026531843u;
      }

      fn ushr() -> u32 {
        return 268435455u;
      }"
    `);
  });

  it('does not fold when an operand is known only at runtime', () => {
    const f = () => {
      'use gpu';
      let a = d.i32(1);
      let b = d.u32(31);
      return (a << 31) | (1 << b) | (-1 ^ a);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        let a = 1i;
        let b = 31u;
        return (((a << 31u) | i32((1 << b))) | (-1i ^ a));
      }"
    `);
  });
});
