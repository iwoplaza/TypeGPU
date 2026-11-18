import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

const CLI = path.resolve(import.meta.dirname, '../tgpu-gen.mjs');
const SHADER = 'struct Particle { position: vec3f, }\n';

let cwd: string;

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tgpu-gen-'));
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

function writeShaders(files: string[]) {
  for (const file of files) {
    fs.mkdirSync(path.join(cwd, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(cwd, file), SHADER);
  }
}

function run(...args: string[]) {
  execFileSync(process.execPath, [CLI, ...args], { cwd, stdio: 'pipe' });
}

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(path.join(cwd, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(cwd, path.join(entry.parentPath, entry.name)))
    .toSorted();
}

it('keeps the directories matched by ** after a leading *', () => {
  writeShaders(['src/a/b/x.wgsl', 'lib/a/b/y.wgsl']);

  run('*/**/*.wgsl', '-o', 'generated/**/*.ts');

  expect(listFiles('generated')).toStrictEqual(['generated/a/b/x.ts', 'generated/a/b/y.ts']);
});

it('keeps the directory structure for an input pattern starting with ./', () => {
  writeShaders(['src/a/x.wgsl', 'src/b/c/y.wgsl']);

  run('./src/**/*.wgsl', '-o', 'generated/**/*.ts');

  expect(listFiles('generated')).toStrictEqual(['generated/a/x.ts', 'generated/b/c/y.ts']);
});
