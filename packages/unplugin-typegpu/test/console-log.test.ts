import Babel from '@babel/standalone';
import { runInThisContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import babelPlugin from '../src/babel.ts';
import { unpluginFactory } from '../src/core/factory.ts';
import { babelTransform, rollupTransform } from './transform.ts';

/** Runs only the transform of the unplugin factory, without bundling */
function unpluginTransform(code: string, id = 'file.js'): string {
  const plugin = unpluginFactory({ include: [/\.m?[jt]sx?$/], autoNamingEnabled: false }, {
    framework: 'vite',
  } as never);
  const transform = plugin.transform as unknown as {
    handler(this: unknown, code: string, id: string): { code: string } | undefined;
  };
  return transform.handler.call({ warn: () => {} }, code, id)?.code ?? code;
}

describe('functions that log', () => {
  const code = `\
    import { tgpu } from 'typegpu';

    const logs = () => {
      'use gpu';
      console.log(1);
    };

    const quiet = () => {
      'use gpu';
      return 1;
    };

    const shell = tgpu.fn([])(() => {
      console.warn(2);
    });
  `;

  test('babel', () => {
    expect(babelTransform(code)).toMatchInlineSnapshot(`
      "import * as _typegpu from "typegpu";
      import { tgpu } from 'typegpu';
      const logs = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        'use gpu';

        console.log(1);
      }, {
        v: 2,
        name: "logs",
        ast: {
          params: [],
          body: [0, [[6, "console.log", [[5, "1"]]]]]
        },
        externals: {
          "console.log": () => console.log
        },
        consoleLog: _typegpu.INTERNAL_consoleLog
      }) && $.f)({});
      const quiet = /*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        'use gpu';

        return 1;
      }, {
        v: 2,
        name: "quiet",
        ast: {
          params: [],
          body: [0, [[10, [5, "1"]]]]
        },
        externals: {}
      }) && $.f)({});
      const shell = tgpu.fn([])(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = () => {
        console.warn(2);
      }, {
        v: 2,
        name: undefined,
        ast: {
          params: [],
          body: [0, [[6, "console.warn", [[5, "2"]]]]]
        },
        externals: {
          "console.warn": () => console.warn
        },
        consoleLog: _typegpu.INTERNAL_consoleLog
      }) && $.f)({}));"
    `);
  });

  test('rollup', async () => {
    expect(await rollupTransform(code)).toMatchInlineSnapshot(`
      "import * as _typegpu from 'typegpu';
      import { tgpu } from 'typegpu';

      tgpu.fn([])((/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (() => {
            console.warn(2);
          }), {
          v: 2,
          name: undefined,
          ast: {"params":[],"body":[0,[[6,"console.warn",[[5,"2"]]]]]},
          externals: {"console.warn":() => console.warn},
          consoleLog: _typegpu.INTERNAL_consoleLog
        }) && $.f)({})));
      "
    `);
  });
});

describe('console methods aliased in the same file', () => {
  const code = `\
    const log = console.log;
    const { warn } = console;

    export const first = () => {
      'use gpu';
      log(1);
    };

    export const second = () => {
      'use gpu';
      warn(2);
    };
  `;

  test('babel', () => {
    const result = babelTransform(code) ?? '';
    expect(result).toMatch(/import \* as _typegpu from ['"]typegpu['"];/);
    expect(result.match(/consoleLog: _typegpu\.INTERNAL_consoleLog/g)).toHaveLength(2);
  });

  test('rollup', async () => {
    const result = await rollupTransform(code);
    expect(result).toMatch(/import \* as _typegpu from ['"]typegpu['"];/);
    expect(result.match(/consoleLog: _typegpu\.INTERNAL_consoleLog/g)).toHaveLength(2);
  });
});

describe('files that already use the generated name', () => {
  const code = `\
    const _typegpu = 'taken';

    export const logs = () => {
      'use gpu';
      console.log(_typegpu);
    };
  `;

  test('babel', () => {
    const result = babelTransform(code) ?? '';
    expect(result).toMatch(/import \* as _typegpu2 from ['"]typegpu['"];/);
    expect(result).toContain('consoleLog: _typegpu2.INTERNAL_consoleLog');
  });

  test('rollup', async () => {
    const result = await rollupTransform(code);
    expect(result).toMatch(/import \* as _typegpu2 from ['"]typegpu['"];/);
    expect(result).toContain('consoleLog: _typegpu2.INTERNAL_consoleLog');
  });
});

describe('files with directives', () => {
  test('the import is added below them', () => {
    const plugin = unpluginFactory({ include: [/\.m?[jt]sx?$/], autoNamingEnabled: false }, {
      framework: 'vite',
    } as never);
    const transform = plugin.transform as unknown as {
      handler(this: unknown, code: string, id: string): { code: string } | undefined;
    };

    const result = transform.handler.call(
      { warn: () => {} },
      `'use client';\nconst logs = () => {\n  'use gpu';\n  console.log(1);\n};\n`,
      'file.ts',
    );

    expect(result?.code.split('\n').slice(0, 2)).toStrictEqual([
      `'use client';`,
      `import * as _typegpu from 'typegpu';`,
    ]);
  });
});

describe('CommonJS files', () => {
  const code = `\
    const { tgpu } = require('typegpu');

    const logs = () => {
      'use gpu';
      console.log(1);
    };

    module.exports = { logs };
  `;

  /** Runs a CommonJS module, with `typegpu` stubbed, and returns what it exports */
  function runCommonJs(output: string, typegpu: object) {
    const module = { exports: {} as Record<string, unknown> };
    const require = (id: string) => (id === 'typegpu' ? typegpu : undefined);
    const wrapper = runInThisContext(`(function (require, module, exports) {\n${output}\n})`);
    wrapper(require, module, module.exports);
    return module.exports;
  }

  function consoleLogOf(fn: unknown) {
    const meta = (globalThis as { __TYPEGPU_META__?: WeakMap<object, { consoleLog?: unknown }> })
      .__TYPEGPU_META__;
    return meta?.get(fn as object)?.consoleLog;
  }

  test.each(['script', 'unambiguous', 'module'] as const)(
    'babel (sourceType: %s) refers to typegpu with require',
    (sourceType) => {
      const output =
        Babel.transform(code, {
          plugins: [[babelPlugin, { include: [/\.m?[jt]sx?$/], autoNamingEnabled: false }]],
          sourceType,
        }).code ?? '';

      expect(output).not.toMatch(/^\s*import /m);
      expect(output).toContain(`consoleLog: require("typegpu").INTERNAL_consoleLog`);

      const support = {};
      const { logs } = runCommonJs(output, { tgpu: {}, INTERNAL_consoleLog: support });
      expect(consoleLogOf(logs)).toBe(support);
    },
  );

  test('unplugin refers to typegpu with require', () => {
    const output = unpluginTransform(code);

    expect(output).not.toMatch(/^\s*import /m);
    expect(output).toContain(`consoleLog: require('typegpu').INTERNAL_consoleLog`);

    const support = {};
    const { logs } = runCommonJs(output, { tgpu: {}, INTERNAL_consoleLog: support });
    expect(consoleLogOf(logs)).toBe(support);
  });

  test('babel leaves scripts without require alone', () => {
    const output =
      Babel.transform(`const logs = () => {\n  'use gpu';\n  console.log(1);\n};`, {
        plugins: [[babelPlugin, { include: [/\.m?[jt]sx?$/], autoNamingEnabled: false }]],
        sourceType: 'script',
      }).code ?? '';

    expect(output).toContain('globalThis.__TYPEGPU_META__');
    expect(output).not.toContain('import');
    expect(output).not.toContain('consoleLog');
  });
});

describe('console reached through the global object', () => {
  const code = `\
    import { tgpu } from 'typegpu';

    const { console: c } = globalThis;

    export const first = () => {
      'use gpu';
      globalThis.console.log(1);
    };

    export const second = () => {
      'use gpu';
      window.console.warn(2);
    };

    export const third = () => {
      'use gpu';
      c.info(3);
    };

    export const notConsole = () => {
      'use gpu';
      globalThis.notConsole.log(4);
    };
  `;

  test('babel', () => {
    const result = babelTransform(code) ?? '';
    expect(result.match(/consoleLog: _typegpu\.INTERNAL_consoleLog/g)).toHaveLength(3);
  });

  test('unplugin', () => {
    const result = unpluginTransform(code);
    expect(result.match(/consoleLog: _typegpu\.INTERNAL_consoleLog/g)).toHaveLength(3);
  });
});
