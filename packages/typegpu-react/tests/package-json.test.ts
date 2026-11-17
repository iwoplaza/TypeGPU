import { matchesGlob } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../package.json' with { type: 'json' };

function hasSideEffects(path: string): boolean {
  const { sideEffects } = packageJson as { sideEffects: boolean | string[] };
  if (typeof sideEffects === 'boolean') {
    return sideEffects;
  }
  const relative = path.replace(/^\.\//, '');
  return sideEffects.some((pattern) => matchesGlob(relative, pattern.replace(/^\.\//, '')));
}

// Mirrors how `tgpu-dev-cli prepack` rewrites paths for the published package.json
function toPublishedPath(path: string): string {
  return path.replace(/^\.\/dist/, '.');
}

describe('package.json', () => {
  it('marks the React Native entry as having side effects', () => {
    const sourceEntry = packageJson.exports['.']['react-native'];
    const publishedEntry = toPublishedPath(packageJson.publishConfig.exports['.']['react-native']);

    expect(hasSideEffects(sourceEntry)).toBe(true);
    expect(hasSideEffects(publishedEntry)).toBe(true);
  });

  it('keeps the browser entry free of side effects', () => {
    const sourceEntry = packageJson.exports['.'].browser;
    const publishedEntry = toPublishedPath(packageJson.publishConfig.exports['.'].browser);

    expect(hasSideEffects(sourceEntry)).toBe(false);
    expect(hasSideEffects(publishedEntry)).toBe(false);
  });
});
