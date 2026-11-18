import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('min', () => {
  it('acts as identity when called with one argument', () => {
    const myMin = tgpu.fn(
      [d.f32],
      d.f32,
    )((a: number) => {
      'use gpu';
      return std.min(a);
    });

    expect(myMin(6)).toBe(6);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: f32) -> f32 {
        return a;
      }"
    `);
  });

  it('works with two arguments', () => {
    const myMin = tgpu.fn(
      [d.f32, d.f32],
      d.f32,
    )((a, b) => {
      'use gpu';
      return std.min(a, b);
    });

    expect(myMin(1, 2)).toBe(1);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: f32, b: f32) -> f32 {
        return min(a, b);
      }"
    `);
  });

  it('works with multiple arguments', () => {
    const myMin = tgpu.fn(
      [d.f32, d.f32, d.f32, d.f32],
      d.f32,
    )((a, b, c, d) => {
      'use gpu';
      return std.min(a, b, c, d);
    });

    expect(myMin(2, 1, 4, 5)).toBe(1);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: f32, b: f32, c: f32, d: f32) -> f32 {
        return min(min(min(a, b), c), d);
      }"
    `);
  });

  it('unifies arguments', () => {
    const myMin = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      const a = d.u32(9);
      const b = d.i32(1);
      const c = d.f32(4);
      return std.min(a, b, 3.3, c, 7);
    });

    expect(myMin()).toBe(1);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin() -> f32 {
        const a = 9u;
        const b = 1i;
        const c = 4f;
        return min(min(min(min(f32(a), f32(b)), 3.3f), c), 7f);
      }"
    `);
  });

  it('works with vectors', () => {
    const myMin = tgpu.fn(
      [d.vec3u, d.vec3u],
      d.vec3u,
    )((a, b) => {
      'use gpu';
      return std.min(a, b);
    });

    expect(myMin(d.vec3u(1, 2, 3), d.vec3u(3, 2, 1))).toStrictEqual(d.vec3u(1, 2, 1));
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin(a: vec3u, b: vec3u) -> vec3u {
        return min(a, b);
      }"
    `);
  });

  it('does comptime reduction', () => {
    const myMin = tgpu.fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      return std.min(33, 12, 444, 12333);
    });

    expect(myMin()).toBe(12);
    expect(tgpu.resolve([myMin])).toMatchInlineSnapshot(`
      "fn myMin() -> u32 {
        return 12u;
      }"
    `);
  });

  it('cannot be called with invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.min(1, d.vec2f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'number, vec2f'.]`,
    );
    // @ts-expect-error
    expect(() => std.min(d.vec3f(), d.vec2f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec3f, vec2f'.]`,
    );
  });
});

describe('min in shaders', () => {
  it('unifies abstract literals with concrete arguments', () => {
    const main = (x: number, v: d.v3f) => {
      'use gpu';
      const a = std.min(x, 0);
      const b = std.min(v, d.vec3f(0));
    };

    expect(tgpu.resolve([tgpu.fn([d.f32, d.vec3f])(main)])).toMatchInlineSnapshot(`
      "fn main(x: f32, v: vec3f) {
        let a = min(x, 0f);
        let b = min(v, vec3f());
      }"
    `);
  });

  it('rejects arguments that WGSL does not accept', () => {
    expect(() =>
      tgpu.resolve([
        tgpu.fn([d.vec3f, d.bool])((v: d.v3f, b: boolean) => {
          'use gpu';
          // @ts-expect-error
          std.min(v, 0);
        }),
      ]),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:min: Unsupported data types: vec3f, abstractInt. Supported types are: f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h, i32, u32, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u, abstractInt.]
    `);
  });

  it('keeps mixed integers as integers', () => {
    const mixed = tgpu.fn(
      [d.u32, d.i32],
      d.i32,
    )((a, b) => {
      'use gpu';
      return std.min(a, b) + std.clamp(b, 0, a);
    });

    expect(tgpu.resolve([mixed])).toMatchInlineSnapshot(`
      "fn mixed(a: u32, b: i32) -> i32 {
        return (min(i32(a), b) + clamp(b, 0i, i32(a)));
      }"
    `);
  });

  it('converts booleans to a numeric type, like other numeric functions', () => {
    const main = (b: boolean) => {
      'use gpu';
      // @ts-expect-error
      const a = std.min(b, b);
    };

    expect(tgpu.resolve([tgpu.fn([d.bool])(main)])).toMatchInlineSnapshot(`
      "fn main(b: bool) {
        let a = min(f32(b), f32(b));
      }"
    `);
  });
});
