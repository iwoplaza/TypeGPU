import { describe, expectTypeOf, it } from 'vitest';
import tgpuDefault, { tgpu } from 'typegpu';
import type * as tgpuNamespace from '../../src/tgpu.ts';

type TgpuNamespace = { [K in keyof typeof tgpuNamespace]: (typeof tgpuNamespace)[K] };

describe('index.d.ts', () => {
  it('declares the same `tgpu` object as the namespace in tgpu.ts', () => {
    expectTypeOf<typeof tgpu>().toEqualTypeOf<TgpuNamespace>();
    expectTypeOf<typeof tgpuDefault>().toEqualTypeOf<TgpuNamespace>();
  });
});
