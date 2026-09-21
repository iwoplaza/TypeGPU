import { it } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { expectSnippetOf } from '../utils/parseResolved.ts';

describe('let declarations', () => {
  it('rejects let assigning the result of a void function', () => {
    const noop = tgpu.fn([])(() => {});

    const f = tgpu.fn([])(() => {
      let a = noop();
    });

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:f: 'let a = noop()' is invalid, cannot determine WGSL type of 'noop()']
    `);
  });

  it('initializes a local definition with a scalar value', () => {
    function foo() {
      'use gpu';
      let a = d.f32(12);
      return a;
    }

    expectSnippetOf(foo).toStrictEqual(['a', d.f32, 'local-def']);

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> f32 {
        let a = 12f;
        return a;
      }"
    `);
  });

  it('concretizes an abstract int to i32', () => {
    function foo() {
      'use gpu';
      let a = 12;
      return a;
    }

    expectSnippetOf(foo).toStrictEqual(['a', d.i32, 'local-def']);

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> i32 {
        let a = 12;
        return a;
      }"
    `);
  });

  it('throws when initializing with a string', () => {
    function foo() {
      'use gpu';
      let a = '12';
      return a;
    }

    expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): 'let a = "12"' is invalid, cannot determine WGSL type of '"12"']
    `);
  });

  it('throws when initializing with null without a schema hint', () => {
    function foo() {
      'use gpu';
      let a = null;
      return a;
    }

    expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): 'let a = null' is invalid, cannot determine WGSL type of 'null']
    `);
  });

  it('rejects bare undefined because it has no WGSL type', () => {
    function foo() {
      'use gpu';
      let a = undefined;
      return a;
    }

    expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): 'let a = undefined' is invalid, cannot determine WGSL type of 'undefined']
    `);
  });
});

describe('multiple declarators', () => {
  it('declares each variable separately', () => {
    const main = tgpu.fn(
      [],
      d.f32,
    )(() => {
      let a = 1,
        b = 2.5;
      const c = a + b,
        v = d.vec2f(c);
      a += 1;
      return v.x + d.f32(a);
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        var a = 1;
        let b = 2.5;
        let c = (f32(a) + b);
        let v = vec2f(c);
        a += 1i;
        return (v.x + f32(a));
      }"
    `);
  });
});
