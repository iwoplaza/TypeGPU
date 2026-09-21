export type SampleKind =
  | 'float'
  | 'unfilterable-float'
  | 'uint'
  | 'sint'
  | 'depth'
  | 'stencil'
  | 'unsupported';

export interface FormatInfo {
  /** How the format can be read from a shader */
  readonly kind: SampleKind;
  /** Number of meaningful color channels (1-4) */
  readonly channels: number;
  readonly hasDepth: boolean;
  readonly hasStencil: boolean;
  /** Approximate bytes per texel (0 for compressed and depth formats with unknown size) */
  readonly bytesPerTexel: number;
}

const COMPRESSED_PREFIXES = ['bc', 'etc2', 'eac', 'astc'];

function channelsOf(format: string): number {
  if (format.startsWith('rgba') || format.startsWith('bgra') || format.startsWith('rgb10a2')) {
    return 4;
  }
  if (format.startsWith('rg11b10') || format.startsWith('rgb9e5')) {
    return 3;
  }
  if (format.startsWith('rg')) {
    return 2;
  }
  if (format.startsWith('r')) {
    return 1;
  }
  return 4;
}

function bytesPerTexelOf(format: string, channels: number): number {
  if (format.startsWith('rgb10a2') || format.startsWith('rg11b10') || format.startsWith('rgb9e5')) {
    return 4;
  }
  const match = /(8|16|32)(unorm|snorm|uint|sint|float)/.exec(format);
  if (!match) {
    return 0;
  }
  return (Number(match[1]) / 8) * channels;
}

/**
 * Describes how a texture of the given format can be displayed by the inspector.
 */
export function getFormatInfo(format: GPUTextureFormat): FormatInfo {
  const f = format as string;

  if (f === 'stencil8') {
    return { kind: 'stencil', channels: 1, hasDepth: false, hasStencil: true, bytesPerTexel: 1 };
  }

  if (f.startsWith('depth')) {
    const hasStencil = f.includes('stencil');
    const bytesPerTexel = f.startsWith('depth16') ? 2 : f.startsWith('depth32') ? 4 : 4;
    return {
      kind: 'depth',
      channels: 1,
      hasDepth: true,
      hasStencil,
      bytesPerTexel: bytesPerTexel + (hasStencil ? 1 : 0),
    };
  }

  if (COMPRESSED_PREFIXES.some((prefix) => f.startsWith(prefix))) {
    return { kind: 'float', channels: 4, hasDepth: false, hasStencil: false, bytesPerTexel: 0 };
  }

  const channels = channelsOf(f);
  const bytesPerTexel = bytesPerTexelOf(f, channels);

  if (f.endsWith('uint')) {
    return { kind: 'uint', channels, hasDepth: false, hasStencil: false, bytesPerTexel };
  }
  if (f.endsWith('sint')) {
    return { kind: 'sint', channels, hasDepth: false, hasStencil: false, bytesPerTexel };
  }
  if (f.includes('32float')) {
    // 32-bit float formats are not filterable without the 'float32-filterable' feature
    return {
      kind: 'unfilterable-float',
      channels,
      hasDepth: false,
      hasStencil: false,
      bytesPerTexel,
    };
  }
  if (
    f.includes('unorm') ||
    f.includes('snorm') ||
    f.includes('float') ||
    f.startsWith('rgb10a2') ||
    f.startsWith('rg11b10') ||
    f.startsWith('rgb9e5')
  ) {
    return { kind: 'float', channels, hasDepth: false, hasStencil: false, bytesPerTexel };
  }

  return { kind: 'unsupported', channels, hasDepth: false, hasStencil: false, bytesPerTexel };
}
