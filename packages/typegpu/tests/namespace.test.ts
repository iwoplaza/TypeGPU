import { describe, expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('tgpu.namespace', () => {
  it('does not name a declaration after a template enumerant', ({ root }) => {
    const counter = root.createMutable(d.u32).$name('read_write');
    const scale = tgpu.privateVar(d.f32).$name('rgba8unorm');

    const fn = () => {
      'use gpu';
      const write = counter.$ + 1;
      scale.$ = d.f32(write);
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> read_write_1: u32;

      var<private> rgba8unorm_1: f32;

      fn fn_1() {
        let write_1 = (read_write_1 + 1u);
        rgba8unorm_1 = f32(write_1);
      }"
    `);
  });

  it('does not name an immediate after its own address space', () => {
    const level = tgpu['~unstable'].immediateVar(d.f32).$name('immediate');
    const fn = tgpu.fn([], d.f32)(() => level.$);

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "var<immediate> immediate_1: f32;

      fn fn_1() -> f32 {
        return immediate_1;
      }"
    `);
  });

  it('still accepts a template enumerant as a struct member name', () => {
    const Access = d.struct({ read: d.u32, write: d.u32 });

    expect(tgpu.resolve([Access])).toMatchInlineSnapshot(`
      "struct Access {
        read: u32,
        write: u32,
      }"
    `);
  });

  it('accepts names that WGSL does not reserve as struct member names', () => {
    const Bindings = d.struct({ sampler: d.u32, uniform: d.f32, storage: d.i32 });

    expect(tgpu.resolve([Bindings])).toMatchInlineSnapshot(`
      "struct Bindings {
        sampler: u32,
        uniform: f32,
        storage: i32,
      }"
    `);
  });

  it('does not name a declaration after a predeclared type or address space', () => {
    const a = tgpu.privateVar(d.f32).$name('sampler');
    const b = tgpu.privateVar(d.f32).$name('uniform');
    const c = tgpu.privateVar(d.f32).$name('storage');

    const fn = () => {
      'use gpu';
      const sampler = b.$;
      a.$ = sampler + c.$;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "var<private> uniform_1: f32;

      var<private> storage_1: f32;

      var<private> sampler_2: f32;

      fn fn_1() {
        let sampler_1 = uniform_1;
        sampler_2 = (sampler_1 + storage_1);
      }"
    `);
  });

  it('defines direct dependencies only once', () => {
    const Boid = d.struct({
      pos: d.vec3f,
    });

    const names = tgpu['~unstable'].namespace();

    const code1 = tgpu.resolve({
      names,
      template: 'var<private> foo: Boid',
      externals: { Boid },
    });

    const code2 = tgpu.resolve({
      names,
      template: 'var<private> foo: Boid',
      externals: { Boid },
    });

    expect(code1).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }var<private> foo: Boid"
    `);

    // Should be just the template, as Boid was already defined in the namespace
    expect(code2).toMatchInlineSnapshot(`"var<private> foo: Boid"`);
  });

  it('defines transitive dependencies only once', () => {
    const Boid = d.struct({
      pos: d.vec3f,
    });

    const createBoid = tgpu.fn(
      [],
      Boid,
    )(() => {
      return Boid();
    });

    const updateBoid = tgpu.fn([d.ptrFn(Boid)])((boid) => {
      boid.$.pos.x += 1;
    });

    const names = tgpu['~unstable'].namespace();

    const code1 = tgpu.resolve([createBoid], { names });

    const code2 = tgpu.resolve([updateBoid], { names });

    expect(code1).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }

      fn createBoid() -> Boid {
        return Boid();
      }"
    `);

    expect(code2).toMatchInlineSnapshot(`
      "fn updateBoid(boid: ptr<function, Boid>) {
        (*boid).pos.x += 1f;
      }"
    `);
  });

  it('handles name collision', () => {
    let code1: string, code2: string;
    const names = tgpu['~unstable'].namespace();
    {
      const Boid = d.struct({
        pos: d.vec3f,
      });
      const createBoid = tgpu.fn(
        [],
        Boid,
      )(() => {
        return Boid();
      });
      code1 = tgpu.resolve([createBoid], { names });
    }

    {
      const Boid = d.struct({
        pos: d.vec3i,
      });
      const createBoid = tgpu.fn(
        [],
        Boid,
      )(() => {
        return Boid();
      });
      code2 = tgpu.resolve([createBoid], { names });
    }

    expect(code1).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
      }

      fn createBoid() -> Boid {
        return Boid();
      }"
    `);

    expect(code2).toMatchInlineSnapshot(`
      "struct Boid_1 {
        pos: vec3i,
      }

      fn createBoid_1() -> Boid_1 {
        return Boid_1();
      }"
    `);
  });
});
