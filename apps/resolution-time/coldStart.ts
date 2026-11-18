import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

async function child() {
  const importStart = performance.now();
  await import('typegpu');
  const importMs = performance.now() - importStart;

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
  const dir = import.meta.dirname ?? '.';
  const results: ColdStartResult[] = [];

  for (let i = 0; i < RUNS; i++) {
    // a fresh process per sample, run from this directory so bunfig.toml preloads the plugin
    const proc = spawnSync(
      process.execPath,
      [resolve(dir, 'coldStart.ts'), '--child', '--depth', String(MAX_DEPTH)],
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
