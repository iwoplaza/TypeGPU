import { describe, expect, expectTypeOf, it } from 'vitest';
import { d } from 'typegpu';
import {
  isGPUCommandEncoder,
  isGPUComputePassEncoder,
  isGPURenderBundleEncoder,
  isGPURenderPassEncoder,
} from '../../src/core/pipeline/typeGuards.ts';
import { isVec2, isVec3, isVec4 } from '../../src/data/wgslTypes.ts';

// JSI HostObjects expose native methods through property lookup, but their `has` trap reports false
function jsiLike(methods: Record<string, () => void>): object {
  return new Proxy(
    {},
    {
      get: (_target, key) => methods[String(key)],
      has: () => false,
    },
  );
}

describe('pipeline WebGPU type guards', () => {
  it('recognizes a JSI-like command encoder without relying on `in`', () => {
    const encoder = jsiLike({ beginRenderPass() {}, beginComputePass() {} });

    expect(isGPUCommandEncoder(encoder)).toBe(true);
    expect(isGPUComputePassEncoder(encoder)).toBe(false);
  });

  it('recognizes JSI-like compute and render pass encoders', () => {
    const computePass = jsiLike({ dispatchWorkgroups() {} });
    const renderPass = jsiLike({ executeBundles() {}, draw() {} });

    expect(isGPUComputePassEncoder(computePass)).toBe(true);
    expect(isGPURenderPassEncoder(renderPass)).toBe(true);
  });

  it('keeps a JSI-like render bundle distinct from a render pass', () => {
    const bundle = jsiLike({ draw() {}, finish() {} });

    expect(isGPURenderBundleEncoder(bundle)).toBe(true);
    expect(isGPURenderPassEncoder(bundle)).toBe(false);
  });
});

describe('vector schema type guards', () => {
  it('accept bool vectors', () => {
    expect(isVec2(d.vec2b)).toBe(true);
    expect(isVec3(d.vec3b)).toBe(true);
    expect(isVec4(d.vec4b)).toBe(true);
  });

  it('narrow to a union that includes bool vectors', () => {
    const schema = d.vec2b as d.AnyWgslData;

    if (isVec2(schema)) {
      expectTypeOf(schema).toEqualTypeOf<d.Vec2f | d.Vec2h | d.Vec2i | d.Vec2u | d.Vec2b>();
      expectTypeOf(schema.primitive).toEqualTypeOf<d.F32 | d.F16 | d.I32 | d.U32 | d.Bool>();
      expect(schema.primitive.type).toBe('bool');
    }
    if (isVec3(schema)) {
      expectTypeOf(schema).toEqualTypeOf<d.Vec3f | d.Vec3h | d.Vec3i | d.Vec3u | d.Vec3b>();
    }
    if (isVec4(schema)) {
      expectTypeOf(schema).toEqualTypeOf<d.Vec4f | d.Vec4h | d.Vec4i | d.Vec4u | d.Vec4b>();
    }
  });
});
