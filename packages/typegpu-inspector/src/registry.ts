import { idOf } from './ids.ts';
import type { BufferSummary, TextureSummary } from './types.ts';

export interface ViewInfo {
  readonly texture: GPUTexture;
  readonly descriptor: GPUTextureViewDescriptor | undefined;
}

export type BindGroupEntryInfo =
  | { readonly binding: number; readonly kind: 'texture'; readonly view: GPUTextureView }
  | {
      readonly binding: number;
      readonly kind: 'buffer';
      readonly buffer: GPUBuffer;
      readonly offset: number;
      readonly size: number | undefined;
    }
  | { readonly binding: number; readonly kind: 'other' };

export interface BindGroupInfo {
  readonly label: string;
  readonly entries: readonly BindGroupEntryInfo[];
}

/**
 * Keeps track of relationships between WebGPU objects that the API itself
 * does not expose (e.g. which texture a view belongs to).
 */
export class ResourceRegistry {
  readonly #views = new WeakMap<GPUTextureView, ViewInfo>();
  readonly #bindGroups = new WeakMap<GPUBindGroup, BindGroupInfo>();
  readonly #canvasTextures = new WeakSet<GPUTexture>();

  registerView(
    view: GPUTextureView,
    texture: GPUTexture,
    descriptor: GPUTextureViewDescriptor | undefined,
  ): void {
    this.#views.set(view, { texture, descriptor });
  }

  getView(view: GPUTextureView): ViewInfo | undefined {
    return this.#views.get(view);
  }

  registerBindGroup(bindGroup: GPUBindGroup, descriptor: GPUBindGroupDescriptor): void {
    const entries: BindGroupEntryInfo[] = [];
    for (const entry of descriptor.entries) {
      const resource = entry.resource as unknown;
      if (isTextureView(resource, this.#views)) {
        entries.push({ binding: entry.binding, kind: 'texture', view: resource });
      } else if (isBufferBinding(resource)) {
        entries.push({
          binding: entry.binding,
          kind: 'buffer',
          buffer: resource.buffer,
          offset: resource.offset ?? 0,
          size: resource.size,
        });
      } else if (isBuffer(resource)) {
        entries.push({
          binding: entry.binding,
          kind: 'buffer',
          buffer: resource,
          offset: 0,
          size: undefined,
        });
      } else {
        entries.push({ binding: entry.binding, kind: 'other' });
      }
    }
    this.#bindGroups.set(bindGroup, { label: descriptor.label ?? '', entries });
  }

  getBindGroup(bindGroup: GPUBindGroup): BindGroupInfo | undefined {
    return this.#bindGroups.get(bindGroup);
  }

  markCanvasTexture(texture: GPUTexture): void {
    this.#canvasTextures.add(texture);
  }

  isCanvasTexture(texture: GPUTexture): boolean {
    return this.#canvasTextures.has(texture);
  }

  summarizeTexture(texture: GPUTexture): TextureSummary {
    const isCanvas = this.#canvasTextures.has(texture);
    const id = idOf(texture);
    return {
      kind: 'texture',
      id,
      label: meaningfulLabel(texture.label) ?? (isCanvas ? 'canvas' : `texture#${id}`),
      format: texture.format,
      width: texture.width,
      height: texture.height,
      depthOrArrayLayers: texture.depthOrArrayLayers,
      mipLevelCount: texture.mipLevelCount,
      sampleCount: texture.sampleCount,
      dimension: texture.dimension,
      usage: texture.usage,
      isCanvas,
    };
  }

  summarizeBuffer(buffer: GPUBuffer): BufferSummary {
    const id = idOf(buffer);
    return {
      kind: 'buffer',
      id,
      label: meaningfulLabel(buffer.label) ?? `buffer#${id}`,
      size: buffer.size,
      usage: buffer.usage,
    };
  }
}

/** Some libraries label unnamed resources with a placeholder, which is not helpful to show */
function meaningfulLabel(label: string): string | undefined {
  return label && label !== '<unnamed>' ? label : undefined;
}

function isTextureView(
  value: unknown,
  views: WeakMap<GPUTextureView, ViewInfo>,
): value is GPUTextureView {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (views.has(value as GPUTextureView)) {
    return true;
  }
  return typeof GPUTextureView !== 'undefined' && value instanceof GPUTextureView;
}

function isBuffer(value: unknown): value is GPUBuffer {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (typeof GPUBuffer !== 'undefined' && value instanceof GPUBuffer) {
    return true;
  }
  const maybe = value as Partial<GPUBuffer>;
  return (
    typeof maybe.size === 'number' &&
    typeof maybe.usage === 'number' &&
    typeof maybe.mapAsync === 'function'
  );
}

function isBufferBinding(value: unknown): value is GPUBufferBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    'buffer' in value &&
    isBuffer((value as GPUBufferBinding).buffer)
  );
}
