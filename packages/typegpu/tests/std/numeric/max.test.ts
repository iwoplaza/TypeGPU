import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('max', () => {
  it('acts as identity when called with one argument', () => {
    const myMax = tgpu.fn(
      [d.f32],
      d.f32,
    )((a: number) => {
      'use gpu';
      return std.max(a);
    });

    expect(myMax(6)).toBe(6);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax(a: f32) -> f32 {
        return a;
      }"
    `);
  });

  it('works with two arguments', () => {
    const myMax = tgpu.fn(
      [d.f32, d.f32],
      d.f32,
    )((a, b) => {
      'use gpu';
      return std.max(a, b);
    });

    expect(myMax(1, 2)).toBe(2);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax(a: f32, b: f32) -> f32 {
        return max(a, b);
      }"
    `);
  });

  it('works with multiple arguments', () => {
    const myMax = tgpu.fn(
      [d.f32, d.f32, d.f32, d.f32],
      d.f32,
    )((a, b, c, d) => {
      'use gpu';
      return std.max(a, b, c, d);
    });

    expect(myMax(2, 1, 4, 5)).toBe(5);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax(a: f32, b: f32, c: f32, d: f32) -> f32 {
        return max(max(max(a, b), c), d);
      }"
    `);
  });

  it('unifies arguments', () => {
    const myMax = tgpu.fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      const a = d.u32(9);
      const b = d.i32(1);
      const c = d.f32(4);
      return std.max(a, b, 3.3, c, 7);
    });

    expect(myMax()).toBe(9);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax() -> f32 {
        const a = 9u;
        const b = 1i;
        const c = 4f;
        return max(max(max(max(f32(a), f32(b)), 3.3f), c), 7f);
      }"
    `);
  });

  it('works with vectors', () => {
    const myMax = tgpu.fn(
      [d.vec3u, d.vec3u],
      d.vec3u,
    )((a, b) => {
      'use gpu';
      return std.max(a, b);
    });

    expect(myMax(d.vec3u(1, 2, 3), d.vec3u(3, 2, 1))).toStrictEqual(d.vec3u(3, 2, 3));
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax(a: vec3u, b: vec3u) -> vec3u {
        return max(a, b);
      }"
    `);
  });

  it('does comptime reduction', () => {
    const myMax = tgpu.fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      return std.max(12, 33, 12333, 444);
    });

    expect(myMax()).toBe(12333);
    expect(tgpu.resolve([myMax])).toMatchInlineSnapshot(`
      "fn myMax() -> u32 {
        return 12333u;
      }"
    `);
  });

  it('cannot be called with invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.max(1, d.vec2f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'number, vec2f'.]`,
    );
    // @ts-expect-error
    expect(() => std.max(d.vec3f(), d.vec2f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec3f, vec2f'.]`,
    );
    // @ts-expect-error
    expect(() => std.max(d.vec2f(), d.vec2u())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec2u'.]`,
    );
  });
});

describe('max in shaders', () => {
  it('unifies abstract literals with concrete arguments', () => {
    const main = (x: number, v: d.v3f) => {
      'use gpu';
      const a = std.max(x, 0);
      const b = std.max(v, d.vec3f(0));
    };

    expect(tgpu.resolve([tgpu.fn([d.f32, d.vec3f])(main)])).toMatchInlineSnapshot(`
      "fn main(x: f32, v: vec3f) {
        let a = max(x, 0f);
        let b = max(v, vec3f());
      }"
    `);
  });

  it('rejects arguments that WGSL does not accept', () => {
    expect(() =>
      tgpu.resolve([
        tgpu.fn([d.vec3f, d.bool])((v: d.v3f, b: boolean) => {
          'use gpu';
          // @ts-expect-error
          std.max(v, 0);
        }),
      ]),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:max: Unsupported data types: vec3f, abstractInt. Supported types are: f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h, i32, u32, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u, abstractInt.]
    `);
  });

  it('converts booleans to a numeric type, like other numeric functions', () => {
    const main = (b: boolean) => {
      'use gpu';
      // @ts-expect-error
      const a = std.max(b, b);
    };

    expect(tgpu.resolve([tgpu.fn([d.bool])(main)])).toMatchInlineSnapshot(`
      "fn main(b: bool) {
        let a = max(f32(b), f32(b));
      }"
    `);
  });
});
