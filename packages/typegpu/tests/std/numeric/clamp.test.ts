import { describe, expect, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('clamp', () => {
  it('clamps scalars', () => {
    expect(std.clamp(5, 0, 1)).toBe(1);
    expect(std.clamp(-5, 0, 1)).toBe(0);
    expect(std.clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('clamps vectors component-wise', () => {
    expect(std.clamp(d.vec2f(5, -5), d.vec2f(0), d.vec2f(1))).toStrictEqual(d.vec2f(1, 0));
  });

  it('throws on invalid arguments', () => {
    // @ts-expect-error
    expect(() => std.clamp(d.vec2f(), d.vec3f(), d.vec3f())).toThrowErrorMatchingInlineSnapshot(
      `[Error: Unsupported signature. Expected the following kinds to be equal: 'vec2f, vec3f'.]`,
    );
  });
});

describe('saturate', () => {
  it('saturates vectors component-wise', () => {
    expect(std.saturate(d.vec3f(-0.5, 0.25, 1.5))).toStrictEqual(d.vec3f(0, 0.25, 1));
  });
});

describe('clamp in shaders', () => {
  it('unifies abstract literals with concrete arguments', () => {
    const main = (x: number, v: d.v3f) => {
      'use gpu';
      const a = std.clamp(x, 0, 1);
      const b = std.clamp(v, d.vec3f(0), d.vec3f(1));
    };

    expect(tgpu.resolve([tgpu.fn([d.f32, d.vec3f])(main)])).toMatchInlineSnapshot(`
      "fn main(x: f32, v: vec3f) {
        let a = clamp(x, 0f, 1f);
        let b = clamp(v, vec3f(), vec3f(1));
      }"
    `);
  });

  it('rejects arguments that WGSL does not accept', () => {
    expect(() =>
      tgpu.resolve([
        tgpu.fn([d.vec3f, d.bool])((v: d.v3f, b: boolean) => {
          'use gpu';
          // @ts-expect-error
          std.clamp(v, 0, 1);
        }),
      ]),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:<unnamed>
      - fn:clamp: Unsupported data types: vec3f, abstractInt, abstractInt. Supported types are: f32, f16, abstractFloat, vec2f, vec3f, vec4f, vec2h, vec3h, vec4h, i32, u32, vec2i, vec3i, vec4i, vec2u, vec3u, vec4u, abstractInt.]
    `);
  });

  it('converts booleans to a numeric type, like other numeric functions', () => {
    const main = (b: boolean) => {
      'use gpu';
      // @ts-expect-error
      const a = std.clamp(b, b, b);
    };

    expect(tgpu.resolve([tgpu.fn([d.bool])(main)])).toMatchInlineSnapshot(`
      "fn main(b: bool) {
        let a = clamp(f32(b), f32(b), f32(b));
      }"
    `);
  });
});
