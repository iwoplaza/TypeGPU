import Babel from '@babel/standalone';
import virtual from '@rollup/plugin-virtual';
import { type Plugin, rollup } from 'rollup';
import babelPlugin from '../src/babel.ts';
import type { Options } from '../src/core/common.ts';
import { unpluginFactory } from '../src/core/factory.ts';
import rollupPlugin from '../src/rollup.ts';

const defaultOptions: Options = {
  include: [/\.m?[jt]sx?$/, /virtual:/],
  autoNamingEnabled: false,
};

type BabelTransformOptions = Parameters<typeof Babel.transform>[1];
export type BabelTestPlugin = NonNullable<BabelTransformOptions['plugins']>[number];

export const babelTransform = (
  code: string,
  options?: Options,
  additionalPlugins: BabelTestPlugin[] = [],
) =>
  Babel.transform(code, {
    plugins: [[babelPlugin, { ...defaultOptions, ...options }], ...additionalPlugins],
    parserOpts: { plugins: ['typescript'] },
  }).code;

export const rollupTransform = (
  code: string,
  options?: Options,
  additionalPlugins: Plugin[] = [],
) =>
  rollup({
    input: 'code',
    plugins: [
      virtual({ code }),
      rollupPlugin({ ...defaultOptions, ...options }),
      ...additionalPlugins,
    ],
    external: ['typegpu', /^typegpu\/.*$/],
  })
    .then((build) => build.generate({}))
    .then((generated) => generated.output[0].code);

/**
 * Runs the unplugin transform directly, without a bundler stripping types first
 * (e.g. Vite with `enforce: 'pre'`).
 */
export const unpluginTransform = (code: string, options?: Options, id = 'code.ts') => {
  const plugin = unpluginFactory({ ...defaultOptions, ...options }, { framework: 'rollup' });
  const result = plugin.transform.handler.call({ warn: () => {} } as never, code, id);
  return result?.code ?? code;
};
