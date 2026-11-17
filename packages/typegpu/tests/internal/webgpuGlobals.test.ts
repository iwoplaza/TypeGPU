import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';

// Values from https://gpuweb.github.io/gpuweb/
describe('mocked WebGPU globals', () => {
  it('match the flag values defined by the WebGPU spec', () => {
    expect(GPUBufferUsage).toStrictEqual({
      MAP_READ: 0x0001,
      MAP_WRITE: 0x0002,
      COPY_SRC: 0x0004,
      COPY_DST: 0x0008,
      INDEX: 0x0010,
      VERTEX: 0x0020,
      UNIFORM: 0x0040,
      STORAGE: 0x0080,
      INDIRECT: 0x0100,
      QUERY_RESOLVE: 0x0200,
    });

    expect(GPUMapMode).toStrictEqual({
      READ: 0x0001,
      WRITE: 0x0002,
    });

    expect(GPUTextureUsage).toStrictEqual({
      COPY_SRC: 0x01,
      COPY_DST: 0x02,
      TEXTURE_BINDING: 0x04,
      STORAGE_BINDING: 0x08,
      RENDER_ATTACHMENT: 0x10,
      TRANSIENT_ATTACHMENT: 0x20,
    });

    expect(GPUShaderStage).toStrictEqual({
      VERTEX: 0x1,
      FRAGMENT: 0x2,
      COMPUTE: 0x4,
    });
  });
});
