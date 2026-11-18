import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { plugin } from 'bun';
import typegpuPlugin from 'unplugin-typegpu/bun';
import type { ProcGenConfig } from './procedural.ts';

export interface ColdStartResult {
  importMs: number;
  firstResolveMs: number;
  secondResolveMs: number;
  wgslLength: number;
}

const args = process.argv.slice(2);

function argValue(name: string, fallback: number): number {
  const index = args.indexOf(name);
  return index === -1 ? fallback : Number(args[index + 1]);
}

const RUNS = argValue('--runs', 30);
const MAX_DEPTH = argValue('--depth', 4);

const programConfig: ProcGenConfig = {
  mainBranching: 2,
  branching: 2,
  maxDepth: MAX_DEPTH,
  recurseProb: 1,
  seed: MAX_DEPTH * 2 ** 24,
};

const dir = import.meta.dirname ?? '.';
// In the monorepo, `typegpu` and `tinyest` (which it imports) export their sources, the builds sit next to them
const typegpuEntry = Bun.resolveSync('typegpu', dir);
const typegpuDist = resolve(dirname(typegpuEntry), '../dist/index.js');
const tinyestEntry = Bun.resolveSync('tinyest', dirname(typegpuEntry));
const tinyestDist = resolve(dirname(tinyestEntry), '../dist/index.js');

function exactPath(path: string) {
  return new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
}

async function child() {
  // Swaps the package entries for their builds, like for an app that installed them from npm, so
  // that the import below measures module evaluation only. (`onResolve` doesn't run for bare
  // specifiers in Bun's runtime plugins, hence `onLoad`.)
  plugin({
    name: 'built-packages',
    setup(build) {
      build.onLoad({ filter: exactPath(typegpuEntry) }, () => ({
        contents: `export * from ${JSON.stringify(typegpuDist)}; export { default } from ${JSON.stringify(typegpuDist)};`,
        loader: 'js',
      }));
      build.onLoad({ filter: exactPath(tinyestEntry) }, () => ({
        contents: `export * from ${JSON.stringify(tinyestDist)};`,
        loader: 'js',
      }));
    },
  });

  const importStart = performance.now();
  const typegpu = await import('typegpu');
  const importMs = performance.now() - importStart;
  if (typegpu.tgpu !== (await import(typegpuDist)).tgpu) {
    throw new Error(`typegpu was not loaded from ${typegpuDist}`);
  }

  // The benchmark program itself still has to go through the build plugin
  void plugin(typegpuPlugin({ include: /[\\/]resolution-time[\\/]procedural\.ts$/ }));
  const { resolveOnce } = await import('./procedural.ts');
  const first = resolveOnce(programConfig);
  const second = resolveOnce(programConfig);

  const result: ColdStartResult = {
    importMs,
    firstResolveMs: first.timeMs,
    secondResolveMs: second.timeMs,
    wgslLength: first.wgslLength,
  };
  console.log(JSON.stringify(result));
}

function summarize(values: number[]): string {
  const sorted = values.toSorted((a, b) => a - b);
  const at = (q: number) =>
    (sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0).toFixed(2);
  return `median ${at(0.5)}ms  p10 ${at(0.1)}ms  p90 ${at(0.9)}ms  (min ${at(0)}ms, max ${at(1)}ms)`;
}

function parent() {
  for (const built of [typegpuDist, tinyestDist]) {
    if (!existsSync(built)) {
      throw new Error(
        `${built} is missing, build it first: pnpm --filter tinyest --filter typegpu build`,
      );
    }
  }

  const results: ColdStartResult[] = [];

  for (let i = 0; i < RUNS; i++) {
    // A fresh process per sample. It skips bunfig.toml, so that the plugin preloaded there doesn't
    // transform the library, and registers the plugin itself instead.
    const proc = spawnSync(
      process.execPath,
      [
        `--config=${resolve(dir, 'bunfig.cold-start.toml')}`,
        resolve(dir, 'coldStart.ts'),
        '--child',
        '--depth',
        String(MAX_DEPTH),
      ],
      { cwd: dir, encoding: 'utf8' },
    );
    if (proc.status !== 0) {
      throw new Error(`Cold-start run ${i} failed:\n${proc.stderr}`);
    }
    const result = JSON.parse(proc.stdout.trim().split('\n').at(-1) ?? '') as ColdStartResult;
    results.push(result);
    console.log(
      `run=${i}  import=${result.importMs.toFixed(2)}ms  firstResolve=${result.firstResolveMs.toFixed(
        2,
      )}ms  secondResolve=${result.secondResolveMs.toFixed(2)}ms  wgsl=${result.wgslLength} chars`,
    );
  }

  console.log(`\nCold start over ${RUNS} runs, maxDepth=${MAX_DEPTH}`);
  console.log(`import typegpu:  ${summarize(results.map((r) => r.importMs))}`);
  console.log(`first resolve:   ${summarize(results.map((r) => r.firstResolveMs))}`);
  console.log(`second resolve:  ${summarize(results.map((r) => r.secondResolveMs))}`);

  writeFileSync(resolve(dir, 'results-cold-start.json'), JSON.stringify(results, null, 2));
}

if (args.includes('--child')) {
  await child();
} else {
  parent();
}
