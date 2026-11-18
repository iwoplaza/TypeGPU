import { $gpuValueOf, $internal, $resolve } from '../../shared/symbols.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import { textureExternal, type WgslExternalTexture } from '../../data/texture.ts';
import { makeDereferenceable } from '../../tgsl/makeDereferenceable.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { Infer } from '../../shared/repr.ts';

// ----------
// Public API
// ----------

export interface TgpuExternalTexture {
  readonly resourceType: 'external-texture';
}

export function isExternalTexture(value: unknown): value is TgpuExternalTexture {
  return (value as TgpuExternalTexture)?.resourceType === 'external-texture';
}

// --------------
// Implementation
// --------------

export class TgpuExternalTextureImpl implements TgpuExternalTexture, SelfResolvable {
  readonly resourceType = 'external-texture';
  readonly [$internal] = true;
  readonly schema: WgslExternalTexture;
  readonly #membership: LayoutMembership;

  constructor(schema: WgslExternalTexture, membership: LayoutMembership) {
    this.schema = schema;
    this.#membership = membership;
    setName(this, membership.key);
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.makeUniqueIdentifier(getName(this), 'global');
    const group = ctx.allocateLayoutEntry(this.#membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this.#membership.idx}) var ${id}: ${
        ctx.resolve(this.schema).value
      };`,
      id,
    );

    return snip(id, textureExternal(), 'handle');
  }

  // prototype properties
  declare readonly [$gpuValueOf]: Infer<WgslExternalTexture>;
  declare readonly $: Infer<WgslExternalTexture>;

  static {
    makeDereferenceable(TgpuExternalTextureImpl.prototype, {
      codegenMode: {
        getBaseSnippet(trackingProxy) {
          return snip(trackingProxy, this.schema, 'handle', false);
        },
      },
      normalMode: {
        get() {
          throw new Error(
            'Direct access to texture views values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
          );
        },
      },
    });
  }

  toString() {
    return `textureExternal:${getName(this) ?? '<unnamed>'}`;
  }
}
