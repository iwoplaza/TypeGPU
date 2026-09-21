import { getFormatInfo } from './formats.ts';
import type { NativeApi } from './native.ts';
import type { ViewInfo } from './registry.ts';
import type { ResourceRole, Snapshot, TextureSummary } from './types.ts';

interface PooledTexture {
  readonly texture: GPUTexture;
  readonly key: string;
}

/**
 * Manages inspector-owned textures that hold copies of app textures, so that
 * intermediate results can be displayed after the frame has moved on.
 */
export class SnapshotPool {
  readonly #native: NativeApi;
  readonly #free = new WeakMap<GPUDevice, Map<string, GPUTexture[]>>();

  constructor(native: NativeApi) {
    this.#native = native;
  }

  /**
   * Checks whether a copy of the given texture subresource can be made, and
   * whether the inspector would be able to display it.
   */
  static canSnapshot(texture: GPUTexture): boolean {
    if (texture.dimension !== '2d') {
      return false;
    }
    if ((texture.usage & GPUTextureUsage.COPY_SRC) === 0) {
      return false;
    }
    const info = getFormatInfo(texture.format);
    if (info.kind === 'unsupported' || info.kind === 'stencil') {
      return false;
    }
    if (texture.sampleCount > 1 && (info.kind === 'uint' || info.kind === 'sint')) {
      return false;
    }
    return true;
  }

  /**
   * Records a copy of the given texture (a single mip level and array layer)
   * into a pooled snapshot texture. Returns undefined if the texture can't be
   * snapshotted.
   */
  capture(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    texture: GPUTexture,
    summary: TextureSummary,
    role: ResourceRole,
    view: ViewInfo | undefined,
  ): Snapshot | undefined {
    if (!SnapshotPool.canSnapshot(texture)) {
      return undefined;
    }

    const mipLevel = view?.descriptor?.baseMipLevel ?? 0;
    const arrayLayer = view?.descriptor?.baseArrayLayer ?? 0;
    if (mipLevel >= texture.mipLevelCount || arrayLayer >= texture.depthOrArrayLayers) {
      return undefined;
    }
    const width = Math.max(1, texture.width >> mipLevel);
    const height = Math.max(1, texture.height >> mipLevel);

    const pooled = this.#acquire(device, texture.format, width, height, texture.sampleCount);

    encoder.copyTextureToTexture(
      { texture, mipLevel, origin: [0, 0, arrayLayer], aspect: 'all' },
      { texture: pooled.texture, mipLevel: 0, origin: [0, 0, 0], aspect: 'all' },
      [width, height, 1],
    );

    return {
      texture: pooled.texture,
      source: summary,
      role,
      width,
      height,
      format: texture.format,
      sampleCount: texture.sampleCount,
      mipLevel,
      arrayLayer,
    };
  }

  /** Returns the snapshot textures to the pool, to be reused by later frames */
  release(device: GPUDevice, snapshots: readonly Snapshot[]): void {
    const pool = this.#poolFor(device);
    for (const snapshot of snapshots) {
      const key = keyOf(snapshot.format, snapshot.width, snapshot.height, snapshot.sampleCount);
      const list = pool.get(key);
      if (list) {
        list.push(snapshot.texture);
      } else {
        pool.set(key, [snapshot.texture]);
      }
    }
  }

  #poolFor(device: GPUDevice): Map<string, GPUTexture[]> {
    let pool = this.#free.get(device);
    if (!pool) {
      pool = new Map();
      this.#free.set(device, pool);
    }
    return pool;
  }

  #acquire(
    device: GPUDevice,
    format: GPUTextureFormat,
    width: number,
    height: number,
    sampleCount: number,
  ): PooledTexture {
    const key = keyOf(format, width, height, sampleCount);
    const pool = this.#poolFor(device);
    const existing = pool.get(key)?.pop();
    if (existing) {
      return { texture: existing, key };
    }

    // Multisampled textures are required to be usable as render attachments.
    const usage =
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.TEXTURE_BINDING |
      (sampleCount > 1 ? GPUTextureUsage.RENDER_ATTACHMENT : 0);
    const texture = this.#native.createTexture.call(device, {
      label: `webgpu-inspector snapshot (${format} ${width}x${height}${
        sampleCount > 1 ? ` ${sampleCount}x` : ''
      })`,
      size: [width, height, 1],
      format,
      sampleCount,
      usage,
    });
    return { texture, key };
  }
}

function keyOf(format: string, width: number, height: number, sampleCount: number): string {
  return `${format}:${width}x${height}:${sampleCount}`;
}
