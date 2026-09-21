import { describe, expect, it } from 'vitest';
import { getFormatInfo } from '../src/formats.ts';

describe('getFormatInfo', () => {
  it('classifies color formats', () => {
    expect(getFormatInfo('rgba8unorm')).toMatchObject({
      kind: 'float',
      channels: 4,
      bytesPerTexel: 4,
    });
    expect(getFormatInfo('bgra8unorm-srgb')).toMatchObject({ kind: 'float', channels: 4 });
    expect(getFormatInfo('r8unorm')).toMatchObject({
      kind: 'float',
      channels: 1,
      bytesPerTexel: 1,
    });
    expect(getFormatInfo('rg16float')).toMatchObject({
      kind: 'float',
      channels: 2,
      bytesPerTexel: 4,
    });
    expect(getFormatInfo('rgba16float')).toMatchObject({
      kind: 'float',
      channels: 4,
      bytesPerTexel: 8,
    });
    expect(getFormatInfo('rgb10a2unorm')).toMatchObject({
      kind: 'float',
      channels: 4,
      bytesPerTexel: 4,
    });
    expect(getFormatInfo('rg11b10ufloat')).toMatchObject({ kind: 'float', channels: 3 });
  });

  it('marks 32-bit float formats as unfilterable', () => {
    expect(getFormatInfo('r32float')).toMatchObject({ kind: 'unfilterable-float', channels: 1 });
    expect(getFormatInfo('rgba32float')).toMatchObject({
      kind: 'unfilterable-float',
      channels: 4,
      bytesPerTexel: 16,
    });
  });

  it('classifies integer formats', () => {
    expect(getFormatInfo('r32uint')).toMatchObject({ kind: 'uint', channels: 1 });
    expect(getFormatInfo('rgba8sint')).toMatchObject({ kind: 'sint', channels: 4 });
    expect(getFormatInfo('rgb10a2uint')).toMatchObject({ kind: 'uint', channels: 4 });
  });

  it('classifies depth and stencil formats', () => {
    expect(getFormatInfo('depth24plus')).toMatchObject({
      kind: 'depth',
      hasDepth: true,
      hasStencil: false,
    });
    expect(getFormatInfo('depth24plus-stencil8')).toMatchObject({
      kind: 'depth',
      hasDepth: true,
      hasStencil: true,
    });
    expect(getFormatInfo('depth32float')).toMatchObject({ kind: 'depth', bytesPerTexel: 4 });
    expect(getFormatInfo('stencil8')).toMatchObject({ kind: 'stencil', hasStencil: true });
  });

  it('treats compressed formats as displayable float textures', () => {
    expect(getFormatInfo('bc7-rgba-unorm')).toMatchObject({ kind: 'float', channels: 4 });
    expect(getFormatInfo('astc-4x4-unorm')).toMatchObject({ kind: 'float', channels: 4 });
  });
});
