import { describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform, unpluginTransform } from './transform.ts';

const computedKeysCode = `\
  import { tgpu } from 'typegpu';

  const key = 'foo';
  const slots = {
    [key]: tgpu.slot(),
    ['literal']: tgpu.slot(),
    quoted: tgpu.slot(),
  };

  class Holder {
    [key] = tgpu.slot();
  }

  const obj = {};
  obj[key] = tgpu.slot();
  obj['assigned'] = tgpu.slot();

  console.log(slots, Holder, obj);
`;

const typeAssertionsCode = `\
  import { tgpu } from 'typegpu';

  const asSlot = tgpu.slot() as unknown;
  const satisfiesSlot = tgpu.slot() satisfies unknown;
  const nonNullSlot = tgpu.slot()!;
  const angleSlot = <unknown>tgpu.slot();
  const nestedSlot = (tgpu.slot() as unknown) as unknown;
  const props = { propSlot: tgpu.slot() as unknown };

  console.log(asSlot, satisfiesSlot, nonNullSlot, angleSlot, nestedSlot, props);
`;

const namespaceDefaultCode = `\
  import * as T from 'typegpu';

  const fromDefault = T.default.slot();
  const fnFromDefault = T.default.fn([])(() => {});

  console.log(fromDefault, fnFromDefault);
`;

function expectComputedKeys(output: string) {
  expect(output).toContain('"literal")');
  expect(output).toContain('"quoted")');
  expect(output).toContain('"assigned")');
  expect(output).not.toContain('"key")');
}

function expectTypeAssertions(output: string) {
  for (const name of [
    'asSlot',
    'satisfiesSlot',
    'nonNullSlot',
    'angleSlot',
    'nestedSlot',
    'propSlot',
  ]) {
    expect(output).toContain(`"${name}")`);
  }
}

function expectNamespaceDefault(output: string) {
  expect(output).toContain('"fromDefault")');
  expect(output).toContain('"fnFromDefault")');
  expect(output).toContain('__TYPEGPU_META__');
}

describe('[BABEL] auto naming edge cases', () => {
  it('does not name computed keys, except for string literals', () => {
    expectComputedKeys(babelTransform(computedKeysCode, { autoNamingEnabled: true }) ?? '');
  });

  it('names through type assertions', () => {
    expectTypeAssertions(babelTransform(typeAssertionsCode, { autoNamingEnabled: true }) ?? '');
  });

  it('keeps the type assertion outside of the autoname wrapper', () => {
    expect(
      babelTransform(`import { tgpu } from 'typegpu';\nconst a = tgpu.slot() as unknown;`, {
        autoNamingEnabled: true,
      }),
    ).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';
      const a = /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.slot(), "a") as unknown;"
    `);
  });

  it('recognizes the default export of a namespace import', () => {
    expectNamespaceDefault(babelTransform(namespaceDefaultCode, { autoNamingEnabled: true }) ?? '');
  });
});

describe('[ROLLUP] auto naming edge cases', () => {
  it('does not name computed keys, except for string literals', async () => {
    expectComputedKeys(
      await rollupTransform(computedKeysCode, { autoNamingEnabled: true, earlyPruning: false }),
    );
  });

  it('names through type assertions', () => {
    expectTypeAssertions(unpluginTransform(typeAssertionsCode, { autoNamingEnabled: true }));
  });

  it('keeps the type assertion outside of the autoname wrapper', () => {
    expect(
      unpluginTransform(`import { tgpu } from 'typegpu';\nconst a = tgpu.slot() as unknown;`, {
        autoNamingEnabled: true,
      }),
    ).toMatchInlineSnapshot(`
      "import { tgpu } from 'typegpu';
      const a = (/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(tgpu.slot(), "a")) as unknown;"
    `);
  });

  it('recognizes the default export of a namespace import', async () => {
    expectNamespaceDefault(
      await rollupTransform(namespaceDefaultCode, { autoNamingEnabled: true }),
    );
  });
});
