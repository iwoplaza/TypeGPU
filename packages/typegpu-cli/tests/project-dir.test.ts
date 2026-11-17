import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/create.ts';
import { prepareDirectory } from '../src/utils/files.ts';

let tmp: string;
let cwd: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typegpu-cli-'));
  cwd = path.join(tmp, 'cwd');
  fs.mkdirSync(cwd);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('prepareDirectory', () => {
  it('creates a relative project directory inside cwd', async () => {
    const dir = await prepareDirectory(cwd, 'my-app', { interactive: false });

    expect(dir).toBe(path.join(cwd, 'my-app'));
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('creates an absolute project directory as is', async () => {
    const target = path.join(tmp, 'elsewhere', 'my-app');
    const dir = await prepareDirectory(cwd, target, { interactive: false });

    expect(dir).toBe(target);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readdirSync(cwd)).toStrictEqual([]);
  });
});

describe('createProject', () => {
  it.each(['my app', 'my-app/', 'my<app'])(
    'rejects an invalid project directory (%s)',
    async (projectDir) => {
      vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`process.exit(${code})`);
      });
      const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await expect(
        createProject(cwd, { projectDir, nonInteractive: true, addons: [] }),
      ).rejects.toThrow('process.exit(1)');
      expect(write.mock.calls.join('')).toContain(`Invalid project directory: ${projectDir}`);
      expect(fs.readdirSync(cwd)).toStrictEqual([]);
    },
  );
});
