/**
 * Records a CPU profile of a variant loading (from navigation until the first
 * frame finished) and prints self-time aggregated per function and per file.
 *
 * Usage: node scripts/profile.ts boids/runtime [--cpu=4] [--top=40] [--out=file.cpuprofile]
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chromiumArgs } from './chromium.ts';
import { serveDist } from './serve.ts';

const [app, ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const port = Number(process.env.PORT ?? 4176);
const distDir = fileURLToPath(new URL(`../${process.env.OUT_DIR ?? 'dist'}/`, import.meta.url));

const server = await serveDist(distDir, port);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: chromiumArgs,
});
try {
  const page = await browser.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opts.cpu ?? 1) });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  await page.goto(`http://localhost:${port}/${app}/`);
  await page.waitForFunction(() => window.__bench?.firstFrame !== undefined, null, {
    timeout: 120_000,
  });
  const marks = await page.evaluate(() =>
    performance.getEntriesByType('mark').map((m) => `${m.name}=${m.startTime.toFixed(1)}`),
  );
  const { profile } = await cdp.send('Profiler.stop');
  console.log(marks.join(' '));
  if (opts.out) {
    writeFileSync(opts.out, JSON.stringify(profile));
  }

  const dt = new Map<number, number>();
  const samples = profile.samples ?? [];
  const timeDeltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i] as number;
    dt.set(id, (dt.get(id) ?? 0) + (timeDeltas[i] ?? 0) / 1000);
  }
  const byFn = new Map<string, number>();
  const byFile = new Map<string, number>();
  for (const node of profile.nodes) {
    const t = dt.get(node.id) ?? 0;
    const { functionName, url, lineNumber, columnNumber } = node.callFrame;
    const file = url.split('/').pop() || '(native)';
    const fnKey = `${functionName || '(anonymous)'} ${file}:${lineNumber}:${columnNumber}`;
    byFn.set(fnKey, (byFn.get(fnKey) ?? 0) + t);
    byFile.set(file, (byFile.get(file) ?? 0) + t);
  }
  const top = Number(opts.top ?? 40);
  const print = (m: Map<string, number>) =>
    [...m]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, top)
      .forEach(([k, v]) => console.log(v.toFixed(1).padStart(9), k));
  console.log('--- self time by file (ms)');
  print(byFile);
  console.log('--- self time by function (ms)');
  print(byFn);
} finally {
  await browser.close();
  server.close();
}
