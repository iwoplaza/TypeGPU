import virtual from '@rollup/plugin-virtual';
import { type Plugin, rollup } from 'rollup';
import { describe, expect, it } from 'vitest';
import type { Options } from '../src/core/common.ts';
import rollupPlugin from '../src/rollup.ts';
import { babelTransform, rollupTransform } from './transform.ts';

const unusedCode = `\
  import { tgpu, d } from 'typegpu';
  import * as data from 'typegpu/data';
  import { struct as s, arrayOf } from 'typegpu/data';

  const unusedFn = tgpu.fn([d.f32], d.f32)((a) => a);
  const unusedUseGpu = tgpu.fn([d.f32], d.f32)((a) => {
    'use gpu';
    return a;
  });
  const unusedNamed = tgpu.fn([d.f32], d.f32)((a) => a).$name('named');
  const unusedUses = tgpu.fn([d.f32], d.f32)((a) => a).$uses({});
  const unusedVertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => ({ pos: d.vec4f() }));
  const unusedFragment = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f());
  const unusedCompute = tgpu.computeFn({ workgroupSize: [1] })(() => {});
  const unusedShell = tgpu.fn([d.f32]);
  const unusedSlot = tgpu.slot(1);
  const unusedConst = tgpu.const(d.f32, 1);
  const unusedAccessor = tgpu.accessor(d.f32);
  const unusedMutableAccessor = tgpu.mutableAccessor(d.f32);
  const unusedComptime = tgpu.comptime(() => 1);
  const unusedLayout = tgpu.bindGroupLayout({});
  const unusedVertexLayout = tgpu.vertexLayout(d.arrayOf(d.f32));
  const unusedPrivate = tgpu.privateVar(d.f32);
  const unusedWorkgroup = tgpu.workgroupVar(d.f32);
  const unusedStruct = d.struct({ a: d.f32 });
  const unusedUnstruct = data.unstruct({ a: data.f32 });
  const unusedArray = arrayOf(s({ a: d.f32 }), 4);
  const unusedDisarray = d.disarrayOf(d.f32, 4);
  const holder = { unusedProp: tgpu.slot() };

  export const kept = 1;
`;

const sideEffectfulCode = `\
  import { tgpu, d } from 'typegpu';

  const root = await tgpu.init();
  const buffer = root.createBuffer(d.f32);
  const notTgpu = { slot: () => console.log('side effect') };
  const notTgpuSlot = notTgpu.slot();
  const someSlot = tgpu.slot();
  const withSlot = tgpu.fn([])(() => {}).with(someSlot, 1);
  const layoutIdx = tgpu.bindGroupLayout({}).$idx(0);

  export function local(d) {
    const x = d.struct({});
  }
`;

async function treeShake(code: string, plugins: Plugin[] = []) {
  const build = await rollup({
    input: 'code',
    plugins: [virtual({ code }), ...plugins],
    external: ['typegpu', /^typegpu\/.*$/],
    // 'typegpu' is external, so Rollup cannot tell that reading `d.f32` is free of side effects.
    treeshake: { propertyReadSideEffects: false },
    onwarn: () => {},
  });
  const { output } = await build.generate({});
  return output[0].code;
}

const rollupTreeShake = (code: string, options?: Options) =>
  treeShake(code, [
    rollupPlugin({ include: [/virtual:/], autoNamingEnabled: false, ...options }) as Plugin,
  ]);

function expectAllUnusedDropped(output: string) {
  expect(output).not.toMatch(/tgpu\.|struct|arrayOf|unused/);
  expect(output).toContain('kept');
}

function expectSideEffectsKept(output: string) {
  expect(output).toContain('tgpu.init()');
  expect(output).toContain('root.createBuffer(d.f32)');
  expect(output).toContain('notTgpu.slot()');
  expect(output).toContain('.with(someSlot, 1)');
  expect(output).toContain('.$idx(0)');
  expect(output).toContain('d.struct({})');
}

describe('[BABEL] pure annotations', () => {
  it('lets unused functions and schemas be tree-shaken', async () => {
    expectAllUnusedDropped(await treeShake(babelTransform(unusedCode) ?? ''));
    expectAllUnusedDropped(
      await treeShake(babelTransform(unusedCode, { autoNamingEnabled: true }) ?? ''),
    );
  });

  it('does not annotate calls that might have side effects', async () => {
    expectSideEffectsKept(
      await treeShake(babelTransform(sideEffectfulCode, { autoNamingEnabled: true }) ?? ''),
    );
  });

  it('annotates the call inside the autoname wrapper', () => {
    expect(
      babelTransform(
        `import { tgpu, d } from 'typegpu';\nconst slot = tgpu.slot();\nconst Schema = d.struct({ a: d.f32 }).$name('S');`,
        { autoNamingEnabled: true },
      ),
    ).toMatchInlineSnapshot(`
      "import { tgpu, d } from 'typegpu';
      const slot = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(/*#__PURE__*/tgpu.slot(), "slot");
      const Schema = /*#__PURE__*/d.struct({
        a: d.f32
      }).$name('S');"
    `);
  });

  it('is stable when transforming twice', () => {
    const once = babelTransform(unusedCode, { autoNamingEnabled: true }) ?? '';
    expect(babelTransform(once, { autoNamingEnabled: true })).toBe(once);
  });
});

describe('[ROLLUP] pure annotations', () => {
  it('lets unused functions and schemas be tree-shaken', async () => {
    expectAllUnusedDropped(await rollupTreeShake(unusedCode));
    expectAllUnusedDropped(await rollupTreeShake(unusedCode, { autoNamingEnabled: true }));
  });

  it('does not annotate calls that might have side effects', async () => {
    expectSideEffectsKept(await rollupTreeShake(sideEffectfulCode, { autoNamingEnabled: true }));
  });

  it('annotates the call inside the autoname wrapper', async () => {
    expect(
      await rollupTransform(
        `import { tgpu, d } from 'typegpu';\nconst slot = tgpu.slot();\nconst Schema = d.struct({ a: d.f32 }).$name('S');\nconsole.log(slot, Schema);`,
        { autoNamingEnabled: true },
      ),
    ).toMatchInlineSnapshot(`
      "import { tgpu, d } from 'typegpu';

      const slot = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(/*#__PURE__*/tgpu.slot(), "slot"));
      const Schema = /*#__PURE__*/d.struct({ a: d.f32 }).$name('S');
      console.log(slot, Schema);
      "
    `);
  });
});
