import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('unary plus', () => {
  it('is an identity for runtime numeric operands', () => {
    const main = tgpu.fn(
      [d.f32, d.u32],
      d.f32,
    )((x, y) => {
      return +x + +y;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main(x: f32, y: u32) -> f32 {
        return (x + f32(y));
      }"
    `);
  });

  it('is folded for comptime-known operands', () => {
    const main = tgpu.fn([], d.i32)(() => {
      const a = +5;
      const b = -+5;
      return a + b + +2.5;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        const a = 5;
        const b = -5;
        return i32((f32((a + b)) + 2.5f));
      }"
    `);
  });

  it('throws on non-numeric operands', () => {
    const main = tgpu.fn(
      [d.vec3f],
      d.f32,
    )((v) => {
      return +v;
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: Unary operator + requires a numeric operand. Got vec3f.]
    `);
  });
});
