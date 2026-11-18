import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { rules } from '../src/configs.ts';

const REPO_PREFIX = 'https://github.com/software-mansion/TypeGPU/blob/main/packages/eslint-plugin/';

it('links every rule to its own documentation file', () => {
  for (const [name, rule] of Object.entries(rules)) {
    const url = rule.meta.docs?.url;

    expect(url).toBe(`${REPO_PREFIX}docs/rules/${name}.md`);
    expect(
      fs.existsSync(path.resolve(import.meta.dirname, '..', url!.slice(REPO_PREFIX.length))),
    ).toBe(true);
  }
});
