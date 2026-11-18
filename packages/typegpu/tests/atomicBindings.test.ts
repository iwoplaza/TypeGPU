import { describe, expect } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';

const Counter = d.struct({ counter: d.atomic(d.u32) });

describe('atomics in buffer bindings', () => {
  it('rejects atomics in uniform and readonly bindings', ({ root }) => {
    expect(() => root.createUniform(Counter)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a 'uniform' binding of a buffer with schema struct:Counter, as it contains atomics. Atomics can only be used in mutable storage buffers and workgroup variables.]`,
    );
    expect(() => root.createReadonly(Counter)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a 'readonly' binding of a buffer with schema struct:Counter, as it contains atomics. Atomics can only be used in mutable storage buffers and workgroup variables.]`,
    );

    const buffer = root.createBuffer(Counter).$usage('uniform', 'storage').$name('counterBuffer');
    expect(() => buffer.as('uniform')).toThrow(/contains atomics/);
    expect(() => buffer.as('readonly')).toThrow(/contains atomics/);
  });

  it('rejects atomics nested in arrays and decorated struct props', ({ root }) => {
    expect(() =>
      root.createUniform(d.arrayOf(d.atomic(d.i32), 4)),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a 'uniform' binding of a buffer with schema arrayOf(atomic<i32>, 4), as it contains atomics. Atomics can only be used in mutable storage buffers and workgroup variables.]`,
    );
    expect(() =>
      root.createReadonly(d.struct({ inner: d.struct({ a: d.align(16, d.atomic(d.u32)) }) })),
    ).toThrow(/contains atomics/);
  });

  it('rejects bare atomics in uniform and readonly bindings', ({ root }) => {
    expect(() => root.createUniform(d.atomic(d.u32))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a 'uniform' binding of a buffer with schema atomic<u32>, as it contains atomics. Atomics can only be used in mutable storage buffers and workgroup variables.]`,
    );
    expect(() => root.createReadonly(d.atomic(d.i32))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a 'readonly' binding of a buffer with schema atomic<i32>, as it contains atomics. Atomics can only be used in mutable storage buffers and workgroup variables.]`,
    );
  });

  it('allows atomics in mutable bindings', ({ root }) => {
    const counter = root.createMutable(Counter);
    const view = root.createBuffer(Counter).$usage('storage').as('mutable');

    const fn = tgpu.fn([])(() => {
      std.atomicAdd(counter.$.counter, 1);
      std.atomicAdd(view.$.counter, 1);
    });

    const wgsl = tgpu.resolve([fn]);
    expect(wgsl).toContain('var<storage, read_write> counter: Counter;');
    expect(wgsl).toContain('var<storage, read_write> view: Counter;');
  });

  it('allows an atomic buffer to be bound to a non-atomic uniform entry', ({ root }) => {
    const layout = tgpu.bindGroupLayout({ u: { uniform: d.struct({ counter: d.u32 }) } });
    const buffer = root.createBuffer(Counter).$usage('uniform');

    expect(() => root.unwrap(root.createBindGroup(layout, { u: buffer }))).not.toThrow();
  });
});

describe('atomics in bind group layouts', () => {
  it('rejects atomics in uniform and readonly storage entries', () => {
    expect(() =>
      tgpu.bindGroupLayout({ u: { uniform: Counter } }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Bind group layout entry 'u' is a uniform buffer, but its schema contains atomics. Atomics can only be used in mutable storage buffers ({ storage: ..., access: 'mutable' }) and workgroup variables.]`,
    );
    expect(() =>
      tgpu.bindGroupLayout({ r: { storage: Counter, access: 'readonly' } }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Bind group layout entry 'r' is a readonly storage buffer, but its schema contains atomics. Atomics can only be used in mutable storage buffers ({ storage: ..., access: 'mutable' }) and workgroup variables.]`,
    );
    expect(() => tgpu.bindGroupLayout({ r: { storage: Counter } })).toThrow(/contains atomics/);
    expect(() =>
      tgpu.bindGroupLayout({ r: { storage: (n: number) => d.arrayOf(d.atomic(d.u32), n) } }),
    ).toThrow(/contains atomics/);
  });

  it('allows atomics in mutable storage entries and workgroup variables', () => {
    const layout = tgpu.bindGroupLayout({ m: { storage: Counter, access: 'mutable' } });
    const shared = tgpu.workgroupVar(d.atomic(d.u32));

    const fn = tgpu.fn([])(() => {
      std.atomicAdd(layout.$.m.counter, 1);
      std.atomicAdd(shared.$, 1);
    });

    expect(tgpu.resolve([fn])).toContain('var<storage, read_write> m: Counter;');
  });
});

describe('atomics in variables and constants', () => {
  it('rejects atomics in private variables', () => {
    expect(() => tgpu.privateVar(d.atomic(d.u32))).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a private variable with schema {"type":"atomic"}, as it contains atomics. Atomics can only be used in mutable storage buffers and workgroup variables.]`,
    );
    expect(() => tgpu.privateVar(Counter)).toThrow(/contains atomics/);
    expect(() => tgpu.privateVar(d.arrayOf(d.atomic(d.i32), 4))).toThrow(/contains atomics/);
  });

  it('rejects atomics in constants', () => {
    expect(() => tgpu.const(d.atomic(d.u32), 1 as never)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot create a constant with schema {"type":"atomic"}, as it contains atomics. Atomics can only be used in mutable storage buffers and workgroup variables.]`,
    );
    expect(() => tgpu.const(Counter, { counter: 0 } as never)).toThrow(/contains atomics/);
  });

  it('allows atomics in workgroup variables', () => {
    const shared = tgpu.workgroupVar(d.arrayOf(Counter, 4));

    const fn = tgpu.fn([])(() => {
      std.atomicAdd(shared.$[0]!.counter, 1);
    });

    expect(tgpu.resolve([fn])).toMatch(/var<workgroup> \w+: array<Counter, 4>;/);
  });
});
