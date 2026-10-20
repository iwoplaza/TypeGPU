import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch, wgslCall } from '../core/resolve/stitch.ts';
import { bool, i32, u32 } from '../data/numeric.ts';
import { vec4u } from '../data/vector.ts';
import type {
  AnyIntegerVecInstance,
  AnyNumericVecInstance,
  AnyWgslData,
  v4u,
} from '../data/wgslTypes.ts';
import { unify } from '../tgsl/conversion.ts';

interface IdentityNumOrVec {
  (e: number): number;
  <T extends AnyNumericVecInstance>(e: T): T;
}

interface IdentityIntNumOrVec {
  (e: number): number;
  <T extends AnyIntegerVecInstance>(e: T): T;
}

interface IdentityNumOrVecWithIdx {
  (e: number, index: number): number;
  <T extends AnyNumericVecInstance>(e: T, index: number): T;
}

interface IdentityNumOrVecWithDelta {
  (e: number, delta: number): number;
  <T extends AnyNumericVecInstance>(e: T, delta: number): T;
}

interface IdentityNumOrVecWithMask {
  (e: number, mask: number): number;
  <T extends AnyNumericVecInstance>(e: T, mask: number): T;
}

const errorMessage = 'Subgroup operations can only be used in the GPU context.';

export const subgroupAdd = dualImpl<IdentityNumOrVec>({
  name: 'subgroupAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupAdd'),
  sideEffects: false,
});

export const subgroupExclusiveAdd = dualImpl<IdentityNumOrVec>({
  name: 'subgroupExclusiveAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupExclusiveAdd'),
  sideEffects: false,
});

export const subgroupInclusiveAdd = dualImpl<IdentityNumOrVec>({
  name: 'subgroupInclusiveAdd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupInclusiveAdd'),
  sideEffects: false,
});

export const subgroupAll = dualImpl<(e: boolean) => boolean>({
  name: 'subgroupAll',
  signature: { argTypes: [bool], returnType: bool },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupAll'),
  sideEffects: false,
});

export const subgroupAnd = dualImpl<IdentityIntNumOrVec>({
  name: 'subgroupAnd',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupAnd'),
  sideEffects: false,
});

export const subgroupAny = dualImpl<(e: boolean) => boolean>({
  name: 'subgroupAny',
  signature: { argTypes: [bool], returnType: bool },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupAny'),
  sideEffects: false,
});

export const subgroupBallot = dualImpl<(e: boolean) => v4u>({
  name: 'subgroupBallot',
  signature: { argTypes: [bool], returnType: vec4u },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupBallot'),
  sideEffects: false,
});

export const subgroupBroadcast = dualImpl<IdentityNumOrVecWithIdx>({
  name: 'subgroupBroadcast',
  signature: (...args) => {
    const id = unify([args[1]] as [AnyWgslData], [i32, u32]);
    if (!id) {
      throw new Error(
        `subgroupBroadcast's second argument has to be compatible with i32 or u32. Got: ${
          args[1].type
        }`,
      );
    }
    return { argTypes: [args[0], id[0]], returnType: args[0] };
  },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupBroadcast'),
  sideEffects: false,
});

export const subgroupBroadcastFirst = dualImpl<IdentityNumOrVec>({
  name: 'subgroupBroadcastFirst',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupBroadcastFirst'),
  sideEffects: false,
});

export const subgroupElect = dualImpl<() => boolean>({
  name: 'subgroupElect',
  signature: { argTypes: [], returnType: bool },
  normalImpl: errorMessage,
  codegenImpl: () => stitch`subgroupElect()`,
  sideEffects: false,
});

export const subgroupMax = dualImpl<IdentityNumOrVec>({
  name: 'subgroupMax',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupMax'),
  sideEffects: false,
});

export const subgroupMin = dualImpl<IdentityNumOrVec>({
  name: 'subgroupMin',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupMin'),
  sideEffects: false,
});

export const subgroupMul = dualImpl<IdentityNumOrVec>({
  name: 'subgroupMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupMul'),
  sideEffects: false,
});

export const subgroupExclusiveMul = dualImpl<IdentityNumOrVec>({
  name: 'subgroupExclusiveMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupExclusiveMul'),
  sideEffects: false,
});

export const subgroupInclusiveMul = dualImpl<IdentityNumOrVec>({
  name: 'subgroupInclusiveMul',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupInclusiveMul'),
  sideEffects: false,
});

export const subgroupOr = dualImpl<IdentityIntNumOrVec>({
  name: 'subgroupOr',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupOr'),
  sideEffects: false,
});

export const subgroupShuffle = dualImpl<IdentityNumOrVecWithIdx>({
  name: 'subgroupShuffle',
  signature: (...args) => {
    const id = unify([args[1]] as [AnyWgslData], [i32, u32]);
    if (!id) {
      throw new Error(
        `subgroupShuffle's second argument has to be compatible with i32 or u32. Got: ${
          args[1].type
        }`,
      );
    }
    return { argTypes: [args[0], id[0]], returnType: args[0] };
  },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupShuffle'),
  sideEffects: false,
});

export const subgroupShuffleDown = dualImpl<IdentityNumOrVecWithDelta>({
  name: 'subgroupShuffleDown',
  signature: (...args) => {
    const delta = unify([args[1]] as [AnyWgslData], [u32]);
    if (!delta) {
      throw new Error(
        `subgroupShuffleDown's second argument has to be compatible with u32. Got: ${args[1].type}`,
      );
    }
    return { argTypes: [args[0], delta[0]], returnType: args[0] };
  },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupShuffleDown'),
  sideEffects: false,
});

export const subgroupShuffleUp = dualImpl<IdentityNumOrVecWithDelta>({
  name: 'subgroupShuffleUp',
  signature: (...args) => {
    const delta = unify([args[1]] as [AnyWgslData], [u32]);
    if (!delta) {
      throw new Error(
        `subgroupShuffleUp's second argument has to be compatible with u32. Got: ${args[1].type}`,
      );
    }
    return { argTypes: [args[0], delta[0]], returnType: args[0] };
  },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupShuffleUp'),
  sideEffects: false,
});

export const subgroupShuffleXor = dualImpl<IdentityNumOrVecWithMask>({
  name: 'subgroupShuffleXor',
  signature: (...args) => {
    const mask = unify([args[1]] as [AnyWgslData], [u32]);
    if (!mask) {
      throw new Error(
        `subgroupShuffleXor's second argument has to be compatible with u32. Got: ${args[1].type}`,
      );
    }
    return { argTypes: [args[0], mask[0]], returnType: args[0] };
  },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupShuffleXor'),
  sideEffects: false,
});

export const subgroupXor = dualImpl<IdentityIntNumOrVec>({
  name: 'subgroupXor',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('subgroupXor'),
  sideEffects: false,
});

export const quadBroadcast = dualImpl<IdentityNumOrVecWithIdx>({
  name: 'quadBroadcast',
  signature: (...args) => {
    const id = unify([args[1]] as [AnyWgslData], [i32, u32]);
    if (!id) {
      throw new Error(
        `quadBroadcast's second argument has to be compatible with i32 or u32. Got: ${args[1].type}`,
      );
    }
    return { argTypes: [args[0], id[0]], returnType: args[0] };
  },
  normalImpl: errorMessage,
  codegenImpl: wgslCall('quadBroadcast'),
  sideEffects: false,
});

export const quadSwapDiagonal = dualImpl<IdentityNumOrVec>({
  name: 'quadSwapDiagonal',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('quadSwapDiagonal'),
  sideEffects: false,
});

export const quadSwapX = dualImpl<IdentityNumOrVec>({
  name: 'quadSwapX',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('quadSwapX'),
  sideEffects: false,
});

export const quadSwapY = dualImpl<IdentityNumOrVec>({
  name: 'quadSwapY',
  signature: (arg) => ({ argTypes: [arg], returnType: arg }),
  normalImpl: errorMessage,
  codegenImpl: wgslCall('quadSwapY'),
  sideEffects: false,
});
