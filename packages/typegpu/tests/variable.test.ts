import { describe, expect, it } from 'vitest';
import { tgpu, d, std, type TgpuVar, type VariableScope } from 'typegpu';

describe('tgpu.privateVar|tgpu.workgroupVar', () => {
  it('should inject variable declaration when used in functions', () => {
    const x = tgpu.privateVar(d.u32, 2);
    const fn1 = tgpu.fn([])`() {
      let y = x;
      return x;
    }`.$uses({ x });

    expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
      "var<private> x: u32 = 2u;

      fn fn1() {
            let y = x;
            return x;
          }"
    `);
  });

  it('should properly resolve variables', () => {
    function test(variable: TgpuVar<VariableScope, d.AnyWgslData>, expected: string) {
      expect(tgpu.resolve([variable])).toBe(expected);
    }

    test(tgpu.privateVar(d.u32, 2).$name('x'), 'var<private> x: u32 = 2u;');
    test(tgpu.privateVar(d.f32, 1.5).$name('x'), 'var<private> x: f32 = 1.5f;');
    test(tgpu.privateVar(d.u32).$name('x'), 'var<private> x: u32;');
    test(tgpu.workgroupVar(d.f32).$name('x'), 'var<workgroup> x: f32;');

    test(
      tgpu.privateVar(d.vec2u, d.vec2u(1, 2)).$name('x'),
      'var<private> x: vec2u = vec2u(1, 2);',
    );

    test(tgpu.privateVar(d.vec3f, d.vec3f()).$name('x'), 'var<private> x: vec3f = vec3f();');

    test(
      tgpu.privateVar(d.arrayOf(d.u32, 2), [1, 2]).$name('x'),
      'var<private> x: array<u32, 2> = array<u32, 2>(1u, 2u);',
    );

    const s = d.struct({ x: d.u32, y: d.vec2i }).$name('s');

    test(
      tgpu.privateVar(s, { x: 2, y: d.vec2i(1, 2) }).$name('x'),
      `\
struct s {
  x: u32,
  y: vec2i,
}

var<private> x: s = s(2u, vec2i(1, 2));`,
    );

    const a = d.arrayOf(s, 2);

    test(
      tgpu
        .privateVar(a, [
          { x: 1, y: d.vec2i(2, 3) },
          { x: 4, y: d.vec2i(5, 6) },
        ])
        .$name('x'),
      `\
struct s {
  x: u32,
  y: vec2i,
}

var<private> x: array<s, 2> = array<s, 2>(s(1u, vec2i(2, 3)), s(4u, vec2i(5, 6)));`,
    );
  });

  it('allows accessing variables in TGSL through .$', () => {
    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3u,
    });

    const boid = tgpu.privateVar(Boid, {
      pos: d.vec3f(1, 2, 3),
      vel: d.vec3u(4, 5, 6),
    });

    const func = tgpu.fn([])(() => {
      const pos = boid.$;
      const vel = boid.$.vel;
      const velX = boid.$.vel.x;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      var<private> boid: Boid = Boid(vec3f(1, 2, 3), vec3u(4, 5, 6));

      fn func() {
        let pos = (&boid);
        let vel = (&boid.vel);
        let velX = boid.vel.x;
      }"
    `);
  });

  it('supports atomic operations on workgroupVar atomics accessed via .$', () => {
    const atomicCounter = tgpu.workgroupVar(d.atomic(d.u32));

    const func = tgpu.fn([])(() => {
      const oldValue = std.atomicAdd(atomicCounter.$, 1);
      const currentValue = std.atomicLoad(atomicCounter.$);
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "var<workgroup> atomicCounter: atomic<u32>;

      fn func() {
        let oldValue = atomicAdd(&atomicCounter, 1u);
        let currentValue = atomicLoad(&atomicCounter);
      }"
    `);
  });

  it('should throw an error when trying to access variable outside of a function', () => {
    const x = tgpu.privateVar(d.u32, 2);
    expect(() => x.$).toThrowErrorMatchingInlineSnapshot(
      `[Error: TypeGPU variables are inaccessible during normal JS execution. If you wanted to simulate GPU behavior, try \`tgpu.simulate()\`]`,
    );
  });

  it('should throw an error when trying to access variable inside of a function top-level', () => {
    const x = tgpu.privateVar(d.u32, 2);
    const foo = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return x.$; // Accessing variable inside of a function
    });
    expect(() => foo()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:foo: Cannot access variable 'x'. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation]
    `);
  });

  describe('simulate mode', () => {
    it('simulates variable incrementing', () => {
      const counter = tgpu.privateVar(d.f32, 0);

      const result = tgpu['~unstable'].simulate(() => {
        counter.$ += 1;
        counter.$ += 2;
        counter.$ += 3;
        return counter.$;
      });

      expect(result.value).toEqual(6);
    });

    it('does not keep state between simulations', () => {
      const counter = tgpu.privateVar(d.f32, 0);

      const fn = () => ++counter.$;

      const result1 = tgpu['~unstable'].simulate(fn);
      const result2 = tgpu['~unstable'].simulate(fn);
      const result3 = tgpu['~unstable'].simulate(fn);

      expect(result1.value).toEqual(1);
      expect(result2.value).toEqual(1);
      expect(result3.value).toEqual(1);
    });

    it('zero-initializes variables without an initial value', () => {
      const counter = tgpu.privateVar(d.u32);
      const pos = tgpu.privateVar(d.vec3f);
      const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });
      const boid = tgpu.privateVar(Boid);
      const shared = tgpu.workgroupVar(d.arrayOf(d.i32, 3));

      const result = tgpu['~unstable'].simulate(() => {
        counter.$ += 1;
        counter.$ += 2;
        return {
          counter: counter.$,
          pos: pos.$,
          boid: boid.$,
          shared: shared.$,
        };
      });

      expect(result.value.counter).toBe(3);
      expect(result.value.pos).toStrictEqual(d.vec3f());
      expect(result.value.boid).toStrictEqual({ pos: d.vec2f(), vel: d.vec2f() });
      expect(result.value.shared).toStrictEqual([0, 0, 0]);
    });

    it('does not share initial values between simulations', () => {
      const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });
      const counter = tgpu.privateVar(d.f32, 1);
      const pos = tgpu.privateVar(d.vec3f, d.vec3f(1, 2, 3));
      const boid = tgpu.privateVar(Boid, Boid({ pos: d.vec2f(1, 2), vel: d.vec2f(3, 4) }));
      const values = tgpu.privateVar(d.arrayOf(d.u32, 3), [1, 2, 3]);
      const sharedPos = tgpu.workgroupVar(d.vec2f);
      const sharedValues = tgpu.workgroupVar(d.arrayOf(d.u32, 2));

      tgpu['~unstable'].simulate(() => {
        counter.$ = 100;
        pos.$.x = 100;
        boid.$.pos.x = 100;
        boid.$.vel = d.vec2f(100);
        values.$[0] = 100;
        sharedPos.$.x = 100;
        sharedValues.$[1] = 100;
      });

      const result = tgpu['~unstable'].simulate(() => ({
        counter: counter.$,
        pos: pos.$,
        boid: boid.$,
        values: values.$,
        sharedPos: sharedPos.$,
        sharedValues: sharedValues.$,
      }));

      expect(result.value.counter).toBe(1);
      expect(result.value.pos).toStrictEqual(d.vec3f(1, 2, 3));
      expect(result.value.boid).toStrictEqual({ pos: d.vec2f(1, 2), vel: d.vec2f(3, 4) });
      expect(result.value.values).toStrictEqual([1, 2, 3]);
      expect(result.value.sharedPos).toStrictEqual(d.vec2f());
      expect(result.value.sharedValues).toStrictEqual([0, 0]);
    });

    it('does not mutate the initial value used in generated WGSL', () => {
      const pos = tgpu.privateVar(d.vec3f, d.vec3f(1, 2, 3));

      tgpu['~unstable'].simulate(() => {
        pos.$.x = 100;
      });

      expect(
        tgpu.resolve([
          () => {
            'use gpu';
            return d.vec3f(pos.$);
          },
        ]),
      ).toContain('var<private> pos: vec3f = vec3f(1, 2, 3);');
    });
  });
});
