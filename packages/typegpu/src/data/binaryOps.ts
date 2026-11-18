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
  type mBaseForVec,
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

function sameTypeAs<T extends AnyVecInstance | Mat>(value: T, components: number[]): T {
  const schema = WORKAROUND_getSchema(value) as unknown as (...args: number[]) => T;
  return schema(...components);
}

function at(vector: NumVec | undefined, index: number): number {
  return (vector as NumVec)[index] as number;
}

function sumOfProducts(length: number, product: (k: number) => number): number {
  let sum = product(0);
  for (let k = 1; k < length; k++) {
    sum += product(k);
  }
  return sum;
}

function mulMxM<M extends Mat>(a: M, b: M): M {
  const a_ = a.columns as readonly NumVec[];
  const b_ = b.columns as readonly NumVec[];
  const n = a_.length;
  return sameTypeAs(
    a,
    Array.from({ length: n * n }, (_, i) => {
      const column = Math.floor(i / n);
      const row = i % n;
      return sumOfProducts(n, (k) => at(a_[k], row) * at(b_[column], k));
    }),
  );
}

function mulMxV<V extends NumVec>(m: Mat, v: V): V {
  const m_ = m.columns as readonly NumVec[];
  return sameTypeAs(
    v,
    Array.from({ length: v.length }, (_, row) =>
      sumOfProducts(v.length, (k) => at(m_[k], row) * at(v, k)),
    ),
  );
}

function mulVxM<V extends NumVec>(v: V, m: Mat): V {
  const m_ = m.columns as readonly NumVec[];
  return sameTypeAs(
    v,
    Array.from({ length: v.length }, (_, column) =>
      sumOfProducts(v.length, (k) => at(v, k) * at(m_[column], k)),
    ),
  );
}

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
    return mulVxM(lhs, rhs); // row-vector-matrix
  }
  if (isMatInstance(lhs) && isFloat32VecInstance(rhs)) {
    if (lhs.columns.length !== rhs.length) {
      throw new WgslTypeError(
        `Unsupported signature. Kind '${kindOf(lhs)}' cannot be multiplied by '${kindOf(rhs)}'.`,
      );
    }
    return mulMxV(lhs, rhs); // matrix-column-vector
  }
  if (isMatInstance(lhs) && isMatInstance(rhs)) {
    assertEqualKinds(lhs, rhs);
    return mulMxM(lhs, rhs); // matrix multiplication
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

function bitShift<T extends AnyIntegerVecInstance>(
  lhs: T,
  rhs: number | AnyIntegerVecInstance,
  op: (a: number, b: number) => number,
): T {
  // A scalar shift is cast the same way an unsigned vector's components are
  const shiftBy = typeof rhs === 'number' ? u32(rhs) : undefined;
  return sameTypeAs(
    lhs,
    Array.from({ length: lhs.length }, (_, i) =>
      op(at(lhs, i), shiftBy ?? at(rhs as AnyIntegerVecInstance, i)),
    ),
  );
}

export function cpuBitShiftLeft<T extends AnyIntegerVecInstance>(
  lhs: T,
  rhs: number | vecIToVecU<T>,
): T {
  if (
    isInteger32VecInstance(lhs) &&
    ((isUint32VecInstance(rhs) && lhs.length == rhs.length) || typeof rhs === 'number')
  ) {
    return bitShift(lhs, rhs, (a, b) => a << b);
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
    return isUint32VecInstance(lhs)
      ? bitShift(lhs, rhs, (a, b) => a >>> b)
      : bitShift(lhs, rhs, (a, b) => a >> b);
  }

  throw new Error(
    "'bitShiftRight' called with invalid arguments, expected: left-hand side to be an integer vector, right-hand side to be a number or unsigned integer vector of the same arity as the left-hand side.",
  );
}
