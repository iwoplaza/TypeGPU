import { Operator } from 'tsover-runtime';
import { MatBase } from './matrix.ts';
import { VecBase } from './vectorImpl.ts';
import { assignInfixOperator } from '../tgsl/infixDispatch.ts';
import { assertEqualKinds, assertKind, floatKind, generalizeFn } from './generalizeFn.ts';
import type { AnyFloatVecInstance } from './wgslTypes.ts';

let infixOperatorsAssigned = false;

// CPU-only. Importing `powOperator` from `std` here would pull it into every program using vectors
function vecPow(base: AnyFloatVecInstance, exponent: AnyFloatVecInstance): AnyFloatVecInstance {
  assertKind([base, exponent], floatKind);
  assertEqualKinds(base, exponent);
  return generalizeFn((a, b) => a ** b, [base, exponent]);
}

export function assignInfixOperators(): void {
  if (infixOperatorsAssigned) {
    return;
  }
  infixOperatorsAssigned = true;

  assignInfixOperator(VecBase, 'add', Operator.plus);
  assignInfixOperator(MatBase, 'add', Operator.plus);
  assignInfixOperator(VecBase, 'sub', Operator.minus);
  assignInfixOperator(MatBase, 'sub', Operator.minus);
  assignInfixOperator(VecBase, 'mul', Operator.star);
  assignInfixOperator(MatBase, 'mul', Operator.star);
  assignInfixOperator(VecBase, 'div', Operator.slash);
  assignInfixOperator(VecBase, 'mod', Operator.percent);
  // No `.pow()` method, only the `**` operator
  Object.defineProperty(VecBase.prototype, Operator.starStar, { value: vecPow });
  assignInfixOperator(VecBase, 'bitShiftLeft', Symbol()); // bitShift does not yet have tsover operator symbol
  assignInfixOperator(VecBase, 'bitShiftRight', Symbol()); // bitShift does not yet have tsover operator symbol
}
