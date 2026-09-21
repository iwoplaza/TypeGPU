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

describe('destructuring declarations', () => {
  it('destructures vectors and structs without temporaries', () => {
    const Boid = d.struct({ pos: d.vec3f, vel: d.vec3f });

    const main = tgpu.fn(
      [d.vec2f, Boid],
      d.f32,
    )((v, boid) => {
      const { x, y } = v;
      const {
        pos: { z },
        vel,
      } = boid;
      return x + y + z + vel.x;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3f,
      }

      fn main(v: vec2f, boid: Boid) -> f32 {
        let x = v.x;
        let y = v.y;
        let z = boid.pos.z;
        let vel = boid.vel;
        return (((x + y) + z) + vel.x);
      }"
    `);
  });

  it('destructures arrays', () => {
    const main = tgpu.fn(
      [],
      d.i32,
    )(() => {
      const arr: [number, number, number] = [1, 2, 3];
      let [a, , c] = arr;
      a += c;
      return a;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> i32 {
        let arr = array<i32, 3>(1, 2, 3);
        var a = arr[0i];
        let c = arr[2i];
        a += c;
        return a;
      }"
    `);
  });

  it('evaluates non-trivial sources once', () => {
    const getVec = tgpu.fn([d.f32], d.vec2f)((x) => d.vec2f(x, x * 2));

    const main = tgpu.fn(
      [d.f32],
      d.f32,
    )((n) => {
      const { x, y } = getVec(n);
      const [a, b] = [n, n * 3];
      return x + y + a + b;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getVec(x: f32) -> vec2f {
        return vec2f(x, (x * 2f));
      }

      fn main(n: f32) -> f32 {
        let destructured = getVec(n);
        let x = destructured.x;
        let y = destructured.y;
        let destructured_1 = array<f32, 2>(n, (n * 3f));
        let a = destructured_1[0i];
        let b = destructured_1[1i];
        return (((x + y) + a) + b);
      }"
    `);
  });

  it('destructures references to buffers', ({ root }) => {
    const Boid = d.struct({ pos: d.vec3f, mass: d.f32 });
    const boids = root.createMutable(d.arrayOf(Boid, 4));

    const main = tgpu.fn([d.u32])((i) => {
      const { pos, mass } = boids.$[i] as d.Infer<typeof Boid>;
      pos.x = mass;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        mass: f32,
      }

      @group(0) @binding(0) var<storage, read_write> boids: array<Boid, 4>;

      fn main(i: u32) {
        let destructured = (&boids[i]);
        let pos = (&(*destructured).pos);
        let mass = (*destructured).mass;
        (*pos).x = mass;
      }"
    `);
  });
});
