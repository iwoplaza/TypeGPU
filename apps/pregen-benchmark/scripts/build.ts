/**
 * Pregenerates WGSL for every `pregen` variant, then builds every variant as
 * a separate Vite app into `dist/<example>/<variant>`.
 *
 * Usage: node scripts/build.ts [example]
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const only = process.argv[2];

execFileSync('node', ['scripts/pregen.ts', ...(only ? [only] : [])], { cwd, stdio: 'inherit' });

for (const example of readdirSync(`${cwd}/examples`)) {
  if (only && example !== only) {
    continue;
  }
  for (const variant of ['runtime', 'pregen']) {
    console.log(`Building ${example}/${variant}...`);
    execFileSync('npx', ['vite', 'build', '--config', 'vite.app.config.ts', '--logLevel', 'warn'], {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, APP: `${example}/${variant}` },
    });
  }
}
