import { beforeEach, expect, type MockInstance, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn');
});

it('implicitly casts right-hand side, with a warning', () => {
  const foo = tgpu.fn(
    [d.f32],
    d.i32,
  )((arg) => {
    let a = 12; // inferred to be i32
    a = arg;
    return a;
  });

  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo(arg: f32) -> i32 {
      var a = 12;
      a = i32(arg);
      return a;
    }"
  `);

  expect(warnSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "⚠️ [implicit-conversion] ",
        "Implicit conversions from [
      a: i32,
      arg: f32
    ] to i32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
    ]
  `);
});

it('rejects assignments used as expressions', () => {
  const chained = tgpu.fn([])(() => {
    let a = 1;
    let b = 2;
    a = b = 3;
    return a + b;
  });

  expect(() => tgpu.resolve([chained])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn:chained: 'b = 3' is invalid, assignments are statements in WGSL and cannot be used as expressions.]
  `);

  const inCondition = tgpu.fn([])(() => {
    let a = 1;
    if ((a = 2) === 2) {
      return;
    }
  });

  expect(() => tgpu.resolve([inCondition])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn:inCondition: 'a = 2' is invalid, assignments are statements in WGSL and cannot be used as expressions.]
  `);
});

it('accepts assignments in statement position, including for clauses', () => {
  const main = tgpu.fn([])(() => {
    let a = 0;
    for (let i = 0; i < 3; i += 1) {
      a += i;
    }
    a *= 2;
  });

  expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
    "fn main() {
      var a = 0;
      for (var i = 0; (i < 3i); i += 1i) {
        a += i;
      }
      a *= 2i;
    }"
  `);
});
