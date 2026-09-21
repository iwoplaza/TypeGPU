import { beforeEach, describe, expect, type MockInstance, vi } from 'vitest';
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

describe('exponentiation assignment', () => {
  it('is emitted as an assignment of pow', () => {
    const main = tgpu.fn(
      [d.f32, d.i32],
      d.f32,
    )((x, n) => {
      let a = x;
      a **= 2;
      let b = n;
      b **= n;
      return a + d.f32(b);
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main(x: f32, n: i32) -> f32 {
        var a = x;
        a = pow(a, 2f);
        var b = n;
        b = i32(pow(f32(b), f32(n)));
        return (a + f32(b));
      }"
    `);
  });

  it('works on struct properties', () => {
    const Boid = d.struct({ pos: d.vec3f, mass: d.f32 });
    const main = tgpu.fn([])(() => {
      const boid = Boid();
      boid.mass **= 0.5;
      boid.pos.x **= 2;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        mass: f32,
      }

      fn main() {
        var boid = Boid();
        boid.mass = pow(boid.mass, 0.5f);
        boid.pos.x = pow(boid.pos.x, 2f);
      }"
    `);
  });

  it('cannot be used as an expression', () => {
    const main = tgpu.fn(
      [d.f32],
      d.f32,
    )((x) => {
      let a = x;
      return (a **= 2);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: 'a **= 2' is invalid, assignments are statements in WGSL and cannot be used as expressions.]
    `);
  });
});

describe('logical assignment', () => {
  it('is emitted as an assignment of a logical expression', () => {
    const main = tgpu.fn(
      [d.bool, d.f32],
      d.bool,
    )((b, x) => {
      let a = b;
      a &&= x > 0;
      a ||= x < -1;
      return a;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main(b: bool, x: f32) -> bool {
        var a = b;
        a = (a && (x > 0f));
        a = (a || (x < -1f));
        return a;
      }"
    `);
  });

  it('keeps comptime-known right-hand sides inline', () => {
    const flag = true;
    const main = tgpu.fn(
      [],
      d.bool,
    )(() => {
      let a = false;
      a ||= flag;
      return a;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> bool {
        var a = false;
        a = (a || true);
        return a;
      }"
    `);
  });

  it('requires boolean operands', () => {
    const main = tgpu.fn(
      [d.f32],
      d.f32,
    )((x) => {
      let a = x;
      a &&= 2;
      return a;
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: Logical expression '&&' requires boolean operands. Got 'f32' and 'abstractInt'.]
    `);
  });

  it('keeps rejecting nullish assignment', () => {
    const main = tgpu.fn(
      [d.f32],
      d.f32,
    )((x) => {
      let a = x;
      a ??= 2;
      return a;
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: The \`??=\` operator is unsupported in TypeGPU functions.]
    `);
  });
});
