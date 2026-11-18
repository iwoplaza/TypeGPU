import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import {
  cpuAdd,
  cpuBitShiftLeft,
  cpuBitShiftRight,
  cpuDiv,
  cpuMod,
  cpuMul,
  cpuSub,
} from '../data/binaryOps.ts';
import { abstractFloat, f16, f32, u32 } from '../data/numeric.ts';
import { vec2i, vec2u, vec3i, vec3u, vec4i, vec4u } from '../data/vector.ts';
import { generalizeFn, signedKind, assertKind } from '../data/generalizeFn.ts';
import {
  type AnyNumericVecInstance,
  type AnySignedVecInstance,
  type BaseData,
  isMat,
  isVec,
} from '../data/wgslTypes.ts';
import { SignatureNotSupportedError, WgslTypeError } from '../errors.ts';
import { unify } from '../tgsl/conversion.ts';

type NumVec = AnyNumericVecInstance;

const getPrimitive = (t: BaseData): BaseData => ('primitive' in t ? (t.primitive as BaseData) : t);

const makeBinarySignature =
  (opts?: { matVecProduct?: boolean; noMat?: boolean; restrict?: BaseData[] }) =>
  (lhs: BaseData, rhs: BaseData) => {
    const { restrict } = opts ?? {};
    const fail = (msg: string): never => {
      if (restrict) {
        throw new SignatureNotSupportedError([lhs, rhs], restrict);
      }
      throw new Error(`Cannot apply operator to ${lhs.type} and ${rhs.type}: ${msg}`);
    };

    if (opts?.noMat && (isMat(lhs) || isMat(rhs))) {
      return fail('matrices not supported');
    }
    const lhsC = isVec(lhs) || isMat(lhs);
    const rhsC = isVec(rhs) || isMat(rhs);

    if (!lhsC && !rhsC) {
      // scalar × scalar
      const unified = unify([lhs, rhs], restrict);
      if (!unified) return fail('incompatible scalar types');
      return { argTypes: unified, returnType: unified[0] };
    }

    if (lhsC && rhsC) {
      // vec × mat or mat × vec
      if (opts?.matVecProduct && isVec(lhs) !== isVec(rhs)) {
        return { argTypes: [lhs, rhs], returnType: isVec(lhs) ? lhs : rhs };
      }
      // composite × composite (same kind)
      if (lhs.type !== rhs.type) return fail('operands must have the same type');
      return { argTypes: [lhs, rhs], returnType: lhs };
    }

    // scalar × composite
    const [scalar, composite] = lhsC ? [rhs, lhs] : [lhs, rhs];
    const unified = unify([scalar], [getPrimitive(composite)]);
    if (!unified) {
      return fail(`scalar not convertible to ${getPrimitive(composite).type}`);
    }
    return {
      argTypes: lhsC ? [lhs, unified[0]] : [unified[0], rhs],
      returnType: composite,
    };
  };

const binaryArithmeticSignature = makeBinarySignature();
const binaryMulSignature = makeBinarySignature({ matVecProduct: true });
const binaryDivSignature = makeBinarySignature({
  noMat: true,
  restrict: [f32, f16, abstractFloat],
});

export const add = dualImpl({
  name: 'add',
  signature: binaryArithmeticSignature,
  normalImpl: cpuAdd,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '+', rhs),
  sideEffects: false,
});

export const sub = dualImpl({
  name: 'sub',
  signature: binaryArithmeticSignature,
  normalImpl: cpuSub,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '-', rhs),
  sideEffects: false,
});

export const mul = dualImpl({
  name: 'mul',
  signature: binaryMulSignature,
  normalImpl: cpuMul,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '*', rhs),
  sideEffects: false,
});

export const div = dualImpl({
  name: 'div',
  signature: binaryDivSignature,
  normalImpl: cpuDiv,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '/', rhs),
  ignoreImplicitCastWarning: true,
  sideEffects: false,
});

/**
 * @privateRemarks
 * Both JS and WGSL implementations use truncated definition of modulo
 */
export const mod = dualImpl({
  name: 'mod',
  signature: binaryDivSignature,
  normalImpl: cpuMod,
  codegenImpl: (ctx, [lhs, rhs]) => ctx.gen.emitBinaryOp(lhs, '%', rhs),
  sideEffects: false,
});

function cpuNeg(value: number): number;
function cpuNeg<T extends AnySignedVecInstance>(value: T): T;
function cpuNeg(value: NumVec | number): NumVec | number {
  assertKind(value, signedKind);
  return generalizeFn((value) => -value, [value]);
}

export const neg = dualImpl({
  name: 'neg',
  signature: (arg) => {
    if (getPrimitive(arg) === u32) {
      throw new WgslTypeError(
        `Unsupported signature. Unary operator - cannot be applied to argument of kind '${arg.type}'.`,
      );
    }
    return {
      argTypes: [arg],
      returnType: arg,
    };
  },
  normalImpl: cpuNeg,
  codegenImpl: (_ctx, [arg]) => stitch`-(${arg})`,
  sideEffects: false,
});

const bitShiftSignature = (lhs: BaseData, rhs: BaseData) => {
  const lhsUnified = unify([lhs], [vec2i, vec3i, vec4i, vec2u, vec3u, vec4u])?.[0];
  if (!lhsUnified || !isVec(lhsUnified)) {
    throw new SignatureNotSupportedError([lhs], [vec2i, vec3i, vec4i, vec2u, vec3u, vec4u]);
  }

  const cc = lhsUnified.componentCount;
  const vecU = cc === 2 ? vec2u : cc === 3 ? vec3u : vec4u;
  const rhsUnified = unify([rhs], [u32, vecU])?.[0];
  if (!rhsUnified) {
    throw new SignatureNotSupportedError([rhs], [u32, vecU]);
  }

  return {
    argTypes: [lhsUnified, rhsUnified],
    returnType: lhsUnified,
  };
};

export const bitShiftLeft = dualImpl({
  name: 'bitShiftLeft',
  signature: bitShiftSignature,
  normalImpl: cpuBitShiftLeft,
  codegenImpl: (ctx, [lhs, rhs]) => {
    if (isVec(lhs.dataType) && !isVec(rhs.dataType)) {
      const cc = lhs.dataType.componentCount;
      const schema = cc === 2 ? vec2u : cc === 3 ? vec3u : vec4u;
      return ctx.gen.emitBinaryOp(lhs, '<<', ctx.gen.typeInstantiation(schema, [rhs]));
    }
    return ctx.gen.emitBinaryOp(lhs, '<<', rhs);
  },
  sideEffects: false,
});

export const bitShiftRight = dualImpl({
  name: 'bitShiftRight',
  signature: bitShiftSignature,
  normalImpl: cpuBitShiftRight,
  codegenImpl: (ctx, [lhs, rhs]) => {
    if (isVec(lhs.dataType) && !isVec(rhs.dataType)) {
      const cc = lhs.dataType.componentCount;
      const schema = cc === 2 ? vec2u : cc === 3 ? vec3u : vec4u;
      return ctx.gen.emitBinaryOp(lhs, '>>', ctx.gen.typeInstantiation(schema, [rhs]));
    }
    return ctx.gen.emitBinaryOp(lhs, '>>', rhs);
  },
  sideEffects: false,
});

/**
 * The operators that vectors and matrices expose as methods, e.g. `a.mul(b)`.
 */
export const infixOperators = {
  add,
  sub,
  mul,
  div,
  mod,
  bitShiftLeft,
  bitShiftRight,
} as const;
