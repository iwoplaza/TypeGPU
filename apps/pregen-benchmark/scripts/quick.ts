/**
 * Quick load-time measurement for iterating on TypeGPU itself.
 * Prints medians of the main marks and of the first frame's CPU time.
 *
 * Usage: node scripts/quick.ts boids/runtime [--runs=9] [--cpu=4]
 */
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { chromiumArgs } from './chromium.ts';
import { serveDist } from './serve.ts';

const [app, ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const port = Number(process.env.PORT ?? 4177);
const distDir = fileURLToPath(new URL(`../${process.env.OUT_DIR ?? 'dist'}/`, import.meta.url));
const runs = Number(opts.runs ?? 9);

const server = await serveDist(distDir, port);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: chromiumArgs,
});
const samples: Record<string, number>[] = [];
try {
  for (let i = 0; i < runs + 1; i++) {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opts.cpu ?? 4) });
    await page.goto(`http://localhost:${port}/${app}/`);
    await page.waitForFunction(() => window.__bench?.firstFrame !== undefined, null, {
      timeout: 120_000,
    });
    const s = await page.evaluate(() => {
      // oxlint-disable-next-line eslint-plugin-unicorn(consistent-function-scoping) -- runs inside the page, so it cannot be hoisted
      const mark = (n: string) => performance.getEntriesByName(n)[0]?.startTime ?? NaN;
      return {
        appStart: mark('app-start'),
        interactive: mark('interactive'),
        firstSubmit: mark('first-submit'),
        firstFrameCpu: window.__bench.frameCpuTimes[0],
        firstFrame: mark('first-frame'),
      };
    });
    if (i > 0) samples.push(s);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
const median = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(
  app,
  Object.keys(samples[0])
    .map((k) => `${k}=${median(samples.map((s) => s[k])).toFixed(1)}`)
    .join(' '),
);
