import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import type { Agent } from 'package-manager-detector';
import { loadFile, writeFile, type ProxifiedModule } from 'magicast';
import {
  addVitePlugin,
  getConfigFromVariableDeclaration,
  getDefaultExportOptions,
} from 'magicast/helpers';

import { findConfig } from '../utils/config.ts';
import { hasDependency } from '../utils/pkg.ts';
import { pmAdd } from '../utils/pm.ts';
import { confirmStep, failAndExit } from '../utils/prompts.ts';
import type { PackageJson } from '../utils/types.ts';

const VITE_CONFIG_NAMES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mts',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
];

const VITE_CONFIG_TEMPLATE = `import { defineConfig } from 'vite';
import typegpuPlugin from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpuPlugin()],
});
`;

const PLUGIN_PACKAGE = 'unplugin-typegpu';
const PLUGIN_DOCS_URL = 'https://docs.swmansion.com/TypeGPU/tooling/unplugin-typegpu/';

// Entry points whose default export can be used as a Vite plugin (Vite runs Rollup and Rolldown plugins too)
const VITE_COMPATIBLE_ENTRIES = ['vite', 'rollup', 'rolldown'].map(
  (entry) => `${PLUGIN_PACKAGE}/${entry}`,
);
const VITE_COMPATIBLE_ROOT_EXPORTS = [
  'default',
  '*',
  'vitePlugin',
  'rollupPlugin',
  'rolldownPlugin',
];

type AstNode = { type: string; [key: string]: unknown };

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null && typeof (value as AstNode).type === 'string';
}

function someAstNode(node: AstNode, predicate: (node: AstNode) => boolean): boolean {
  if (predicate(node)) {
    return true;
  }
  return Object.entries(node).some(([key, value]) => {
    if (key === 'loc' || key === 'original' || key === 'comments' || key === 'tokens') {
      return false;
    }
    const children = Array.isArray(value) ? value : [value];
    return children.some((child) => isAstNode(child) && someAstNode(child, predicate));
  });
}

function getDynamicImportSource(node: AstNode) {
  const source =
    node.type === 'ImportExpression'
      ? node.source
      : node.type === 'CallExpression' && isAstNode(node.callee) && node.callee.type === 'Import'
        ? (node.arguments as unknown[])[0]
        : undefined;
  return isAstNode(source) && typeof source.value === 'string' ? source.value : undefined;
}

function importsPlugin(config: ProxifiedModule) {
  const staticImport = config.imports.$items.some((item) => {
    if (
      item.$declaration.importKind === 'type' ||
      (item.$ast.type === 'ImportSpecifier' && item.$ast.importKind === 'type')
    ) {
      return false;
    }
    return (
      VITE_COMPATIBLE_ENTRIES.includes(item.from) ||
      (item.from === PLUGIN_PACKAGE && VITE_COMPATIBLE_ROOT_EXPORTS.includes(item.imported))
    );
  });

  return (
    staticImport ||
    someAstNode(config.$ast as AstNode, (node) => {
      const source = getDynamicImportSource(node);
      return source === PLUGIN_PACKAGE || VITE_COMPATIBLE_ENTRIES.includes(source ?? '');
    })
  );
}

function isEditableConfig(config: ProxifiedModule) {
  if (!config.exports.default) {
    return false;
  }

  const options = getDefaultExportOptions(config);
  if (options.$type === 'object') {
    return true;
  }
  if (options.$type !== 'identifier') {
    return false;
  }

  // Mirrors the declaration shapes that `addVitePlugin` knows how to write back
  let declaration;
  try {
    declaration = getConfigFromVariableDeclaration(config);
  } catch {
    return false;
  }
  const init =
    declaration.declaration.init?.type === 'TSSatisfiesExpression'
      ? declaration.declaration.init.expression
      : declaration.declaration.init;
  const writable =
    init?.type === 'ObjectExpression' ||
    (init?.type === 'CallExpression' && init.callee.type === 'Identifier');
  return writable && declaration.config?.$type === 'object';
}

// `addVitePlugin` merges the import into an existing declaration from the same entry, even a type-only one
function moveImportOutOfTypeOnlyDeclaration(config: ProxifiedModule, from: string, local: string) {
  const item = config.imports.$items.find((i) => i.from === from && i.local === local);
  const declaration = item?.$declaration;
  if (!item || declaration?.importKind !== 'type') {
    return;
  }

  declaration.specifiers = declaration.specifiers.filter((specifier) => specifier !== item.$ast);
  const valueDeclaration = {
    type: 'ImportDeclaration',
    importKind: 'value',
    specifiers: [item.$ast],
    source: { type: 'StringLiteral', value: from },
  } as typeof declaration;
  const body = (config.$ast as { body: unknown[] }).body;
  body.splice(body.indexOf(declaration), 0, valueDeclaration);
}

/**
 * Adds unplugin-typegpu to the Vite config, unless the config already uses it.
 * @returns whether the config was modified
 */
export function addTypegpuPlugin(config: ProxifiedModule) {
  if (importsPlugin(config)) {
    return false;
  }

  if (!isEditableConfig(config)) {
    throw new Error('Expected the default export to be a config object.');
  }

  const from = `${PLUGIN_PACKAGE}/vite`;
  addVitePlugin(config, { from, constructor: 'typegpuPlugin' });
  moveImportOutOfTypeOnlyDeclaration(config, from, 'typegpuPlugin');
  return true;
}

export function manualSetupMessage(fileName: string) {
  return `Add \`typegpuPlugin()\` from 'unplugin-typegpu/vite' to the \`plugins\` array in ${fileName} yourself: ${PLUGIN_DOCS_URL}`;
}

/**
 * @returns whether unplugin-typegpu still has to be added to the config manually
 */
async function setupViteConfig(filePath: string) {
  const fileName = path.basename(filePath);
  let config;
  try {
    config = await loadFile(filePath);
  } catch {
    failAndExit(`Could not parse ${fileName}.`);
  }

  try {
    if (!addTypegpuPlugin(config)) {
      p.log.info(`unplugin-typegpu is already configured in ${fileName}.`);
      return false;
    }
    await writeFile(config, filePath);
  } catch (error) {
    p.log.warn(
      `Could not add unplugin-typegpu to ${fileName} automatically (${error instanceof Error ? error.message : String(error)}).\n${manualSetupMessage(fileName)}`,
    );
    return true;
  }
  p.log.success(`Updated ${fileName}.`);
  return false;
}

function createViteConfig(cwd: string) {
  fs.writeFileSync(path.join(cwd, 'vite.config.ts'), VITE_CONFIG_TEMPLATE);
  p.log.success('Created vite.config.ts.');
}

export async function setupVite(
  cwd: string,
  pm: Agent,
  pkg: PackageJson,
  options: { createConfigIfMissing?: boolean } = {},
): Promise<string | undefined> {
  if (hasDependency(pkg, 'unplugin-typegpu')) {
    p.log.info('unplugin-typegpu is already installed.');
  } else {
    pmAdd(pm, ['unplugin-typegpu'], true);
  }

  const viteConfigPath = findConfig(cwd, VITE_CONFIG_NAMES);
  if (viteConfigPath) {
    if (await setupViteConfig(viteConfigPath)) {
      return path.basename(viteConfigPath);
    }
  } else if (options.createConfigIfMissing) {
    createViteConfig(cwd);
  }
  return undefined;
}

/**
 * @returns the name of the Vite config that unplugin-typegpu still has to be added to manually, if any
 */
export async function askForVite(cwd: string, pm: Agent, pkg: PackageJson) {
  if (!(await confirmStep('Install unplugin-typegpu and configure vite?'))) {
    return undefined;
  }

  const viteConfigPath = findConfig(cwd, VITE_CONFIG_NAMES);
  return await setupVite(cwd, pm, pkg, {
    createConfigIfMissing: !viteConfigPath
      ? await confirmStep('No vite config found. Create vite.config.ts?')
      : false,
  });
}
