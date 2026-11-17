import { describe, expect, it } from 'vitest';
import { generateCode, parseModule } from 'magicast';
import { addTypegpuPlugin } from '../src/steps/vite.ts';

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
});
