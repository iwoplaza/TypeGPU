import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const cliPath = path.resolve(import.meta.dirname, '../tgpu-gen.mjs');

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tgpu-gen-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('tgpu-gen cli', () => {
  it.each(['proj#1', '100%', 'q?x'])(
    'generates code in a working directory named %s',
    (dirName) => {
      const cwd = path.join(tmp, dirName);
      fs.mkdirSync(cwd);
      fs.writeFileSync(path.join(cwd, 'shader.wgsl'), 'struct Foo { a: u32 };');

      execFileSync(process.execPath, [cliPath, 'shader.wgsl'], { cwd, stdio: 'pipe' });

      expect(fs.readFileSync(path.join(cwd, 'shader.ts'), 'utf8')).toContain(
        'export const Foo = d.struct({',
      );
    },
  );

  it('generates code from a file with special characters in its name', () => {
    fs.writeFileSync(path.join(tmp, 'a#b%c.wgsl'), 'struct Foo { a: u32 };');

    execFileSync(process.execPath, [cliPath, 'a#b%c.wgsl'], { cwd: tmp, stdio: 'pipe' });

    expect(fs.readFileSync(path.join(tmp, 'a#b%c.ts'), 'utf8')).toContain(
      'export const Foo = d.struct({',
    );
  });
});
