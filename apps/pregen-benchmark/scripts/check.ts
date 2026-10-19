/**
 * Opens built variants, prints console output, page errors and bench state,
 * and saves a screenshot of each into `.scratch/<example>_<variant>.png`.
 *
 * Usage: node scripts/check.ts boids/runtime boids/pregen
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serveDist } from './serve.ts';
import { chromiumArgs } from './chromium.ts';

const port = Number(process.env.PORT ?? 4174);
const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const scratchDir = fileURLToPath(new URL('../.scratch/', import.meta.url));
mkdirSync(scratchDir, { recursive: true });

const server = await serveDist(distDir, port);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: chromiumArgs,
});
try {
  for (const app of process.argv.slice(2)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('console', (m) => console.log(`[${app} console]`, m.text().slice(0, 1000)));
    page.on('pageerror', (e) => console.log(`[${app} pageerror]`, e.message));
    await page.goto(`http://localhost:${port}/${app}/`);
    await page.waitForTimeout(Number(process.env.WAIT ?? 5000));
    const state = await page.evaluate(() => ({
      ...window.__bench,
      frameCpuTimes: window.__bench?.frameCpuTimes.length,
    }));
    console.log(app, JSON.stringify(state));
    await page.screenshot({ path: `${scratchDir}${app.replace('/', '_')}.png` });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
