// oxlint-disable typegpu/no-unsupported-syntax -- these tests check how the generator handles such operators
import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('unary operators', () => {
  it('keeps unary minus and logical not as they were', () => {
    const fn = tgpu.fn(
      [d.f32, d.vec2i, d.bool],
      d.f32,
    )((a, v, b) => {
      'use gpu';
      const x = -a;
      // oxlint-disable-next-line typescript-eslint/no-unsafe-unary-minus -- vectors support unary minus on the GPU
      const y = -v;
      const z = !b;
      return x;
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1(a: f32, v: vec2i, b: bool) -> f32 {
        let x = -(a);
        let y = -(v);
        let z = !(b);
        return x;
      }"
    `);
  });

  it('drops unary plus on numeric scalars and vectors', () => {
    const fn = tgpu.fn(
      [d.f32, d.u32, d.vec3f],
      d.f32,
    )((a, b, v) => {
      'use gpu';
      const x = +a;
      const y = +b;
      const w = +v;
      let l = d.f32(1);
      l = +l;
      const k = +1;
      return +a;
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1(a: f32, b: u32, v: vec3f) -> f32 {
        let x = a;
        let y = b;
        let w = v;
        var l = 1f;
        l = l;
        const k = 1;
        return a;
      }"
    `);
  });

  it('rejects unary plus on non-numeric values', () => {
    const fn = tgpu.fn([d.bool])((b) => {
      'use gpu';
      const x = +b;
    });

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn: Unary operator + requires a numeric operand. Got 'b' of type bool.]
    `);
  });

  it('applies ~ to integer scalars and vectors', () => {
    const fn = tgpu.fn([d.i32, d.vec2u])((a, v) => {
      'use gpu';
      let l = d.u32(1);
      const x = ~a;
      const y = ~v;
      l = ~l;
      const k = ~1;
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1(a: i32, v: vec2u) {
        var l = 1u;
        let x = ~a;
        let y = ~v;
        l = ~l;
        let k = ~1;
      }"
    `);
  });

  it('rejects ~ on non-integer values', () => {
    const onBool = tgpu.fn([d.bool])((b) => {
      'use gpu';
      const x = ~b;
    });

    const onFloat = tgpu.fn([d.f32])((a) => {
      'use gpu';
      const x = ~a;
    });

    expect(() => tgpu.resolve([onBool])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:onBool: Unary operator ~ requires an integer or vector of integers. Got 'b' of type bool.]
    `);
    expect(() => tgpu.resolve([onFloat])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:onFloat: Unary operator ~ requires an integer or vector of integers. Got 'a' of type f32.]
    `);
  });

  it('rejects typeof', () => {
    const fn = tgpu.fn([d.f32])((a) => {
      'use gpu';
      const t = typeof a;
    });

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn: 'typeof a' is invalid, the unary operator 'typeof' is not supported in TypeGPU functions.]
    `);
  });

  it('rejects delete', () => {
    const fn = (obj: { x?: number }) => {
      'use gpu';
      const r = delete obj.x;
    };

    expect(() => tgpu.resolve([tgpu.fn([d.struct({ x: d.f32 })])(fn)]))
      .toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:fn: 'delete obj.x' is invalid, the unary operator 'delete' is not supported in TypeGPU functions.]
    `);
  });
});
