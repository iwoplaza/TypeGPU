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

it('throws when the value cannot be converted to the type of the target', () => {
  const scalar = () => {
    'use gpu';
    let flag = d.bool();
    // @ts-expect-error: part of the test
    flag = 3;
    return flag;
  };

  const vector = () => {
    'use gpu';
    let r = d.f32();
    const v = d.vec2f(1);
    // @ts-expect-error: part of the test
    r = v;
    return r;
  };

  const mismatchedVectors = () => {
    'use gpu';
    let r = d.vec3f();
    // @ts-expect-error: part of the test
    r = d.vec2f(1);
    return r;
  };

  expect(() => tgpu.resolve([scalar])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:scalar
    - fn*:scalar(): Cannot assign '3' of type 'abstractInt' to 'flag' of type 'bool']
  `);
  expect(() => tgpu.resolve([vector])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:vector
    - fn*:vector(): Cannot assign 'v' of type 'vec2f' to 'r' of type 'f32']
  `);
  expect(() => tgpu.resolve([mismatchedVectors])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:mismatchedVectors
    - fn*:mismatchedVectors(): Cannot assign 'd.vec2f(1)' of type 'vec2f' to 'r' of type 'vec3f']
  `);
});

it('still accepts assignments that convert, swizzles and structurally equal structs', () => {
  const A = d.struct({ x: d.f32 });
  const B = d.struct({ x: d.f32 });

  const f = () => {
    'use gpu';
    let r = d.f32();
    r = 3;
    let v = d.vec3f();
    v.x = 2;
    let a = A();
    a = B({ x: r });
    return a.x + v.x;
  };

  expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
    "struct A {
      x: f32,
    }

    struct B {
      x: f32,
    }

    fn f() -> f32 {
      var r = 0f;
      r = 3f;
      var v = vec3f();
      v.x = 2f;
      var a = A();
      a = A(B(r).x);
      return (a.x + v.x);
    }"
  `);
});
