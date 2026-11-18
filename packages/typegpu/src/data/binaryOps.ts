import { WgslTypeError } from '../errors.ts';
import {
  assertEqualKinds,
  assertKind,
  generalizeFn,
  kindOf,
  numericKind,
  numericOrMatrixKind,
  upCast,
} from './generalizeFn.ts';
import { u32 } from './numeric.ts';
import {
  type AnyIntegerVecInstance,
  type AnyMatInstance,
  type AnyNumericVecInstance,
  type AnyVecInstance,
  type m2x2f,
  type m3x3f,
  type m4x4f,
  type mBaseForVec,
  type v2f,
  type v2i,
  type v2u,
  type v3f,
  type v3i,
  type v3u,
  type v4f,
  type v4i,
  type v4u,
  type vBaseForMat,
  type vecIToVecU,
  isFloat32VecInstance,
  isInteger32VecInstance,
  isMatInstance,
  isUint32VecInstance,
  isVecInstance,
  WORKAROUND_getSchema,
} from './wgslTypes.ts';

// CPU implementations of the binary operators, shared by `std` and by the infix
// methods of vectors and matrices. Results are constructed through the schemas of
// the operands, so that this module does not depend on `vector.ts` or `matrix.ts`.

type NumVec = AnyNumericVecInstance;
type Mat = AnyMatInstance;
type MatKind = 'mat2x2f' | 'mat3x3f' | 'mat4x4f';

function constructorOf<T extends AnyVecInstance | Mat>(value: T): (...components: number[]) => T {
  return WORKAROUND_getSchema(value) as unknown as (...components: number[]) => T;
}

const mulMxM = {
  mat2x2f: (a: m2x2f, b: m2x2f) => {
    const a_ = a.columns;
    const b_ = b.columns;

    return constructorOf(a)(
      a_[0].x * b_[0].x + a_[1].x * b_[0].y,
      a_[0].y * b_[0].x + a_[1].y * b_[0].y,
      a_[0].x * b_[1].x + a_[1].x * b_[1].y,
      a_[0].y * b_[1].x + a_[1].y * b_[1].y,
    );
  },

  mat3x3f: (a: m3x3f, b: m3x3f) => {
    const a_ = a.columns;
    const b_ = b.columns;

    return constructorOf(a)(
      a_[0].x * b_[0].x + a_[1].x * b_[0].y + a_[2].x * b_[0].z,
      a_[0].y * b_[0].x + a_[1].y * b_[0].y + a_[2].y * b_[0].z,
      a_[0].z * b_[0].x + a_[1].z * b_[0].y + a_[2].z * b_[0].z,
      a_[0].x * b_[1].x + a_[1].x * b_[1].y + a_[2].x * b_[1].z,
      a_[0].y * b_[1].x + a_[1].y * b_[1].y + a_[2].y * b_[1].z,
      a_[0].z * b_[1].x + a_[1].z * b_[1].y + a_[2].z * b_[1].z,
      a_[0].x * b_[2].x + a_[1].x * b_[2].y + a_[2].x * b_[2].z,
      a_[0].y * b_[2].x + a_[1].y * b_[2].y + a_[2].y * b_[2].z,
      a_[0].z * b_[2].x + a_[1].z * b_[2].y + a_[2].z * b_[2].z,
    );
  },

  mat4x4f: (a: m4x4f, b: m4x4f) => {
    const a_ = a.columns;
    const b_ = b.columns;

    return constructorOf(a)(
      a_[0].x * b_[0].x + a_[1].x * b_[0].y + a_[2].x * b_[0].z + a_[3].x * b_[0].w,
      a_[0].y * b_[0].x + a_[1].y * b_[0].y + a_[2].y * b_[0].z + a_[3].y * b_[0].w,
      a_[0].z * b_[0].x + a_[1].z * b_[0].y + a_[2].z * b_[0].z + a_[3].z * b_[0].w,
      a_[0].w * b_[0].x + a_[1].w * b_[0].y + a_[2].w * b_[0].z + a_[3].w * b_[0].w,
      a_[0].x * b_[1].x + a_[1].x * b_[1].y + a_[2].x * b_[1].z + a_[3].x * b_[1].w,
      a_[0].y * b_[1].x + a_[1].y * b_[1].y + a_[2].y * b_[1].z + a_[3].y * b_[1].w,
      a_[0].z * b_[1].x + a_[1].z * b_[1].y + a_[2].z * b_[1].z + a_[3].z * b_[1].w,
      a_[0].w * b_[1].x + a_[1].w * b_[1].y + a_[2].w * b_[1].z + a_[3].w * b_[1].w,
      a_[0].x * b_[2].x + a_[1].x * b_[2].y + a_[2].x * b_[2].z + a_[3].x * b_[2].w,
      a_[0].y * b_[2].x + a_[1].y * b_[2].y + a_[2].y * b_[2].z + a_[3].y * b_[2].w,
      a_[0].z * b_[2].x + a_[1].z * b_[2].y + a_[2].z * b_[2].z + a_[3].z * b_[2].w,
      a_[0].w * b_[2].x + a_[1].w * b_[2].y + a_[2].w * b_[2].z + a_[3].w * b_[2].w,
      a_[0].x * b_[3].x + a_[1].x * b_[3].y + a_[2].x * b_[3].z + a_[3].x * b_[3].w,
      a_[0].y * b_[3].x + a_[1].y * b_[3].y + a_[2].y * b_[3].z + a_[3].y * b_[3].w,
      a_[0].z * b_[3].x + a_[1].z * b_[3].y + a_[2].z * b_[3].z + a_[3].z * b_[3].w,
      a_[0].w * b_[3].x + a_[1].w * b_[3].y + a_[2].w * b_[3].z + a_[3].w * b_[3].w,
    );
  },
} as Record<MatKind, <T extends Mat>(a: T, b: T) => T>;

const mulMxV = {
  mat2x2f: (m: m2x2f, v: v2f) => {
    const m_ = m.columns;
    return constructorOf(v)(m_[0].x * v.x + m_[1].x * v.y, m_[0].y * v.x + m_[1].y * v.y);
  },

  mat3x3f: (m: m3x3f, v: v3f) => {
    const m_ = m.columns;
    return constructorOf(v)(
      m_[0].x * v.x + m_[1].x * v.y + m_[2].x * v.z,
      m_[0].y * v.x + m_[1].y * v.y + m_[2].y * v.z,
      m_[0].z * v.x + m_[1].z * v.y + m_[2].z * v.z,
    );
  },

  mat4x4f: (m: m4x4f, v: v4f) => {
    const m_ = m.columns;
    return constructorOf(v)(
      m_[0].x * v.x + m_[1].x * v.y + m_[2].x * v.z + m_[3].x * v.w,
      m_[0].y * v.x + m_[1].y * v.y + m_[2].y * v.z + m_[3].y * v.w,
      m_[0].z * v.x + m_[1].z * v.y + m_[2].z * v.z + m_[3].z * v.w,
      m_[0].w * v.x + m_[1].w * v.y + m_[2].w * v.z + m_[3].w * v.w,
    );
  },
} as Record<MatKind, <V extends NumVec>(m: Mat, v: V) => V>;

const mulVxM = {
  mat2x2f: (v: v2f, m: m2x2f) => {
    const m_ = m.columns;
    return constructorOf(v)(v.x * m_[0].x + v.y * m_[0].y, v.x * m_[1].x + v.y * m_[1].y);
  },

  mat3x3f: (v: v3f, m: m3x3f) => {
    const m_ = m.columns;
    return constructorOf(v)(
      v.x * m_[0].x + v.y * m_[0].y + v.z * m_[0].z,
      v.x * m_[1].x + v.y * m_[1].y + v.z * m_[1].z,
      v.x * m_[2].x + v.y * m_[2].y + v.z * m_[2].z,
    );
  },

  mat4x4f: (v: v4f, m: m4x4f) => {
    const m_ = m.columns;
    return constructorOf(v)(
      v.x * m_[0].x + v.y * m_[0].y + v.z * m_[0].z + v.w * m_[0].w,
      v.x * m_[1].x + v.y * m_[1].y + v.z * m_[1].z + v.w * m_[1].w,
      v.x * m_[2].x + v.y * m_[2].y + v.z * m_[2].z + v.w * m_[2].w,
      v.x * m_[3].x + v.y * m_[3].y + v.z * m_[3].z + v.w * m_[3].w,
    );
  },
} as Record<MatKind, <V extends NumVec>(v: V, m: Mat) => V>;

export function cpuAdd(lhs: number, rhs: number): number; // default addition
export function cpuAdd<T extends NumVec>(lhs: number, rhs: T): T; // mixed addition
export function cpuAdd<T extends NumVec>(lhs: T, rhs: number): T; // mixed addition
export function cpuAdd<T extends NumVec | Mat>(lhs: T, rhs: T): T; // component-wise addition
export function cpuAdd<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends Lhs extends number
    ? number | NumVec
    : Lhs extends NumVec
      ? number | Lhs
      : Lhs extends Mat
        ? Lhs
        : never,
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
export function cpuAdd(
  lhs: number | NumVec | Mat,
  rhs: number | NumVec | Mat,
): number | NumVec | Mat {
  assertKind([lhs, rhs], numericOrMatrixKind);
  if (isMatInstance(lhs) !== isMatInstance(rhs)) {
    throw new WgslTypeError('There is no matrix/non-matrix addition or subtraction in WGSL.');
  }
  if ((typeof lhs === 'number') === (typeof rhs === 'number')) {
    // If exactly one is a number, then it's fine, since we already know the other one is not a matrix.
    assertEqualKinds(lhs, rhs);
  }
  return generalizeFn((a, b) => a + b, upCast([lhs, rhs]));
}

export function cpuSub(lhs: number, rhs: number): number; // default subtraction
export function cpuSub<T extends NumVec>(lhs: number, rhs: T): T; // mixed subtraction
export function cpuSub<T extends NumVec>(lhs: T, rhs: number): T; // mixed subtraction
export function cpuSub<T extends NumVec | Mat>(lhs: T, rhs: T): T; // component-wise subtraction
export function cpuSub<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends Lhs extends number
    ? number | NumVec
    : Lhs extends NumVec
      ? number | Lhs
      : Lhs extends Mat
        ? Lhs
        : never,
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
export function cpuSub(lhs: number | NumVec | Mat, rhs: number | NumVec | Mat) {
  // while illegal on the wgsl side, we can do this in js
  return cpuAdd(lhs, cpuMul(-1, rhs));
}

export function cpuMul(lhs: number, rhs: number): number; // default multiplication
export function cpuMul<MV extends NumVec | Mat>(lhs: number, rhs: MV): MV; // scale
export function cpuMul<MV extends NumVec | Mat>(lhs: MV, rhs: number): MV; // scale
export function cpuMul<V extends NumVec>(lhs: V, rhs: V): V; // component-wise multiplication
export function cpuMul<M extends Mat, V extends vBaseForMat<M>>(lhs: V, rhs: M): V; // row-vector-matrix
export function cpuMul<M extends Mat, V extends vBaseForMat<M>>(lhs: M, rhs: V): V; // matrix-column-vector
export function cpuMul<M extends Mat>(lhs: M, rhs: M): M; // matrix multiplication
export function cpuMul<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends Lhs extends number
    ? number | NumVec | Mat
    : Lhs extends NumVec
      ? number | Lhs | mBaseForVec<Lhs>
      : Lhs extends Mat
        ? number | vBaseForMat<Lhs> | Lhs
        : never,
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
export function cpuMul(lhs: number | NumVec | Mat, rhs: number | NumVec | Mat) {
  assertKind([lhs, rhs], numericOrMatrixKind);

  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return lhs * rhs; // default multiplication
  }
  if (typeof lhs === 'number' && (isVecInstance(rhs) || isMatInstance(rhs))) {
    return generalizeFn((e) => lhs * e, [rhs]); // scale
  }
  if ((isVecInstance(lhs) || isMatInstance(lhs)) && typeof rhs === 'number') {
    return generalizeFn((e) => e * rhs, [lhs]); // scale
  }
  if (isVecInstance(lhs) && isVecInstance(rhs)) {
    assertEqualKinds(lhs, rhs);
    return generalizeFn((a, b) => a * b, [lhs, rhs]); // component-wise
  }
  if (isFloat32VecInstance(lhs) && isMatInstance(rhs)) {
    if (lhs.length !== rhs.columns.length) {
      throw new WgslTypeError(
        `Unsupported signature. Kind '${kindOf(lhs)}' cannot be multiplied by '${kindOf(rhs)}'.`,
      );
    }
    return mulVxM[rhs.kind](lhs, rhs); // row-vector-matrix
  }
  if (isMatInstance(lhs) && isFloat32VecInstance(rhs)) {
    if (lhs.columns.length !== rhs.length) {
      throw new WgslTypeError(
        `Unsupported signature. Kind '${kindOf(lhs)}' cannot be multiplied by '${kindOf(rhs)}'.`,
      );
    }
    return mulMxV[lhs.kind](lhs, rhs); // matrix-column-vector
  }
  if (isMatInstance(lhs) && isMatInstance(rhs)) {
    assertEqualKinds(lhs, rhs);
    return mulMxM[lhs.kind](lhs, rhs); // matrix multiplication
  }

  throw new WgslTypeError(
    `Unsupported signature. Kind '${kindOf(lhs)}' cannot be multiplied by '${kindOf(rhs)}'.`,
  );
}

export function cpuDiv(lhs: number, rhs: number): number; // default js division
export function cpuDiv<T extends NumVec>(lhs: T, rhs: T): T; // component-wise division
export function cpuDiv<T extends NumVec>(lhs: number, rhs: T): T; // mixed division
export function cpuDiv<T extends NumVec>(lhs: T, rhs: number): T; // mixed division
export function cpuDiv(lhs: NumVec | number, rhs: NumVec | number): NumVec | number {
  assertKind([lhs, rhs], numericKind);
  const cast = upCast([lhs, rhs]);
  assertEqualKinds(...cast);
  return generalizeFn((a, b) => a / b, cast);
}

type ModOverload = {
  (a: number, b: number): number;
  <T extends NumVec>(a: T, b: T): T;
  <T extends NumVec>(a: number, b: T): T;
  <T extends NumVec>(a: T, b: number): T;
};

export const cpuMod = (<T extends NumVec | number>(a: T, b: T): T => {
  assertKind([a, b], numericKind);
  const cast = upCast([a, b]);
  assertEqualKinds(...cast);
  return generalizeFn((a, b) => a % b, cast);
}) as ModOverload;

type ShiftOp = (a: number, b: number) => number;
type IntVec = AnyIntegerVecInstance;

const shift2 = (op: ShiftOp) => (a: v2i | v2u, b: v2u | number) =>
  typeof b === 'number'
    ? constructorOf(a)(op(a.x, b), op(a.y, b))
    : constructorOf(a)(op(a.x, b.x), op(a.y, b.y));

const shift3 = (op: ShiftOp) => (a: v3i | v3u, b: v3u | number) =>
  typeof b === 'number'
    ? constructorOf(a)(op(a.x, b), op(a.y, b), op(a.z, b))
    : constructorOf(a)(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z));

const shift4 = (op: ShiftOp) => (a: v4i | v4u, b: v4u | number) =>
  typeof b === 'number'
    ? constructorOf(a)(op(a.x, b), op(a.y, b), op(a.z, b), op(a.w, b))
    : constructorOf(a)(op(a.x, b.x), op(a.y, b.y), op(a.z, b.z), op(a.w, b.w));

const bitShiftLeftByKind = {
  vec2i: shift2((a, b) => a << b),
  vec2u: shift2((a, b) => a << b),
  vec3i: shift3((a, b) => a << b),
  vec3u: shift3((a, b) => a << b),
  vec4i: shift4((a, b) => a << b),
  vec4u: shift4((a, b) => a << b),
} as Record<IntVec['kind'], <T extends IntVec>(a: T, b: IntVec | number) => T>;

const bitShiftRightByKind = {
  vec2i: shift2((a, b) => a >> b),
  vec2u: shift2((a, b) => a >>> b),
  vec3i: shift3((a, b) => a >> b),
  vec3u: shift3((a, b) => a >>> b),
  vec4i: shift4((a, b) => a >> b),
  vec4u: shift4((a, b) => a >>> b),
} as Record<IntVec['kind'], <T extends IntVec>(a: T, b: IntVec | number) => T>;

export function cpuBitShiftLeft<T extends AnyIntegerVecInstance>(
  lhs: T,
  rhs: number | vecIToVecU<T>,
): T {
  if (
    isInteger32VecInstance(lhs) &&
    ((isUint32VecInstance(rhs) && lhs.length == rhs.length) || typeof rhs === 'number')
  ) {
    // A scalar shift is cast the same way an unsigned vector's components are
    return bitShiftLeftByKind[lhs.kind](lhs, typeof rhs === 'number' ? u32(rhs) : rhs);
  }

  throw new Error(
    "'bitShiftLeft' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.",
  );
}

export function cpuBitShiftRight<T extends AnyIntegerVecInstance>(
  lhs: T,
  rhs: number | vecIToVecU<T>,
): T {
  if (
    isInteger32VecInstance(lhs) &&
    ((isUint32VecInstance(rhs) && lhs.length == rhs.length) || typeof rhs === 'number')
  ) {
    return bitShiftRightByKind[lhs.kind](lhs, typeof rhs === 'number' ? u32(rhs) : rhs);
  }

  throw new Error(
    "'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.",
  );
}
