import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import type { Agent } from 'package-manager-detector';
import { loadFile, writeFile, type ProxifiedModule } from 'magicast';
import { addVitePlugin, getDefaultExportOptions } from 'magicast/helpers';

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

function importsPlugin(config: ProxifiedModule) {
  return Object.values(config.imports).some(
    (item) => item.from === PLUGIN_PACKAGE || item.from.startsWith(`${PLUGIN_PACKAGE}/`),
  );
}

/**
 * Adds unplugin-typegpu to the Vite config, unless the config already imports it.
 * @returns whether the config was modified
 */
export function addTypegpuPlugin(config: ProxifiedModule) {
  if (importsPlugin(config)) {
    return false;
  }

  const options = config.exports.default && getDefaultExportOptions(config);
  if (options?.$type !== 'object' && options?.$type !== 'identifier') {
    throw new Error('Expected the default export to be a config object.');
  }

  addVitePlugin(config, { from: `${PLUGIN_PACKAGE}/vite`, constructor: 'typegpuPlugin' });
  return true;
}

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
      return;
    }
    await writeFile(config, filePath);
  } catch (error) {
    failAndExit(
      `Could not add unplugin-typegpu to ${fileName}. Set it up manually: ${PLUGIN_DOCS_URL}`,
      error instanceof Error ? error.message : String(error),
    );
  }
  p.log.success(`Updated ${fileName}.`);
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
) {
  if (hasDependency(pkg, 'unplugin-typegpu')) {
    p.log.info('unplugin-typegpu is already installed.');
  } else {
    pmAdd(pm, ['unplugin-typegpu'], true);
  }

  const viteConfigPath = findConfig(cwd, VITE_CONFIG_NAMES);
  if (viteConfigPath) {
    await setupViteConfig(viteConfigPath);
  } else if (options.createConfigIfMissing) {
    createViteConfig(cwd);
  }
}

export async function askForVite(cwd: string, pm: Agent, pkg: PackageJson) {
  if (!(await confirmStep('Install unplugin-typegpu and configure vite?'))) {
    return;
  }

  const viteConfigPath = findConfig(cwd, VITE_CONFIG_NAMES);
  await setupVite(cwd, pm, pkg, {
    createConfigIfMissing: !viteConfigPath
      ? await confirmStep('No vite config found. Create vite.config.ts?')
      : false,
  });
}
