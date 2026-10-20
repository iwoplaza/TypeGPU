import { afterEach, describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';

// The flags are read once, when the package is evaluated, so each test imports a fresh copy
async function importWithFlags(flags: Record<string, boolean>) {
  for (const [flag, value] of Object.entries(flags)) {
    vi.stubGlobal(flag, value);
  }
  vi.resetModules();
  return await import('typegpu');
}

describe('feature opt-out flags', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('keep every feature available when not defined', async ({ device }) => {
    const { tgpu } = await importWithFlags({});
    const root = tgpu.initFromDevice({ device: device as unknown as GPUDevice });

    expect(() => root.createTexture({ size: [1, 1], format: 'rgba8unorm' })).not.toThrow();
    expect(() => root.createSampler({})).not.toThrow();
    expect(() => root.createQuerySet('timestamp', 2)).not.toThrow();
  });

  it('keep every feature available when defined as false', async ({ device }) => {
    const { tgpu } = await importWithFlags({
      __TYPEGPU_NO_TEXTURES__: false,
      __TYPEGPU_NO_QUERY_SETS__: false,
    });
    const root = tgpu.initFromDevice({ device: device as unknown as GPUDevice });

    expect(() => root.createTexture({ size: [1, 1], format: 'rgba8unorm' })).not.toThrow();
    expect(() => root.createQuerySet('timestamp', 2)).not.toThrow();
  });

  it('turn off textures and samplers', async ({ device }) => {
    const { tgpu } = await importWithFlags({ __TYPEGPU_NO_TEXTURES__: true });
    const root = tgpu.initFromDevice({ device: device as unknown as GPUDevice });

    expect(() =>
      root.createTexture({ size: [1, 1], format: 'rgba8unorm' }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Textures are disabled in this build, because '__TYPEGPU_NO_TEXTURES__' was defined as true. Remove it from the bundler's 'define' option to use them.]`,
    );
    expect(() => root.createSampler({})).toThrowErrorMatchingInlineSnapshot(
      `[Error: Samplers are disabled in this build, because '__TYPEGPU_NO_TEXTURES__' was defined as true. Remove it from the bundler's 'define' option to use them.]`,
    );
    expect(() => root.createComparisonSampler({ compare: 'less' })).toThrow();
    // Other resources still work
    expect(() => root.createQuerySet('timestamp', 2)).not.toThrow();
  });

  it('turn off query sets', async ({ device }) => {
    const { tgpu } = await importWithFlags({ __TYPEGPU_NO_QUERY_SETS__: true });
    const root = tgpu.initFromDevice({ device: device as unknown as GPUDevice });

    expect(() => root.createQuerySet('timestamp', 2)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Query sets (also used by performance callbacks) are disabled in this build, because '__TYPEGPU_NO_QUERY_SETS__' was defined as true. Remove it from the bundler's 'define' option to use them.]`,
    );
    expect(() => root.createTexture({ size: [1, 1], format: 'rgba8unorm' })).not.toThrow();
  });

  it('turn off shader console.log', async ({ device }) => {
    const { tgpu, d } = await importWithFlags({ __TYPEGPU_NO_CONSOLE_LOG__: true });
    const root = tgpu.initFromDevice({ device: device as unknown as GPUDevice });

    const vs = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
      return { pos: d.vec4f() };
    });
    const fs = tgpu.fragmentFn({ out: d.vec4f })(() => {
      console.log(d.u32(321));
      return d.vec4f();
    });
    const pipeline = root.createRenderPipeline({
      vertex: vs,
      fragment: fs,
      targets: { format: 'rg8unorm' },
    });

    // Logging compiles to nothing, like it does outside of a root
    const code = tgpu.resolve([pipeline]);
    expect(code).toContain('/* console.log() */');
    expect(code).not.toContain('dataBuffer');
  });
});
