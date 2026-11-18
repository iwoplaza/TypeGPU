import { bitcastF32toU32Impl, bitcastU32toF32Impl, bitcastU32toI32Impl } from './numberOps.ts';
import { vec2f, vec2i, vec2u, vec3f, vec3h, vec3i, vec3u, vec4f, vec4i, vec4u } from './vector.ts';
import type * as wgsl from './wgslTypes.ts';
import type { VecKind } from './wgslTypes.ts';

type vBase = { kind: VecKind };
type v2 = wgsl.v2f | wgsl.v2h | wgsl.v2i | wgsl.v2u;
type v3 = wgsl.v3f | wgsl.v3h | wgsl.v3i | wgsl.v3u;
type v4 = wgsl.v4f | wgsl.v4h | wgsl.v4i | wgsl.v4u;

const lengthVec2 = (v: v2) => Math.sqrt(v.x ** 2 + v.y ** 2);
const lengthVec3 = (v: v3) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
const lengthVec4 = (v: v4) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2 + v.w ** 2);

const dotVec2 = (lhs: v2, rhs: v2) => lhs.x * rhs.x + lhs.y * rhs.y;
const dotVec3 = (lhs: v3, rhs: v3) => lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z;
const dotVec4 = (lhs: v4, rhs: v4) => lhs.x * rhs.x + lhs.y * rhs.y + lhs.z * rhs.z + lhs.w * rhs.w;

/**
 * Functions that cannot be simply generalized via `generalizeFn`
 * have their overloads listed explicitly here.
 */
export const VectorOps = {
  all: {
    'vec2<bool>': (e: wgsl.v2b) => e.x && e.y,
    'vec3<bool>': (e: wgsl.v3b) => e.x && e.y && e.z,
    'vec4<bool>': (e: wgsl.v4b) => e.x && e.y && e.z && e.w,
  } as Record<VecKind, (v: wgsl.AnyBooleanVecInstance) => boolean>,

  length: {
    vec2f: lengthVec2,
    vec2h: lengthVec2,

    vec3f: lengthVec3,
    vec3h: lengthVec3,

    vec4f: lengthVec4,
    vec4h: lengthVec4,
  } as Record<VecKind, (v: vBase) => number>,

  dot: {
    vec2f: dotVec2,
    vec2h: dotVec2,
    vec2i: dotVec2,
    vec2u: dotVec2,
    vec3f: dotVec3,
    vec3h: dotVec3,
    vec3i: dotVec3,
    vec3u: dotVec3,
    vec4f: dotVec4,
    vec4h: dotVec4,
    vec4i: dotVec4,
    vec4u: dotVec4,
  } as Record<VecKind, <T extends vBase>(lhs: T, rhs: T) => number>,

  cross: {
    vec3f: (a: wgsl.v3f, b: wgsl.v3f) => {
      return vec3f(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    },
    vec3h: (a: wgsl.v3h, b: wgsl.v3h) => {
      return vec3h(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    },
  } as Record<'vec3f' | 'vec3h', <T extends wgsl.v3f | wgsl.v3h>(a: T, b: T) => T>,

  bitcastU32toF32: {
    vec2u: (n: wgsl.v2u) => vec2f(bitcastU32toF32Impl(n.x), bitcastU32toF32Impl(n.y)),
    vec3u: (n: wgsl.v3u) =>
      vec3f(bitcastU32toF32Impl(n.x), bitcastU32toF32Impl(n.y), bitcastU32toF32Impl(n.z)),
    vec4u: (n: wgsl.v4u) =>
      vec4f(
        bitcastU32toF32Impl(n.x),
        bitcastU32toF32Impl(n.y),
        bitcastU32toF32Impl(n.z),
        bitcastU32toF32Impl(n.w),
      ),
  } as Record<
    VecKind,
    <T extends wgsl.AnyUnsignedVecInstance>(
      v: T,
    ) => T extends wgsl.v2u ? wgsl.v2f : T extends wgsl.v3u ? wgsl.v3f : wgsl.v4f
  >,

  bitcastU32toI32: {
    vec2u: (n: wgsl.v2u) => vec2i(bitcastU32toI32Impl(n.x), bitcastU32toI32Impl(n.y)),
    vec3u: (n: wgsl.v3u) =>
      vec3i(bitcastU32toI32Impl(n.x), bitcastU32toI32Impl(n.y), bitcastU32toI32Impl(n.z)),
    vec4u: (n: wgsl.v4u) =>
      vec4i(
        bitcastU32toI32Impl(n.x),
        bitcastU32toI32Impl(n.y),
        bitcastU32toI32Impl(n.z),
        bitcastU32toI32Impl(n.w),
      ),
  } as Record<
    VecKind,
    <T extends wgsl.AnyUnsignedVecInstance>(
      v: T,
    ) => T extends wgsl.v2u ? wgsl.v2i : T extends wgsl.v3u ? wgsl.v3i : wgsl.v4i
  >,

  bitcastF32toU32: {
    vec2f: (n: wgsl.v2f) => vec2u(bitcastF32toU32Impl(n.x), bitcastF32toU32Impl(n.y)),
    vec3f: (n: wgsl.v3f) =>
      vec3u(bitcastF32toU32Impl(n.x), bitcastF32toU32Impl(n.y), bitcastF32toU32Impl(n.z)),
    vec4f: (n: wgsl.v4f) =>
      vec4u(
        bitcastF32toU32Impl(n.x),
        bitcastF32toU32Impl(n.y),
        bitcastF32toU32Impl(n.z),
        bitcastF32toU32Impl(n.w),
      ),
  } as Record<
    VecKind,
    <T extends wgsl.AnyFloatVecInstance>(
      v: T,
    ) => T extends wgsl.v2f ? wgsl.v2u : T extends wgsl.v3f ? wgsl.v3u : wgsl.v4u
  >,
};
