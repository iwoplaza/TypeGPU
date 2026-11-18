import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';
import { describe, expect, test } from 'vitest';
import { unpluginFactory } from '../src/core/factory.ts';
import { babelTransform } from './transform.ts';

// NOTE: rollup plugins receive source code stripped of types, but other unplugin setups (esbuild,
// Bun, or Vite with the plugin ordered before TypeScript stripping) pass the raw `.ts` file

function unpluginTransform(code: string, id: string) {
  const plugin = unpluginFactory({ autoNamingEnabled: false }, { framework: 'esbuild' });
  if (Array.isArray(plugin) || typeof plugin.transform !== 'object') {
    throw new Error('Expected a single plugin with a transform hook object');
  }
  const result = plugin.transform.handler.call(
    {} as UnpluginBuildContext & UnpluginContext,
    code,
    id,
  );
  return typeof result === 'object' && result !== null && 'code' in result ? result.code : result;
}

describe('as type', () => {
  test('babel', () => {
    const code = `
    const hello = (a: number, b: number | undefined) => {
      'use gpu';
      return a + (b as number);
    };
  `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const hello = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a: number, b: number | undefined) => {
        'use gpu';

        return __tsover_add(a, b as number);
      }, {
        v: 2,
        name: "hello",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "+", "b"]]]]
        },
        externals: {}
      }) && $.f)({});"
    `);
  });
});

describe('angle-bracket type assertion', () => {
  test('babel', () => {
    const code = `
    const hello = (a: number, b: number | undefined) => {
      'use gpu';
      return a + <number>b;
    };
  `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "const hello = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a: number, b: number | undefined) => {
        'use gpu';

        return __tsover_add(a, <number> b);
      }, {
        v: 2,
        name: "hello",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }, {
            type: "i",
            name: "b"
          }],
          body: [0, [[10, [1, "a", "+", "b"]]]]
        },
        externals: {}
      }) && $.f)({});"
    `);
  });

  test('unplugin, .ts file', () => {
    const code = `
    const hello = (a: number, b: number | undefined) => {
      'use gpu';
      return a + <number>b;
    };
  `;

    expect(unpluginTransform(code, '/src/hello.ts')).toMatchInlineSnapshot(`
      "
          const hello = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a: number, b: number | undefined) => {
            'use gpu';
            return __tsover_add(a, <number>b);
          }), {
          v: 2,
          name: "hello",
          ast: {"params":[{"type":"i","name":"a"},{"type":"i","name":"b"}],"body":[0,[[10,[1,"a","+","b"]]]]},
          externals: {}
        }) && $.f)({}));
        "
    `);
  });
});

describe('instantiation expression', () => {
  test('babel', () => {
    const code = `
    import { foo } from './foo';

    const hello = (a: number) => {
      'use gpu';
      return (foo<number>)(a);
    };
  `;

    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import { foo } from './foo';
      const hello = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (a: number) => {
        'use gpu';

        return foo<number>(a);
      }, {
        v: 2,
        name: "hello",
        ast: {
          params: [{
            type: "i",
            name: "a"
          }],
          body: [0, [[10, [6, "foo", ["a"]]]]]
        },
        externals: {
          "foo": () => foo
        }
      }) && $.f)({});"
    `);
  });

  test('unplugin, .ts file', () => {
    const code = `
    import { foo } from './foo';

    const hello = (a: number) => {
      'use gpu';
      return (foo<number>)(a);
    };
  `;

    expect(unpluginTransform(code, '/src/hello.ts')).toMatchInlineSnapshot(`
      "
          import { foo } from './foo';

          const hello = (/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = ((a: number) => {
            'use gpu';
            return (foo<number>)(a);
          }), {
          v: 2,
          name: "hello",
          ast: {"params":[{"type":"i","name":"a"}],"body":[0,[[10,[6,"foo",["a"]]]]]},
          externals: {"foo":() => foo}
        }) && $.f)({}));
        "
    `);
  });
});
