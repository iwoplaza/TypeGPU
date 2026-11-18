import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/create.ts';
import { prepareDirectory } from '../src/utils/files.ts';
import { isValidProjectPath } from '../src/utils/inputs.ts';

vi.mock('../src/steps/skills.ts', () => ({
  addAgentSkills: vi.fn(),
  askForAgentSkills: vi.fn(),
}));

// `__WORKSPACE_PACKAGE_VERSIONS__` is empty in tests, the template dependencies don't matter here
vi.mock('../src/utils/pkg.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils/pkg.ts')>()),
  resolveWorkspaceVersions: () => [],
}));

let tmp: string;
let cwd: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typegpu-cli-'));
  cwd = path.join(tmp, 'cwd');
  fs.mkdirSync(cwd);
});

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
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
  it.each(['my app', 'my<app', 'parent/my app'])(
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

  it.each([
    ['my-app/', 'my-app'],
    ['Parent Dir/my-app', 'my-app'],
  ])('scaffolds into %s', async (projectDir, packageName) => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await createProject(cwd, {
      projectDir,
      nonInteractive: true,
      addons: [],
      packageManager: 'npm',
    });

    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, projectDir, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe(packageName);
  });

  it('scaffolds into an absolute path with a space in a parent directory', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const target = path.join(tmp, 'John Doe', 'my-app');

    await createProject(cwd, {
      projectDir: target,
      nonInteractive: true,
      addons: [],
      packageManager: 'npm',
    });

    const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf-8'));
    expect(pkg.name).toBe('my-app');
    expect(fs.readdirSync(cwd)).toStrictEqual([]);
  });
});

describe('isValidProjectPath', () => {
  it.each(['my-app', 'my-app/', 'sub/my-app', '/Users/John Doe/my-app', '../my-app'])(
    'accepts %s',
    (projectDir) => {
      expect(isValidProjectPath('/work', projectDir)).toBe(true);
    },
  );

  it.each(['sub\\my-app', 'C:\\Users\\John Doe\\my-app', 'my-app\\'])(
    'accepts %s on Windows',
    (projectDir) => {
      expect(isValidProjectPath('C:\\work', projectDir, path.win32)).toBe(true);
    },
  );

  it.each(['my app', 'sub/my app', 'my<app', 'my:app', '/'])('rejects %s', (projectDir) => {
    expect(isValidProjectPath('/work', projectDir)).toBe(false);
  });
});
