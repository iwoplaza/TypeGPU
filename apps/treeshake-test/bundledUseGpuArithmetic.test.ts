import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as tsdown } from 'tsdown';
import esbuildPlugin from 'unplugin-typegpu/esbuild';
import rolldownPlugin from 'unplugin-typegpu/rolldown';
import { afterAll, describe, expect, it } from 'vitest';

// Operators inside 'use gpu' functions are rewritten into calls to tsover's helpers,
// which a tree-shaken bundle might not contain. Arithmetic on plain numbers has to work anyway.

const distDir = fileURLToPath(new URL('./dist/', import.meta.url));
fs.mkdirSync(distDir, { recursive: true });
// Inside the app, so that `typegpu` resolves like it would in a user's project
const tmpDir = fs.mkdtempSync(path.join(distDir, 'use-gpu-arithmetic-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const bundlers = {
  async esbuild(entry: string, outDir: string) {
    const outfile = path.join(outDir, 'out.js');
    await esbuild({
      plugins: [esbuildPlugin()],
      entryPoints: [entry],
      bundle: true,
      outfile,
      format: 'esm',
      minify: true,
      treeShaking: true,
      logLevel: 'silent',
    });
    return outfile;
  },
  async tsdown(entry: string, outDir: string) {
    await tsdown({
      config: false,
      plugins: [rolldownPlugin()],
      outputOptions: { dir: outDir },
      minify: true,
      platform: 'neutral',
      dts: false,
      logLevel: 'silent',
      entry: { out: entry },
      noExternal: /.*/,
    });
    const [outFile] = fs.readdirSync(outDir).filter((file) => file.startsWith('out.'));
    if (!outFile) {
      throw new Error(`tsdown did not emit a bundle into ${outDir}`);
    }
    return path.join(outDir, outFile);
  },
};

const cases = {
  "a 'use gpu' function in a file that imports nothing": {
    code: `
      const f = (a, b) => {
        'use gpu';
        let r = a * b + a;
        r -= 1;
        r *= 2;
        r += r % 5;
        r /= 2;
        return r;
      };
      console.log(f(2, 3));
    `,
    expected: '9',
  },
  'a numeric tgpu.fn': {
    code: `
      import { tgpu, d } from 'typegpu';
      const f = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => {
        'use gpu';
        return a * b + a;
      });
      console.log(f(2, 3));
    `,
    expected: '8',
  },
  'vectors created with d.vec2f': {
    code: `
      import { d } from 'typegpu';
      const f = (a, b) => {
        'use gpu';
        return a * b + a;
      };
      console.log(String(f(d.vec2f(1, 2), d.vec2f(3, 4))));
    `,
    expected: 'vec2f(4, 10)',
  },
  'vectors that only come from a std function': {
    code: `
      import { std } from 'typegpu';
      const f = (a, b) => {
        'use gpu';
        return a + b * 2;
      };
      // two f16 ones
      const v = std.unpack2x16float(0x3c003c00);
      console.log(String(f(v, v)));
    `,
    expected: 'vec2f(3, 3)',
  },
};

describe.each(Object.keys(bundlers) as (keyof typeof bundlers)[])(
  "arithmetic in 'use gpu' functions bundled with %s",
  (bundlerName) => {
    it.each(Object.keys(cases) as (keyof typeof cases)[])(
      'works for %s',
      async (caseName) => {
        const { code, expected } = cases[caseName];
        const caseDir = fs.mkdtempSync(path.join(tmpDir, `${bundlerName}-`));
        const entry = path.join(caseDir, 'entry.js');
        fs.writeFileSync(entry, code);

        const outFile = await bundlers[bundlerName](entry, path.join(caseDir, 'dist'));
        // Printing just the error (and its cause), instead of the minified line that threw
        const runner = `import(${JSON.stringify(pathToFileURL(outFile).href)}).catch((e) => {
          console.error(String(e?.cause ?? e));
          process.exitCode = 1;
        });`;
        const { stdout, stderr } = spawnSync(
          process.execPath,
          ['--input-type=module', '--eval', runner],
          { encoding: 'utf8' },
        );

        expect({ output: stdout.trim(), error: stderr.trim() || undefined }).toStrictEqual({
          output: expected,
          error: undefined,
        });
      },
      30_000,
    );
  },
);
