import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu } from 'typegpu';

// What a tree-shaken bundle looks like when no function in it carries the logging support
const noRegistry = vi.hoisted(() => () => ({
  registerLogSupport: <T>(support: T) => support,
  getLogSupport: () => undefined,
}));
vi.mock('../../src/tgsl/consoleLog/registry.ts', noRegistry);
// When testing the built package
vi.mock('../../dist/tgsl/consoleLog/registry.js', noRegistry);

describe('console.log in a program without logging support', () => {
  it('falls back to a comment and warns', ({ root }) => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const myPipeline = root.createGuardedComputePipeline(() => {
      'use gpu';
      console.log(1);
    });

    const wgsl = tgpu.resolve([myPipeline.pipeline]);
    expect(wgsl).toContain('/* console.log() */;');
    expect(wgsl).not.toContain('dataBuffer');
    expect(consoleWarnSpy.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "⚠️ [fallback] ",
          "Shader 'console' support is not included in this program. Make sure functions that log are transformed by an up-to-date 'unplugin-typegpu', and that they call 'console' methods directly.",
        ],
      ]
    `);
  });
});
