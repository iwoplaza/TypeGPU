import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { generateCode, parseModule } from 'magicast';
import { addTypegpuPlugin, setupVite } from '../src/steps/vite.ts';

function apply(code: string) {
  const config = parseModule(code);
  const added = addTypegpuPlugin(config);
  return { added, code: generateCode(config).code };
}

describe('addTypegpuPlugin', () => {
  it('adds the plugin to a config without it', () => {
    const { added, code } = apply(`\
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
});
`);

    expect(added).toBe(true);
    expect(code).toContain(`import typegpuPlugin from 'unplugin-typegpu/vite';`);
    expect(code).toContain('plugins: [typegpuPlugin()]');
  });

  it('leaves a config that imports the plugin as `typegpuPlugin` alone', () => {
    const source = `\
import { defineConfig } from 'vite';
import typegpuPlugin from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpuPlugin()],
});`;

    expect(apply(source)).toStrictEqual({ added: false, code: source });
  });

  it('leaves a config that imports the plugin under another name alone', () => {
    const source = `\
import { defineConfig } from 'vite';
import typegpu from 'unplugin-typegpu/vite';

export default defineConfig({
  plugins: [typegpu({})],
});`;

    expect(apply(source)).toStrictEqual({ added: false, code: source });
  });

  it.each([
    `import typegpu from 'unplugin-typegpu';`,
    `import { vitePlugin } from 'unplugin-typegpu';`,
    `import typegpu from 'unplugin-typegpu/rollup';`,
    `import typegpu from 'unplugin-typegpu/rolldown';`,
  ])('leaves a config with `%s` alone', (importLine) => {
    const source = `\
import { defineConfig } from 'vite';
${importLine}

export default defineConfig({
  plugins: [],
});`;

    expect(apply(source)).toStrictEqual({ added: false, code: source });
  });

  it.each([
    `export default async () => ({ plugins: [] });`,
    `export default defineConfig(({ mode }) => ({ plugins: [] }));`,
    `module.exports = { plugins: [] };`,
    `const config = defineConfig(({ mode }) => ({ plugins: [] }));\nexport default config;`,
    `const config = async () => ({ plugins: [] });\nexport default config;`,
    `const config = vite.defineConfig({ plugins: [] });\nexport default config;`,
    `export default config;`,
  ])('throws when the config object cannot be found in `%s`', (source) => {
    expect(() => apply(source)).toThrow();
  });

  it('adds the plugin to a config exported through a variable', () => {
    const { added, code } = apply(`\
const config = { plugins: [] };

export default config;`);

    expect(added).toBe(true);
    expect(code).toContain('plugins: [typegpuPlugin()]');
  });

  it('adds the plugin to a `defineConfig` call exported through a variable', () => {
    const { added, code } = apply(`\
import { defineConfig } from 'vite';

const config = defineConfig({ plugins: [] });

export default config;`);

    expect(added).toBe(true);
    expect(code).toContain(`import typegpuPlugin from 'unplugin-typegpu/vite';`);
    expect(code).toContain('plugins: [typegpuPlugin()]');
  });

  it.each([
    `import type { Options } from 'unplugin-typegpu';`,
    `import { type Options } from 'unplugin-typegpu';`,
    `import { babelPlugin } from 'unplugin-typegpu';`,
    `import typegpu from 'unplugin-typegpu/webpack';`,
    `import type typegpu from 'unplugin-typegpu/vite';`,
  ])('adds the plugin to a config with only `%s`', (importLine) => {
    const { added, code } = apply(`\
import { defineConfig } from 'vite';
${importLine}

export default defineConfig({
  plugins: [],
});`);

    expect(added).toBe(true);
    expect(code).toContain('plugins: [typegpuPlugin()]');
  });

  it.each([
    [`import type { Options } from 'unplugin-typegpu/vite';`, 'Options'],
    [`import type typegpu from 'unplugin-typegpu/vite';`, 'typegpu'],
  ])('adds a separate value import next to `%s`', (importLine, typeImport) => {
    const { added, code } = apply(`\
import { defineConfig } from 'vite';
${importLine}

export default defineConfig({
  plugins: [],
});`);

    expect(added).toBe(true);
    const imports = parseModule(code).imports.$items.filter(
      (item) => item.from === 'unplugin-typegpu/vite',
    );
    expect(
      imports.map((item) => ({
        local: item.local,
        typeOnly: item.$declaration.importKind === 'type',
      })),
    ).toStrictEqual([
      { local: 'typegpuPlugin', typeOnly: false },
      { local: typeImport, typeOnly: true },
    ]);
    expect(code).toContain(importLine);
    expect(code).toContain('plugins: [typegpuPlugin()]');
  });

  it.each([
    `(await import('unplugin-typegpu/vite')).default()`,
    `import('unplugin-typegpu/vite').then((m) => m.default())`,
    `(await import('unplugin-typegpu')).vitePlugin()`,
  ])('leaves a config that loads the plugin with `%s` alone', (pluginExpr) => {
    const source = `\
import { defineConfig } from 'vite';

export default defineConfig(async () => ({
  plugins: [${pluginExpr}],
}));`;

    expect(apply(source)).toStrictEqual({ added: false, code: source });
  });
});

describe('setupVite', () => {
  it('warns and keeps going when the config cannot be edited', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'typegpu-cli-vite-'));
    const source = `\
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({ plugins: [] }));
`;
    fs.writeFileSync(path.join(cwd, 'vite.config.ts'), source);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      const leftToDo = await setupVite(cwd, 'pnpm', {
        name: 'app',
        devDependencies: { 'unplugin-typegpu': '*' },
      });

      expect(leftToDo).toBe('vite.config.ts');
      expect(exit).not.toHaveBeenCalled();
      expect(fs.readFileSync(path.join(cwd, 'vite.config.ts'), 'utf-8')).toBe(source);
    } finally {
      exit.mockRestore();
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('reports nothing left to do after updating the config', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'typegpu-cli-vite-'));
    fs.writeFileSync(
      path.join(cwd, 'vite.config.ts'),
      `import { defineConfig } from 'vite';\n\nexport default defineConfig({ plugins: [] });\n`,
    );

    try {
      const leftToDo = await setupVite(cwd, 'pnpm', {
        name: 'app',
        devDependencies: { 'unplugin-typegpu': '*' },
      });

      expect(leftToDo).toBeUndefined();
      expect(fs.readFileSync(path.join(cwd, 'vite.config.ts'), 'utf-8')).toContain(
        'typegpuPlugin()',
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
