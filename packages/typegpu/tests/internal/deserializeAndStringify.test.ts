import { describe, expect } from 'vitest';
import { deserializeAndStringify } from '../../src/tgsl/consoleLog/deserializers.ts';
import { it } from 'typegpu-testing-utility';
import { d } from '../../src/index.js';

describe('deserializeAndStringify', () => {
  it('works for string literals', () => {
    const data = new Uint32Array([]);
    const logInfo: (string | d.AnyWgslData)[] = ['String literal'];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "String literal",
      ]
    `,
    );
  });

  it('works for u32', () => {
    const data = new Uint32Array([123]);
    const logInfo: (string | d.AnyWgslData)[] = [d.u32];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "123",
      ]
    `,
    );
  });

  it('works for vec3u', () => {
    const data = new Uint32Array([1, 2, 3]);
    const logInfo: (string | d.AnyWgslData)[] = [d.vec3u];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "vec3u(1, 2, 3)",
      ]
    `,
    );
  });

  it('works for clumped vectors', () => {
    const data = new Uint32Array([1, 2, 3, 4, 5, 6]); // no alignment
    const logInfo: (string | d.AnyWgslData)[] = [d.vec3u, d.vec3u];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "vec3u(1, 2, 3)",
        "vec3u(4, 5, 6)",
      ]
    `,
    );
  });

  it('works for multiple arguments', () => {
    const data = new Uint32Array([1, 2, 3, 456]);
    const logInfo: (string | d.AnyWgslData)[] = ['GID:', d.vec3u, 'Result:', d.u32];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "GID:",
        "vec3u(1, 2, 3)",
        "Result:",
        "456",
      ]
    `,
    );
  });

  it('works for arrays', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [d.arrayOf(d.u32, 4)];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "[1, 2, 3, 4]",
      ]
    `,
    );
  });

  it('works for nested arrays', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [d.arrayOf(d.arrayOf(d.u32, 2), 2)];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "[[1, 2], [3, 4]]",
      ]
    `,
    );
  });

  it('works for structs', () => {
    const data = new Uint32Array([1, 2, 3, 4]);
    const logInfo: (string | d.AnyWgslData)[] = [d.struct({ vec: d.vec3u, num: d.u32 })];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "{ vec: vec3u(1, 2, 3), num: 4 }",
      ]
    `,
    );
  });

  it('works for nested structs', () => {
    const data = new Uint32Array([1, 2, 3, 4, 1]);
    const logInfo: (string | d.AnyWgslData)[] = [
      d.struct({
        nested: d.struct({ vec: d.vec3u, num: d.u32 }),
        bool: d.bool,
      }),
    ];

    expect(deserializeAndStringify(data, logInfo)).toMatchInlineSnapshot(
      `
      [
        "{ nested: { vec: vec3u(1, 2, 3), num: 4 }, bool: true }",
      ]
    `,
    );
  });

  describe('arguments after values with padding', () => {
    const f32Bits = (n: number) => new Uint32Array(new Float32Array([n]).buffer)[0] as number;

    it('reads the argument after a padded struct', () => {
      // a, b.x, b.y, b.z, then the u32
      const data = new Uint32Array([f32Bits(1), f32Bits(2), f32Bits(3), f32Bits(4), 7, 0, 0, 0, 0]);
      const logInfo = [d.struct({ a: d.f32, b: d.vec3f }), d.u32];

      expect(deserializeAndStringify(data, logInfo)).toStrictEqual([
        '{ a: 1, b: vec3f(2, 3, 4) }',
        '7',
      ]);
    });

    it('reads the argument after an array of vec3u', () => {
      const data = new Uint32Array([1, 2, 3, 4, 5, 6, 7, 0, 0, 0]);
      const logInfo = [d.arrayOf(d.vec3u, 2), d.u32];

      expect(deserializeAndStringify(data, logInfo)).toStrictEqual([
        '[vec3u(1, 2, 3), vec3u(4, 5, 6)]',
        '7',
      ]);
    });

    it('reads nested padded structs', () => {
      const Inner = d.struct({ a: d.u32, b: d.vec3u });
      const Outer = d.struct({ first: Inner, x: d.u32, second: Inner });
      const data = new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 0, 0, 0, 0, 0]);

      expect(deserializeAndStringify(data, [Outer, d.u32])).toStrictEqual([
        '{ first: { a: 1, b: vec3u(2, 3, 4) }, x: 5, second: { a: 6, b: vec3u(7, 8, 9) } }',
        '10',
      ]);
    });

    it('reads a struct containing an array of vec3f', () => {
      const S = d.struct({ n: d.u32, points: d.arrayOf(d.vec3f, 2), m: d.u32 });
      const data = new Uint32Array(16);
      data.set([1, ...[1, 2, 3, 4, 5, 6].map(f32Bits), 2, 3]);

      expect(deserializeAndStringify(data, [S, d.u32])).toStrictEqual([
        '{ n: 1, points: [vec3f(1, 2, 3), vec3f(4, 5, 6)], m: 2 }',
        '3',
      ]);
    });
  });
});
