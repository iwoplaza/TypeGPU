/**
 * Renders results/*.json into a self-contained HTML report.
 *
 * Usage: node scripts/report.ts <out.html> [baselineLabel=baseline] [optimizedLabel=optimized]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [out, baselineLabel = 'baseline', optimizedLabel = 'optimized'] = process.argv.slice(2);
if (!out) {
  throw new Error('Usage: node scripts/report.ts <out.html>');
}
const read = (label: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../results/${label}.json`, import.meta.url)), 'utf8'),
  );

const baseline = read(baselineLabel);
const optimized = read(optimizedLabel);

// Only medians and sizes make it into the page
const slim = (results: Record<string, Record<string, unknown>>) =>
  Object.fromEntries(
    Object.entries(results).map(([key, entry]) => [
      key,
      Object.fromEntries(
        Object.entries(entry).map(([k, v]) =>
          k === 'sizes' ? [k, v] : [k, (v as { medians: unknown }).medians],
        ),
      ),
    ]),
  );

const data = {
  runs: baseline.runs,
  date: baseline.date,
  baseline: slim(baseline.results),
  optimized: slim(optimized.results),
};

const template = readFileSync(
  fileURLToPath(new URL('../report/template.html', import.meta.url)),
  'utf8',
);
writeFileSync(
  out,
  template.replace(/\/\*__DATA__\*\/\s*null/, () => JSON.stringify(data)),
);
console.log(`Wrote ${out}`);
