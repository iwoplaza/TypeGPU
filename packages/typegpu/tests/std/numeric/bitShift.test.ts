import { describe, expect, it, vi } from 'vitest';
import { u32, i32, vec3f, vec3i, vec3u, f32, vec2u } from 'typegpu/data';
import { bitShiftLeft, bitShiftRight } from 'typegpu/std';
import { tgpu } from 'typegpu';

describe('bit shift', () => {
  it('casts abstract type rhs to u32', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      return (x << 4) | (x >> 4);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const x = 256i;
        return ((x << 4u) | (x >> 4u));
      }"
    `);
  });

  it('casts f32 rhs to u32', () => {
    const f = () => {
      'use gpu';
      const shift = f32(4);
      const x = i32(256);
      return (x << shift) | (x >> shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const shift = 4f;
        const x = 256i;
        return ((x << (u32(shift) & 31u)) | (x >> (u32(shift) & 31u)));
      }"
    `);
  });

  it('throws when lhs is not an integer', () => {
    const f = () => {
      'use gpu';
      const x = f32(256);
      return x << 4;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Expression: x << 4
      Left-hand side of '<<' must be an integer or vector of integers.
      Got f32.]
    `);
  });

  it('throws when lhs is not an integer vector', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(7);
      const x = vec3f(256);
      // @ts-ignore
      return x >> shift;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Expression: x >> shift
      Left-hand side of '>>' must be an integer or vector of integers.
      Got vec3f.]
    `);
  });

  it('throws when using vectors of different arity', () => {
    const f = () => {
      'use gpu';
      const shift = vec2u(4);
      const x = vec3i(256);
      // @ts-expect-error: part of the test
      return x << shift;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Cannot convert 'shift' of type 'vec2u' to any of the target types: [vec3u]]
    `);
  });
});

describe('bit shifts << and <<=', () => {
  it('works with i32 and u32 lhs', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      const y = u32(256);
      return (x << 4) | (y << 4);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const x = 256i;
        const y = 256u;
        return ((x << 4u) | i32((y << 4u)));
      }"
    `);
  });

  it('works with integer vectors', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      const y = vec3u(256);
      // @ts-ignore
      const _z = x << shift;
      // @ts-ignore
      const _w = y << shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3i(256);
        let y = vec3u(256);
        let _z = (x << shift);
        let _w = (y << shift);
      }"
    `);
  });

  it('generates correct wgsl for <<=', () => {
    const f = () => {
      'use gpu';
      let x = u32(8);
      x <<= 4;
    };
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var x = 8u;
        x <<= 4u;
      }"
    `);
  });
});

describe('bit shift >> and >>=', () => {
  it('works with i32 lhs', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      return x >> 4;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        const x = 256i;
        return (x >> 4u);
      }"
    `);
  });

  it('warns when lhs is u32', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = () => {
      'use gpu';
      const x = u32(256);
      return x >> 4;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> u32 {
        const x = 256u;
        return (x >> 4u);
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [deprecated] ",
        "
      Expression: x >> 4
      Using u32 or vecN<u32> as left-hand side of >> is deprecated.
      Use >>> instead.",
      ]
    `);
  });

  it('works with i32 vector', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      // @ts-ignore
      const _z = x >> shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3i(256);
        let _z = (x >> shift);
      }"
    `);
  });

  it('warns when lhs is u32 vector', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3u(256);
      // @ts-ignore
      const _z = x >> shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3u(256);
        let _z = (x >> shift);
      }"
    `);

    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [deprecated] ",
        "
      Expression: x >> shift
      Using u32 or vecN<u32> as left-hand side of >> is deprecated.
      Use >>> instead.",
      ]
    `);
  });

  it('generates correct wgsl for >>=', () => {
    const f = () => {
      'use gpu';
      let x = i32(8);
      x >>= 4;
    };
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var x = 8i;
        x >>= 4u;
      }"
    `);
  });
});

describe('bit shift >>> and >>>=', () => {
  it('works with u32 lhs', () => {
    const f = () => {
      'use gpu';
      const x = u32(256);
      return x >>> 4;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> u32 {
        const x = 256u;
        return (x >> 4u);
      }"
    `);
  });

  it('throws when lhs is i32', () => {
    const f = () => {
      'use gpu';
      const x = i32(256);
      return x >>> 4;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Expression: x >>> 4
      Left-hand side of '>>>' must be an unsigned integer or vector of unsigned integers.
      Got i32.
      Use >> instead.]
    `);
  });

  it('works with u32 vectors', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3u(256);
      // @ts-ignore
      const _z = x >>> shift;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3u(256);
        let _z = (x >> shift);
      }"
    `);
  });

  it('throws when lhs is i32 vector', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      // @ts-ignore
      const _z = x >>> shift;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f(): Expression: x >>> shift
      Left-hand side of '>>>' must be an unsigned integer or vector of unsigned integers.
      Got vec3i.
      Use >> instead.]
    `);
  });

  it('generates correct wgsl for >>>=', () => {
    const f = () => {
      'use gpu';
      let x = u32(8);
      x >>>= 4;
    };
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        var x = 8u;
        x >>= 4u;
      }"
    `);
  });
});

describe('std.bitShift', () => {
  it('throws in JS when lhs is a number', () => {
    // @ts-expect-error
    expect(() => bitShiftLeft(2, 1)).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftLeft' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );

    // @ts-expect-error
    expect(() => bitShiftRight(2, 1)).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );
  });

  it('computes values that match WGSL behavior', () => {
    const result1 = bitShiftLeft(vec3i(1, 2, 3), vec3u(1, 2, 3));
    expect(Array.from(result1)).toStrictEqual([2, 8, 24]);

    const result2 = bitShiftRight(vec3u(0x80000001), vec3u(1, 2, 3));
    expect(Array.from(result2)).toStrictEqual([1073741824, 536870912, 268435456]);

    const result3 = bitShiftRight(vec3i(0x80000001), vec3u(1, 2, 3));
    expect(Array.from(result3)).toStrictEqual([-1073741824, -536870912, -268435456]);
  });

  it('throws during WGSL generation when lhs is a number', () => {
    const f1 = () => {
      'use gpu';
      const x = 256;
      // @ts-expect-error
      bitShiftLeft(x, 1);
    };
    expect(() => tgpu.resolve([f1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f1
      - fn*:f1()
      - fn:bitShiftLeft: Unsupported data types: i32. Supported types are: vec2i, vec3i, vec4i, vec2u, vec3u, vec4u.]
    `);

    const f2 = () => {
      'use gpu';
      const x = 256;
      // @ts-expect-error
      bitShiftRight(x, 1);
    };
    expect(() => tgpu.resolve([f2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f2
      - fn*:f2()
      - fn:bitShiftRight: Unsupported data types: i32. Supported types are: vec2i, vec3i, vec4i, vec2u, vec3u, vec4u.]
    `);
  });

  it('generates correct wgsl for vector operands', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      const y = vec3u(256);
      const _z = bitShiftLeft(x, shift);
      const _w = bitShiftRight(y, shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3i(256);
        let y = vec3u(256);
        let _z = (x << shift);
        let _w = (y >> shift);
      }"
    `);
  });

  it('can be invoked as infix method', () => {
    const f = () => {
      'use gpu';
      const shift = vec3u(4);
      const x = vec3i(256);
      const y = vec3u(256);
      const _z = x.bitShiftLeft(shift);
      const _w = y.bitShiftRight(shift);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let shift = vec3u(4);
        let x = vec3i(256);
        let y = vec3u(256);
        let _z = (x << shift);
        let _w = (y >> shift);
      }"
    `);
  });

  it('rhs can be a number', () => {
    const f = () => {
      'use gpu';
      const x = vec3i(256);
      const _z = x.bitShiftLeft(4);
      const _w = x.bitShiftRight(4);
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        let x = vec3i(256);
        let _z = (x << vec3u(4u));
        let _w = (x >> vec3u(4u));
      }"
    `);
  });

  it('throws when lhs is a float vector', () => {
    const x = vec3f(1, 2, 3);
    // @ts-expect-error
    expect(() => bitShiftLeft(x, vec3u(1, 2, 3))).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftLeft' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );

    // @ts-expect-error
    expect(() => bitShiftRight(x, vec3u(1, 2, 3))).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );
  });

  it('throws when operands are different arity vectors', () => {
    const x = vec3i(1, 2, 3);
    // @ts-expect-error
    expect(() => bitShiftLeft(x, vec2u(1))).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftLeft' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );
    // @ts-expect-error
    expect(() => bitShiftRight(x, vec2u(1))).toThrowErrorMatchingInlineSnapshot(
      `[Error: 'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.]`,
    );

    const f1 = () => {
      'use gpu';
      const shift = vec2u(4);
      let x = vec3i(256);
      // @ts-expect-error
      x.bitShiftLeft(shift);
    };

    expect(() => tgpu.resolve([f1])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f1
      - fn*:f1(): Unsupported data types: vec2u. Supported types are: u32, vec3u.]
    `);

    const f2 = () => {
      'use gpu';
      const shift = vec2u(4);
      let x = vec3i(256);
      // @ts-expect-error
      x.bitShiftRight(shift);
    };

    expect(() => tgpu.resolve([f2])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f2
      - fn*:f2(): Unsupported data types: vec2u. Supported types are: u32, vec3u.]
    `);
  });

  it('is available only on integer vectors (at type level)', () => {
    const x = vec3f(1, 2, 3);
    // @ts-expect-error
    x.bitShiftLeft;
    // @ts-expect-error
    x.bitShiftRight;

    const y = vec3i(1, 2, 3);
    y.bitShiftLeft(2);
  });
});

describe('constant shift amounts', () => {
  it('masks the amount to the bit width, like JS does', () => {
    const f = () => {
      'use gpu';
      let x = i32(3);
      let y = u32(8);
      const a = x << u32(33);
      const b = x >> 34;
      const c = y >>> 35;
      y <<= 33;
      return a + b + i32(c + y);
    };

    expect(f()).toBe(6 + 0 + 1 + 16);
    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        let x = 3i;
        var y = 8u;
        let a = (x << 1u);
        let b = (x >> 2u);
        let c = (y >> 3u);
        y <<= 1u;
        return ((a + b) + i32((c + y)));
      }"
    `);
  });

  it('masks each component of a vector amount', () => {
    const f = () => {
      'use gpu';
      let x = vec3i(1, 2, 3);
      let y = vec3u(4, 5, 6);
      // @ts-ignore
      return (x << vec3u(1, 32, 63)) + vec3i(y >>> vec3u(33, 0, 31));
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> vec3i {
        let x = vec3i(1, 2, 3);
        let y = vec3u(4, 5, 6);
        return ((x << vec3u(1, 0, 31)) + vec3i((y >> vec3u(1, 0, 31))));
      }"
    `);
  });

  it('masks amounts held in WGSL constants in the shader', () => {
    const SHIFT = tgpu.const(u32, 33);
    const SHIFTS = tgpu.const(vec3u, vec3u(1, 33, 2));

    const f = () => {
      'use gpu';
      let x = i32(3);
      const s = u32(33);
      const t = 34;
      const a = x << s;
      const b = x >> t;
      const c = x << SHIFT.$;
      x <<= s;
      return a + b + c + x;
    };
    const g = () => {
      'use gpu';
      let x = vec3i(1, 2, 3);
      // @ts-ignore
      return x << SHIFTS.$;
    };

    expect(f()).toBe(6 + 0 + 6 + 6);
    expect(tgpu.resolve([f, g])).toMatchInlineSnapshot(`
      "const SHIFT: u32 = 33u;

      fn f() -> i32 {
        var x = 3i;
        const s = 33u;
        const t = 34;
        let a = (x << (s & 31u));
        let b = (x >> (u32(t) & 31u));
        let c = (x << (SHIFT & 31u));
        x <<= (s & 31u);
        return (((a + b) + c) + x);
      }

      const SHIFTS: vec3u = vec3u(1, 33, 2);

      fn g() -> vec3i {
        let x = vec3i(1, 2, 3);
        return (x << (SHIFTS & vec3u(31)));
      }"
    `);
  });

  it('keeps runtime amounts as they are', () => {
    const f = tgpu.fn([i32, u32], i32)((x, amount) => x << amount);
    const privateAmount = tgpu.privateVar(u32, 33);
    const g = () => {
      'use gpu';
      let x = i32(3);
      let s = u32(33);
      const t = s;
      return (x << s) + (x << t) + (x << privateAmount.$);
    };

    expect(tgpu.resolve([f, g])).toMatchInlineSnapshot(`
      "fn f(x: i32, amount: u32) -> i32 {
        return (x << amount);
      }

      var<private> privateAmount: u32 = 33u;

      fn g() -> i32 {
        let x = 3i;
        let s = 33u;
        let t = s;
        return (((x << s) + (x << t)) + (x << privateAmount));
      }"
    `);
  });
});
