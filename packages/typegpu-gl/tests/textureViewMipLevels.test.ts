import { describe, expect, vi } from 'vitest';
import { d, std } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';

function levelParams(gl: WebGL2RenderingContext) {
  return vi
    .mocked(gl.texParameteri)
    .mock.calls.filter(
      ([target, pname]) =>
        target === gl.TEXTURE_2D &&
        (pname === gl.TEXTURE_BASE_LEVEL || pname === gl.TEXTURE_MAX_LEVEL),
    )
    .map(([, pname, value]) => [pname === gl.TEXTURE_BASE_LEVEL ? 'base' : 'max', value]);
}

describe('TgpuRootWebGL - sampled texture view mip levels', () => {
  it('samples from the base mip level of the view', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [4, 4], format: 'rgba8unorm', mipLevelCount: 3 })
      .$usage('sampled');
    const view = texture.createView(d.texture2d(), { baseMipLevel: 1 });
    const sampler = root.createSampler({});

    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
      },
      fragment: ({ uv }) => {
        'use gpu';
        return std.textureSample(view.$, sampler.$, uv);
      },
    });

    vi.mocked(gl.texParameteri).mockClear();
    pipeline.draw(3);

    expect(levelParams(gl)).toEqual([
      ['base', 1],
      ['max', 2],
    ]);
  });

  it('limits the sampled mip levels to the mipLevelCount of the view', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [8, 8], format: 'rgba8unorm', mipLevelCount: 4 })
      .$usage('sampled');
    const view = texture.createView(d.texture2d(), { baseMipLevel: 1, mipLevelCount: 2 });
    const sampler = root.createSampler({});

    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
      },
      fragment: ({ uv }) => {
        'use gpu';
        return std.textureSample(view.$, sampler.$, uv);
      },
    });

    vi.mocked(gl.texParameteri).mockClear();
    pipeline.draw(3);

    expect(levelParams(gl)).toEqual([
      ['base', 1],
      ['max', 2],
    ]);
  });

  it('applies the levels of whichever view is used by each draw', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [4, 4], format: 'rgba8unorm', mipLevelCount: 3 })
      .$usage('sampled');
    const fullView = texture.createView(d.texture2d());
    const smallView = texture.createView(d.texture2d(), { baseMipLevel: 2 });
    const sampler = root.createSampler({});

    const pipelineFor = (view: typeof fullView) =>
      root.createRenderPipeline({
        vertex: () => {
          'use gpu';
          return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
        },
        fragment: ({ uv }) => {
          'use gpu';
          return std.textureSample(view.$, sampler.$, uv);
        },
      });

    const smallPipeline = pipelineFor(smallView);
    const fullPipeline = pipelineFor(fullView);

    vi.mocked(gl.texParameteri).mockClear();
    smallPipeline.draw(3);
    fullPipeline.draw(3);

    expect(levelParams(gl)).toEqual([
      ['base', 2],
      ['max', 2],
      ['base', 0],
      ['max', 2],
    ]);
  });

  it('generates mipmaps from level 0 after sampling a view with a higher base level', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [4, 4], format: 'rgba8unorm', mipLevelCount: 3 })
      .$usage('sampled', 'render');
    const view = texture.createView(d.texture2d(), { baseMipLevel: 1 });
    const sampler = root.createSampler({});

    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
      },
      fragment: ({ uv }) => {
        'use gpu';
        return std.textureSample(view.$, sampler.$, uv);
      },
    });

    pipeline.draw(3);
    vi.mocked(gl.texParameteri).mockClear();
    texture.generateMipmaps();

    expect(levelParams(gl)).toEqual([
      ['base', 0],
      ['max', 2],
    ]);
    expect(vi.mocked(gl.texParameteri).mock.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(gl.generateMipmap).mock.invocationCallOrder.at(-1) ?? 0,
    );
  });

  it('throws when one draw samples two different mip ranges of the same texture', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [4, 4], format: 'rgba8unorm', mipLevelCount: 3 })
      .$usage('sampled')
      .$name('texture');
    const fullView = texture.createView(d.texture2d()).$name('fullView');
    const smallView = texture.createView(d.texture2d(), { baseMipLevel: 1 }).$name('smallView');
    const sampler = root.createSampler({});

    expect(() =>
      root.createRenderPipeline({
        vertex: () => {
          'use gpu';
          return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
        },
        fragment: ({ uv }) => {
          'use gpu';
          return (
            std.textureSample(fullView.$, sampler.$, uv) +
            std.textureSample(smallView.$, sampler.$, uv)
          );
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: WebGL fallback does not support sampling different mip level ranges of the same texture in one pipeline ('fullView' and 'smallView').]`,
    );
  });
});

describe('TgpuRootWebGL - texel fetches through a view with a base mip level', () => {
  it('passes view-relative levels to texelFetch and textureSize, and sets the base level for the draw', ({
    gl,
  }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [8, 8], format: 'rgba8unorm', mipLevelCount: 4 })
      .$usage('sampled');
    const view = texture.createView(d.texture2d(), { baseMipLevel: 2 }).$name('view');

    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1) };
      },
      fragment: () => {
        'use gpu';
        const size = std.textureDimensions(view.$, 1);
        return std.textureLoad(view.$, d.vec2u(size.x - 1, 0), 1);
      },
    });

    vi.mocked(gl.texParameteri).mockClear();
    pipeline.draw(3);

    // GLES 3.0 adds `lod` to `TEXTURE_BASE_LEVEL` for both texelFetch (2.12.9.2) and
    // textureSize (2.12.9.3), so with the base level set to the view's, level 1 of the
    // view is level 3 of the texture, like in WGSL.
    const fragmentSource = vi.mocked(gl.shaderSource).mock.calls.at(-1)?.[1];
    expect(fragmentSource).toContain('textureSize(view, 1)');
    expect(fragmentSource).toMatch(/texelFetch\(view, .*, 1\)/);
    expect(levelParams(gl)).toEqual([
      ['base', 2],
      ['max', 3],
    ]);
  });
});

describe('TgpuRootWebGL - texture view mip level validation', () => {
  it.for([
    [{ baseMipLevel: 3 }, 'Base mip level 3 is out of range. Texture has 3 mip levels.'],
    [{ baseMipLevel: -1 }, 'Base mip level -1 is out of range. Texture has 3 mip levels.'],
    [
      { baseMipLevel: 1, mipLevelCount: 3 },
      'Mip level count 3 is out of range for base mip level 1. Texture has 3 mip levels.',
    ],
    [
      { mipLevelCount: 0 },
      'Mip level count 0 is out of range for base mip level 0. Texture has 3 mip levels.',
    ],
  ] as const)('throws for %o', ([descriptor, message], { gl }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [4, 4], format: 'rgba8unorm', mipLevelCount: 3 })
      .$usage('sampled', 'render');

    expect(() => texture.createView(d.texture2d(), descriptor)).toThrow(message);
  });

  it('throws for a render view with an out of range base mip level', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root.createTexture({ size: [4, 4], format: 'rgba8unorm' }).$usage('render');

    expect(() => texture.createView('render', { baseMipLevel: 1 })).toThrow(
      'Base mip level 1 is out of range. Texture has 1 mip levels.',
    );
  });

  it('accepts the last mip level', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root
      .createTexture({ size: [4, 4], format: 'rgba8unorm', mipLevelCount: 3 })
      .$usage('sampled');

    expect(() =>
      texture.createView(d.texture2d(), { baseMipLevel: 2, mipLevelCount: 1 }),
    ).not.toThrow();
  });
});
