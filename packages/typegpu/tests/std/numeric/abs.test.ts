import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('abs', () => {
  it('works on scalars and vectors', () => {
    expect(std.abs(-2)).toBe(2);
    expect(std.abs(d.vec3i(-1, 2, -3))).toStrictEqual(d.vec3i(1, 2, 3));
  });
});

describe('abs in shaders', () => {
  it('unifies abstract literals with concrete arguments', () => {
    const main = (x: number, v: d.v3f) => {
      'use gpu';
      const a = std.abs(x);
      const b = std.abs(v);
      const c = std.abs(d.i32(x));
    };

    expect(tgpu.resolve([tgpu.fn([d.f32, d.vec3f])(main)])).toMatchInlineSnapshot(`
      "fn main(x: f32, v: vec3f) {
        let a = abs(x);
        let b = abs(v);
        let c = abs(i32(x));
      }"
    `);
  });

  it('rejects arguments that WGSL does not accept', () => {
    expect(() =>
      tgpu.resolve([
        tgpu.fn([d.vec3b])((v: d.v3b) => {
          'use gpu';
          // @ts-expect-error
          std.abs(v);
        }),
      ]),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:abs: Unsupported data types: vec3<bool>. Supported types are: f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h, i32, u32, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u, abstractInt.]
    `);
  });

  it('converts booleans to a numeric type, like other numeric functions', () => {
    const main = (b: boolean) => {
      'use gpu';
      // @ts-expect-error
      const a = std.abs(b);
    };

    expect(tgpu.resolve([tgpu.fn([d.bool])(main)])).toMatchInlineSnapshot(`
      "fn main(b: bool) {
        let a = abs(f32(b));
      }"
    `);
  });
});
