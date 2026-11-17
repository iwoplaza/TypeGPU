import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d, std } from 'typegpu';

describe('expression statements', () => {
  it('forbids numeric expression statements', () => {
    const fn = () => {
      'use gpu';
      1;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '1;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids boolean expression statements', () => {
    const fn = () => {
      'use gpu';
      true;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'true;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids identifier expression statements', () => {
    const fn = () => {
      'use gpu';
      const a = 1;
      a;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'a;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids external identifier expression statements', () => {
    const a = 'call()';
    const fn = () => {
      'use gpu';
      a;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'a;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids unary expression statements', () => {
    const fn = () => {
      'use gpu';
      const a = 1;
      -a;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '-a;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids logical expression statements', () => {
    const fn = () => {
      'use gpu';
      const a = true;
      a || false;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'a || false;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids array expression statements', () => {
    const fn = () => {
      'use gpu';
      [1, 2, 3];
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '[1, 2, 3];' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids object expression statements', () => {
    const fn = () => {
      'use gpu';
      // oxlint-disable-next-line typegpu/no-unwrapped-objects
      ({ p: 1 });
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '{ p: 1 };' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids null literal statements', () => {
    const fn = () => {
      'use gpu';
      null;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like 'null;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('forbids binary expression statements', () => {
    const fn = () => {
      'use gpu';
      1 + 1;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Expression statements like '1 + 1;' are forbidden in WGSL. Remove the statement, or use the result in code (for example, assign it to a variable).]
    `);
  });

  it('allows member expressions', () => {
    const helper = () => {
      'use gpu';
    };
    const callHelper = tgpu['~unstable'].rawCodeSnippet('helper()', d.Void).$uses({ helper });

    const fn = () => {
      'use gpu';
      callHelper.$;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn helper() {}

      fn fn_1() {
        helper();
      }"
    `);
  });

  it('discards values through a phony assignment', () => {
    const fn = tgpu.fn([d.f32, d.bool, d.vec2f, d.arrayOf(d.f32, 4)])((x, b, v, arr) => {
      std.sin(x);
      std.sin(1);
      Math.abs(x);
      d.vec2f(x);
      b ? x : x;
      v.x;
      arr[0];
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1(x: f32, b: bool, v: vec2f, arr: array<f32, 4>) {
        _ = sin(x);
        _ = 0.8414709848078965;
        _ = abs(x);
        _ = vec2f(x);
        _ = select(x, x, b);
        _ = v.x;
        _ = arr[0i];
      }"
    `);
  });

  it('discards resources through a phony assignment', ({ root }) => {
    const uniform = root.createUniform(d.f32);
    const layout = tgpu.bindGroupLayout({
      values: { storage: d.arrayOf(d.f32), access: 'mutable' },
    });
    const counter = tgpu.workgroupVar(d.atomic(d.u32));

    const fn = () => {
      'use gpu';
      uniform.$;
      layout.$.values;
      counter.$;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> uniform_1: f32;

      @group(1) @binding(0) var<storage, read_write> values: array<f32>;

      var<workgroup> counter: atomic<u32>;

      fn fn_1() {
        _ = uniform_1;
        _ = (&values);
        _ = (&counter);
      }"
    `);
  });

  it('allows calling user-defined functions that return a value', () => {
    const withShell = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return 1;
    });

    const shellless = () => {
      'use gpu';
      return d.f32(2);
    };

    const fn = () => {
      'use gpu';
      withShell();
      shellless();
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn withShell() -> f32 {
        return 1f;
      }

      fn shellless() -> f32 {
        return 2f;
      }

      fn fn_1() {
        withShell();
        shellless();
      }"
    `);
  });

  it('allows calling builtins with side effects', () => {
    const counter = tgpu.workgroupVar(d.atomic(d.u32));

    const fn = () => {
      'use gpu';
      std.atomicStore(counter.$, 0);
      std.atomicAdd(counter.$, 1);
      std.atomicLoad(counter.$);
      std.atomicCompareExchangeWeak(counter.$, 1, 2);
      std.workgroupBarrier();
      std.discard();
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "var<workgroup> counter: atomic<u32>;

      fn fn_1() {
        atomicStore(&counter, 0u);
        atomicAdd(&counter, 1u);
        atomicLoad(&counter);
        atomicCompareExchangeWeak(&counter, 1u, 2u);
        workgroupBarrier();
        discard;;
      }"
    `);
  });

  it('discards the value of a must-use call with side effects through a phony assignment', () => {
    const counter = tgpu.workgroupVar(d.atomic(d.u32));
    const value = tgpu.workgroupVar(d.f32);

    const sideEffect = tgpu.fn(
      [],
      d.f32,
    )(() => {
      std.atomicAdd(counter.$, 1);
      return 1;
    });

    const fn = tgpu.fn([])(() => {
      std.sin(sideEffect());
      std.workgroupUniformLoad(value.$);
      sideEffect() > 0 ? d.f32(1) : d.f32(2);
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "var<workgroup> counter: atomic<u32>;

      fn sideEffect() -> f32 {
        atomicAdd(&counter, 1u);
        return 1f;
      }

      var<workgroup> value: f32;

      fn fn_1() {
        _ = sin(sideEffect());
        _ = workgroupUniformLoad(&value);
        _ = select(2f, 1f, (sideEffect() > 0f));
      }"
    `);
  });

  it('allows raw code snippets that produce a value', () => {
    const helper = tgpu.fn([], d.f32)(() => 1);
    const callHelper = tgpu['~unstable'].rawCodeSnippet('helper()', d.f32).$uses({ helper });

    const fn = () => {
      'use gpu';
      callHelper.$;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn helper() -> f32 {
          return 1f;
        }

      fn fn_1() {
        helper();
      }"
    `);
  });
});
