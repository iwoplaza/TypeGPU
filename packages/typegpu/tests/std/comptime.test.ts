import { describe, expect, expectTypeOf } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d, std } from 'typegpu';

describe('isKnownAtComptime', () => {
  it('returns true during normal JS execution', () => {
    expect(std.isKnownAtComptime(123)).toBe(true);
    expect(std.isKnownAtComptime(d.vec3f(1, 2, 3))).toBe(true);
    expectTypeOf(std.isKnownAtComptime(123)).toEqualTypeOf<boolean>();
  });

  it('returns true for literals during generation', () => {
    const f = () => {
      'use gpu';
      return std.isKnownAtComptime(123) ? 7 : -7;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 7;
      }"
    `);
  });

  it('returns false for function arguments', () => {
    const f = tgpu.fn(
      [d.u32],
      d.i32,
    )((a) => {
      'use gpu';
      return std.isKnownAtComptime(a) ? 7 : -7;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(a: u32) -> i32 {
        return -7i;
      }"
    `);
  });

  it('returns true for the length of a fixed-size array', () => {
    const layout = tgpu.bindGroupLayout({
      items: { storage: d.arrayOf(d.u32, 3) },
    });

    const f = () => {
      'use gpu';
      return std.isKnownAtComptime(layout.$.items.length) ? 7 : -7;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 7;
      }"
    `);
  });

  it('returns false for the length of a runtime-sized array', () => {
    const layout = tgpu.bindGroupLayout({
      items: { storage: d.arrayOf(d.u32) },
    });

    const f = () => {
      'use gpu';
      return std.isKnownAtComptime(layout.$.items.length) ? 7 : -7;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> items: array<u32>;

      fn f() -> i32 {
        return -7;
      }"
    `);
  });

  it('unrolls a loop over a fixed-size array, but keeps a loop for a runtime-sized one', () => {
    const fixed = tgpu.bindGroupLayout({
      boids: { storage: d.arrayOf(d.vec2f, 3) },
    });
    const dynamic = tgpu.bindGroupLayout({
      boids: { storage: d.arrayOf(d.vec2f) },
    });

    const sumFixed = () => {
      'use gpu';
      let total = d.vec2f();
      for (const boid of std.isKnownAtComptime(fixed.$.boids.length)
        ? tgpu.unroll(fixed.$.boids)
        : fixed.$.boids) {
        total = std.add(total, boid);
      }
      return total;
    };

    const sumDynamic = () => {
      'use gpu';
      let total = d.vec2f();
      for (const boid of std.isKnownAtComptime(dynamic.$.boids.length)
        ? tgpu.unroll(dynamic.$.boids)
        : dynamic.$.boids) {
        total = std.add(total, boid);
      }
      return total;
    };

    expect(tgpu.resolve([sumFixed, sumDynamic])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> boids: array<vec2f, 3>;

      fn sumFixed() -> vec2f {
        var total = vec2f();
        // unrolled iteration #0
        total = (total + boids[0u]);
        // unrolled iteration #1
        total = (total + boids[1u]);
        // unrolled iteration #2
        total = (total + boids[2u]);
        // ---
        return total;
      }

      @group(1) @binding(0) var<storage, read> boids_1: array<vec2f>;

      fn sumDynamic() -> vec2f {
        var total = vec2f();
        for (var i = 0u; i < arrayLength((&boids_1)); i += 1u) {
          let boid = (&boids_1[i]);
          total = (total + (*boid));
        }
        return total;
      }"
    `);
  });

  it('returns true inside simulate', () => {
    const result = tgpu['~unstable'].simulate(() => std.isKnownAtComptime(d.vec2f()));

    expect(result.value).toBe(true);
  });
});
