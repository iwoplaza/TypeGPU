import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { textureStore } from 'typegpu/std';
import { tgpu, d } from 'typegpu';

describe('textureStore', () => {
  it('accepts write-only and read-write storage textures', () => {
    const layout = tgpu.bindGroupLayout({
      writeOnly: { storageTexture: d.textureStorage2d('rgba32float', 'write-only') },
      readWrite: { storageTexture: d.textureStorage2d('rgba32float', 'read-write') },
    });

    const testFn = tgpu.fn([])(() => {
      textureStore(layout.$.writeOnly, d.vec2i(0, 0), d.vec4f(1));
      textureStore(layout.$.readWrite, d.vec2i(0, 0), d.vec4f(1));
    });

    const wgsl = tgpu.resolve([testFn]);
    expect(wgsl).toContain('textureStore(writeOnly, vec2i(), vec4f(1));');
    expect(wgsl).toContain('textureStore(readWrite, vec2i(), vec4f(1));');
  });

  it('accepts storage textures typed with any access mode', () => {
    const storeOnes = (tex: d.textureStorage2d<'rgba8unorm'>, coords: d.v2u) => {
      'use gpu';
      textureStore(tex, coords, d.vec4f(1));
    };

    expect(storeOnes).toBeDefined();
  });

  it('does not accept read-only storage textures', () => {
    const layout = tgpu.bindGroupLayout({
      readOnly: { storageTexture: d.textureStorage2d('rgba32float', 'read-only') },
    });

    const _testFn = tgpu.fn([])(() => {
      // @ts-expect-error: read-only storage textures cannot be stored to
      textureStore(layout.$.readOnly, d.vec2i(0, 0), d.vec4f(1));
    });
  });
});
