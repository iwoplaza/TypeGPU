import { readFile } from 'node:fs/promises';
import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { imagetools } from 'vite-imagetools';
import { defineConfig, type Plugin } from 'vitest/config';
import { preview } from '@vitest/browser-preview';
import { typegpuBuiltAliases } from 'typegpu-testing-utility/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>('unplugin-typegpu/vite', { default: true });

// Glyph keeps its runtime in `import.meta.hot.data` across HMR updates, which
// Vitest provides without `data`. Its published source maps are also missing,
// so the references to them are dropped to keep the test output readable.
const glyphForTests: Plugin = {
  name: 'glyph-for-tests',
  enforce: 'pre',
  async load(id) {
    if (!id.includes('@pmndrs/glyph') || !id.endsWith('.js')) {
      return;
    }
    const code = await readFile(id, 'utf8');
    return {
      code: code
        .replaceAll('import.meta.hot', 'undefined')
        .replace(/\/\/# sourceMappingURL=.*$/m, ''),
      map: null,
    };
  },
};

export default defineConfig({
  plugins: [typegpu({ include: [/\.m?[jt]sx?/] }), imagetools(), glyphForTests] as Plugin[],
  resolve: {
    alias: typegpuBuiltAliases(),
  },
  server: {
    proxy: {
      '/TypeGPU': {
        // Usually where the TypeGPU dev server is
        // hosted.
        target: 'http://localhost:4321',
        changeOrigin: true,
      },
    },
  },
  test: {
    server: {
      deps: {
        // Glyph imports typegpu, so it has to go through Vite to share the
        // same (aliased) typegpu instance as the examples.
        inline: ['@pmndrs/glyph'],
      },
    },
    projects: [
      {
        test: {
          name: 'browser',
          include: ['**/*.{test,spec}.browser.ts'],
          browser: {
            provider: preview(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'individual-example-tests',
          root: './tests/individual-example-tests',
          environment: 'node',
        },
      },
    ],
  },
});
