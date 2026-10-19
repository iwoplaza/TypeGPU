/**
 * Loads every built variant in headless Chromium (WebGPU on SwiftShader) and
 * collects load-time metrics. Results are written to `results/<label>.json`.
 *
 * Usage: node scripts/bench.ts [--label=name] [--runs=7] [--only=example] [--profiles=desktop,mobile]
 *        [--variants=runtime,pregen]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { chromium, type CDPSession, type Page } from 'playwright-core';
import { chromiumArgs } from './chromium.ts';
import { serveDist } from './serve.ts';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const label = args.label ?? 'latest';
const runs = Number(args.runs ?? 7);
const only = args.only;
const profileNames = (args.profiles ?? 'desktop,mobile').split(',');
const variants = (args.variants ?? 'runtime,pregen').split(',');

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const resultsDir = fileURLToPath(new URL('../results/', import.meta.url));
const port = Number(process.env.PORT ?? 4173);

type Profile = {
  cpuThrottling: number;
  network?: { latency: number; downloadThroughput: number; uploadThroughput: number };
};

const profiles: Record<string, Profile> = {
  desktop: { cpuThrottling: 1 },
  // Roughly Lighthouse's mobile preset ("slow 4G" + 4x CPU slowdown)
  mobile: {
    cpuThrottling: 4,
    network: {
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    },
  },
};

type RunMetrics = {
  appStart: number;
  interactive: number;
  firstSubmit: number;
  firstFrame: number;
  firstInteractionHandled: number;
  firstInteractionDelay: number;
  domContentLoaded: number;
  jsTransferBytes: number;
  scriptEvalMs: number;
  totalBlockingTimeMs: number;
  longestTaskMs: number;
  jsHeapUsedMB: number;
  frameCpuMedianMs: number;
  frameCpuP90Ms: number;
};

function staticSizes(dir: string) {
  const assets = `${dir}/assets`;
  let raw = 0;
  let gzip = 0;
  let brotli = 0;
  for (const file of readdirSync(assets)) {
    if (!file.endsWith('.js')) {
      continue;
    }
    const content = readFileSync(`${assets}/${file}`);
    raw += content.length;
    gzip += gzipSync(content, { level: 9 }).length;
    brotli += brotliCompressSync(content, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;
  }
  return { raw, gzip, brotli };
}

const initScript = () => {
  const longTasks: { start: number; duration: number }[] = [];
  (window as unknown as { __longTasks: typeof longTasks }).__longTasks = longTasks;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTasks.push({ start: entry.startTime, duration: entry.duration });
    }
  }).observe({ type: 'longtask', buffered: true });
};

async function measure(page: Page, cdp: CDPSession, url: string): Promise<RunMetrics> {
  await page.goto(url, { waitUntil: 'commit' });

  // Acting like a user that clicks the first control as soon as it is visible.
  const button = await page.waitForSelector('#controls button, #controls input, #controls select', {
    timeout: 120_000,
  });
  const box = await button.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + Math.min(box.height / 2, 8);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  await page.waitForFunction(() => window.__bench?.firstFrame !== undefined && window.__bench?.firstInteraction, null, {
    timeout: 120_000,
    polling: 50,
  });
  // Letting the example run for a while, to sample steady-state frame costs
  // (at least 30 frames, or 15 seconds for scenes that are very slow on SwiftShader)
  await page
    .waitForFunction(() => window.__bench.frameCpuTimes.length >= 40, null, { timeout: 15_000, polling: 100 })
    .catch(() => {});

  const perf = await cdp.send('Performance.getMetrics');
  const metric = (name: string) => perf.metrics.find((m) => m.name === name)?.value ?? 0;

  const page_ = await page.evaluate(() => {
    const b = window.__bench;
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const scripts = performance
      .getEntriesByType('resource')
      .filter((e) => (e as PerformanceResourceTiming).initiatorType === 'script' || e.name.endsWith('.js'));
    const longTasks = (window as unknown as { __longTasks: { start: number; duration: number }[] }).__longTasks;
    const untilFirstFrame = longTasks.filter((t) => t.start <= (b.firstFrame ?? 0));
    const mark = (name: string) => performance.getEntriesByName(name)[0]?.startTime ?? NaN;
    return {
      errors: b.errors,
      appStart: mark('app-start'),
      interactive: mark('interactive'),
      firstSubmit: b.firstSubmit ?? NaN,
      firstFrame: b.firstFrame ?? NaN,
      firstInteractionHandled: b.firstInteraction?.handledAt ?? NaN,
      firstInteractionDelay: b.firstInteraction ? b.firstInteraction.handledAt - b.firstInteraction.eventTimeStamp : NaN,
      domContentLoaded: nav.domContentLoadedEventEnd,
      jsTransferBytes: scripts.reduce((acc, e) => acc + (e as PerformanceResourceTiming).transferSize, 0),
      totalBlockingTimeMs: untilFirstFrame.reduce((acc, t) => acc + Math.max(0, t.duration - 50), 0),
      longestTaskMs: Math.max(0, ...untilFirstFrame.map((t) => t.duration)),
      frameTimes: b.frameCpuTimes.slice(10),
    };
  });

  if (page_.errors.length > 0) {
    throw new Error(`Errors on ${url}: ${page_.errors.join('; ')}`);
  }

  const sorted = [...page_.frameTimes].sort((a, b) => a - b);
  const { errors: _, frameTimes: __, ...rest } = page_;
  return {
    ...rest,
    scriptEvalMs: metric('ScriptDuration') * 1000,
    jsHeapUsedMB: metric('JSHeapUsedSize') / 1024 / 1024,
    frameCpuMedianMs: sorted[Math.floor(sorted.length / 2)] ?? NaN,
    frameCpuP90Ms: sorted[Math.floor(sorted.length * 0.9)] ?? NaN,
  };
}

function median(values: number[]) {
  const sorted = values.filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return NaN;
  }
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const server = await serveDist(distDir, port);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: chromiumArgs,
});

const results: Record<string, unknown> = {};
try {
  for (const example of readdirSync(distDir)) {
    if (only && example !== only) {
      continue;
    }
    for (const variant of variants) {
      const key = `${example}/${variant}`;
      const entry: Record<string, unknown> = { sizes: staticSizes(`${distDir}${key}`) };
      for (const profileName of profileNames) {
        const profile = profiles[profileName];
        const samples: RunMetrics[] = [];
        // One discarded warm-up run (GPU process shader caches etc. are per-browser anyway)
        for (let i = 0; i < runs + 1; i++) {
          const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
          await context.addInitScript(initScript);
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send('Performance.enable');
          await cdp.send('Network.enable');
          await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottling });
          if (profile.network) {
            await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network });
          }
          const sample = await measure(page, cdp, `http://localhost:${port}/${key}/`);
          if (i > 0) {
            samples.push(sample);
          }
          await context.close();
        }
        const medians = Object.fromEntries(
          Object.keys(samples[0]).map((k) => [k, median(samples.map((s) => s[k as keyof RunMetrics]))]),
        );
        entry[profileName] = { medians, samples };
        console.log(`${key} [${profileName}]`, JSON.stringify(medians, (_, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)));
      }
      results[key] = entry;
    }
  }
} finally {
  await browser.close();
  server.close();
}

mkdirSync(resultsDir, { recursive: true });
writeFileSync(`${resultsDir}${label}.json`, JSON.stringify({ label, date: new Date().toISOString(), runs, results }, null, 2));
console.log(`Saved results/${label}.json`);
