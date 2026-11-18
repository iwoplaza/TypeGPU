import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as tsdown } from 'tsdown';
import esbuildPlugin from 'unplugin-typegpu/esbuild';
import rolldownPlugin from 'unplugin-typegpu/rolldown';
import { afterAll, describe, expect, it } from 'vitest';

// Vectors and matrices can be created without referencing any `d.vec*`/`d.mat*`
// export, so a bundler is free to drop those exports. Their operators have to work anyway.

const distDir = fileURLToPath(new URL('./dist/', import.meta.url));
fs.mkdirSync(distDir, { recursive: true });
// Inside the app, so that `typegpu` resolves like it would in a user's project
const tmpDir = fs.mkdtempSync(path.join(distDir, 'operators-'));
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
  'a vector returned by a std function': {
    code: `
      import * as std from 'typegpu/std';
      console.log(String(std.unpack4x8unorm(0xff00ff00).mul(2).add(1)));
    `,
    expected: 'vec4f(1, 3, 1, 3)',
  },
  'a matrix returned by a std function': {
    code: `
      import * as std from 'typegpu/std';
      const m = std.identity4().mul(2).sub(std.identity4());
      console.log(String(m.mul(std.unpack4x8unorm(0xff00ff00))));
    `,
    expected: 'vec4f(0, 1, 0, 1)',
  },
  'a vector read from an ArrayBuffer': {
    code: `
      import { readFromArrayBuffer } from 'typegpu';
      import * as d from 'typegpu/data';
      const v = readFromArrayBuffer(new Uint8Array([255, 0, 255, 0]).buffer, d.unorm8x4);
      console.log(String(v.div(2).mod(0.375)));
    `,
    expected: 'vec4f(0.125, 0, 0.125, 0)',
  },
  "a vector in a 'use gpu' function called on the CPU": {
    code: `
      import * as std from 'typegpu/std';
      const scale = (a, b) => {
        'use gpu';
        return a * b + a;
      };
      console.log(String(scale(std.unpack4x8unorm(0xff00ff00), 2)));
    `,
    expected: 'vec4f(0, 3, 0, 3)',
  },
};

describe.each(Object.keys(bundlers) as (keyof typeof bundlers)[])(
  'operators on vectors and matrices bundled with %s',
  (bundlerName) => {
    it.each(Object.keys(cases) as (keyof typeof cases)[])(
      'work on %s',
      async (caseName) => {
        const { code, expected } = cases[caseName];
        const caseDir = fs.mkdtempSync(path.join(tmpDir, `${bundlerName}-`));
        const entry = path.join(caseDir, 'entry.js');
        fs.writeFileSync(entry, code);

        const outFile = await bundlers[bundlerName](entry, path.join(caseDir, 'dist'));
        const { stdout, stderr } = spawnSync(process.execPath, [outFile], { encoding: 'utf8' });

        expect({
          output: stdout.trim(),
          error: stderr.match(/^\w*Error: .*$/m)?.[0],
        }).toStrictEqual({ output: expected, error: undefined });
      },
      30_000,
    );
  },
);
