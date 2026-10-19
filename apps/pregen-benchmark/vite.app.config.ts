import { fileURLToPath } from 'node:url';
import typegpu from 'unplugin-typegpu/vite';
import { defineConfig } from 'vite';

/**
 * Every example variant is its own Vite app, rooted at `examples/<example>/<variant>`.
 * Select one with the `APP` env variable, e.g. `APP=boids/runtime vite build --config vite.app.config.ts`.
 */
const app = process.env.APP;
if (!app) {
  throw new Error('Specify the app to build with APP=<example>/<variant>');
}

// TYPEGPU_DIST points at another build of the package, e.g. to compare against a baseline
const typegpuDist =
  process.env.TYPEGPU_DIST ?? fileURLToPath(new URL('../../packages/typegpu/dist/', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(`./examples/${app}/`, import.meta.url)),
  base: './',
  plugins: [typegpu({})],
  resolve: {
    // Benchmarking against the built package, which is what npm users get
    alias: process.env.TYPEGPU_FROM_SOURCE
      ? []
      : [
          { find: /^typegpu$/, replacement: `${typegpuDist}index.js` },
          { find: /^typegpu\/(data|std|common)$/, replacement: `${typegpuDist}$1/index.js` },
          { find: /^typegpu\/~internal$/, replacement: `${typegpuDist}internal.js` },
        ],
  },
  build: {
    outDir: fileURLToPath(new URL(`./${process.env.OUT_DIR ?? 'dist'}/${app}/`, import.meta.url)),
    emptyOutDir: true,
    reportCompressedSize: false,
    minify: process.env.MINIFY !== '0',
  },
});
