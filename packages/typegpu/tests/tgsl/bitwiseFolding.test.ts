import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d, std } from 'typegpu';

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

  it('keeps `>>>` results abstract, like the equivalent literal', () => {
    const resolveOrError = (fn: () => unknown) => {
      try {
        return tgpu.resolve([fn]);
      } catch (error) {
        return `throws: ${(error as Error).message}`;
      }
    };

    const pairs: [string, () => unknown, () => unknown][] = [
      [
        'u32 cast',
        () => {
          'use gpu';
          return d.u32(4294967295);
        },
        () => {
          'use gpu';
          return d.u32(-1 >>> 0);
        },
      ],
      [
        'i32 cast',
        () => {
          'use gpu';
          return d.i32(4294967295);
        },
        () => {
          'use gpu';
          return d.i32(-1 >>> 0);
        },
      ],
      [
        'untyped const',
        () => {
          'use gpu';
          const c = 4294967295;
          return d.u32(c);
        },
        () => {
          'use gpu';
          const c = -1 >>> 0;
          return d.u32(c);
        },
      ],
      [
        'abstract multiplication',
        () => {
          'use gpu';
          return 4294967295 * 2;
        },
        () => {
          'use gpu';
          return (-1 >>> 0) * 2;
        },
      ],
      [
        'i32 addition',
        () => {
          'use gpu';
          const x = d.i32(1);
          return x + 4294967295;
        },
        () => {
          'use gpu';
          const x = d.i32(1);
          return x + (-1 >>> 0);
        },
      ],
      [
        'runtime i32 addition',
        () => {
          'use gpu';
          let x = d.i32(1);
          return x + 4294967295;
        },
        () => {
          'use gpu';
          let x = d.i32(1);
          return x + (-1 >>> 0);
        },
      ],
      [
        'runtime u32 multiplication',
        () => {
          'use gpu';
          let x = d.u32(1);
          return x * 4294967295;
        },
        () => {
          'use gpu';
          let x = d.u32(1);
          return x * (-1 >>> 0);
        },
      ],
      [
        'std.max',
        () => {
          'use gpu';
          return std.max(4294967295, 5);
        },
        () => {
          'use gpu';
          return std.max(-1 >>> 0, 5);
        },
      ],
      [
        'return value',
        () => {
          'use gpu';
          return 4294967295;
        },
        () => {
          'use gpu';
          return -1 >>> 0;
        },
      ],
    ];

    for (const [position, literal, folded] of pairs) {
      expect(resolveOrError(folded), position).toBe(resolveOrError(literal));
    }
  });

  it('does not fold results equal to -2147483648', () => {
    const shl = () => {
      'use gpu';
      return d.i32(-1) << 31;
    };
    const xor = () => {
      'use gpu';
      return d.i32(0x7fffffff) ^ -1;
    };
    const and = () => {
      'use gpu';
      return d.i32(-2147483647) & -2;
    };
    const nested = () => {
      'use gpu';
      let x = d.i32(1);
      return x ^ (0x7fffffff ^ -1);
    };

    expect(tgpu.resolve([shl, xor, and, nested])).toMatchInlineSnapshot(`
      "fn shl() -> i32 {
        return (-1i << 31u);
      }

      fn xor() -> i32 {
        return (2147483647i ^ -1i);
      }

      fn and() -> i32 {
        return (-2147483647i & -2i);
      }

      fn nested() -> i32 {
        let x = 1i;
        return (x ^ i32((2147483647 ^ -1)));
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
