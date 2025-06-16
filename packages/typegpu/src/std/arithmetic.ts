import { vec2f, vec3f } from '../data';
import { VectorOps } from '../data/vectorOps';
import {
  AnyMatInstance,
  AnyNumericVecInstance,
  isMatInstance,
  isVecInstance,
} from '../data/wgslTypes';

type NumVec = AnyNumericVecInstance;
type Mat = AnyMatInstance;
type Numeric = number | NumVec | Mat;
type Same<Lhs, Rhs> = Lhs extends Rhs ? Rhs extends Lhs ? Lhs : never : never;

type AddResult<Lhs extends Numeric, Rhs extends Numeric> = Lhs extends number
  ? Rhs
  : Rhs extends number ? Lhs
  : Same<Lhs, Rhs>;

function cpuAdd2<Lhs extends Numeric, Rhs extends Numeric>(
  lhs: Lhs,
  rhs: Rhs,
): AddResult<Lhs, Rhs>;
function cpuAdd2<
  // union overload
  Lhs extends number | NumVec | Mat,
  Rhs extends (Lhs extends number ? number | NumVec
    : Lhs extends NumVec ? number | Lhs
    : Lhs extends Mat ? Lhs
    : never),
>(lhs: Lhs, rhs: Rhs): Lhs | Rhs;
function cpuAdd2(lhs: number | NumVec | Mat, rhs: number | NumVec | Mat) {
  if (typeof lhs === 'number' && typeof rhs === 'number') {
    return lhs + rhs; // default addition
  }
  if (typeof lhs === 'number' && isVecInstance(rhs)) {
    return VectorOps.addMixed[rhs.kind](rhs, lhs); // mixed addition
  }
  if (isVecInstance(lhs) && typeof rhs === 'number') {
    return VectorOps.addMixed[lhs.kind](lhs, rhs); // mixed addition
  }
  if (
    (isVecInstance(lhs) && isVecInstance(rhs)) ||
    (isMatInstance(lhs) && isMatInstance(rhs))
  ) {
    return VectorOps.add[lhs.kind](lhs, rhs); // component-wise addition
  }

  throw new Error('Add/Sub called with invalid arguments.');
}

const a = cpuAdd2(1, 2);

const b = cpuAdd2(vec2f(), vec3f());
console.log(b);
