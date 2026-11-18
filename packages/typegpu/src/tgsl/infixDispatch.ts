import { Operator } from 'tsover-runtime';
import {
  cpuAdd,
  cpuBitShiftLeft,
  cpuBitShiftRight,
  cpuDiv,
  cpuMod,
  cpuMul,
  cpuSub,
} from '../data/binaryOps.ts';
import type { MatBase } from '../data/matrix.ts';
import { isSnippet, type Snippet } from '../data/snippet.ts';
import type { VecBase } from '../data/vectorImpl.ts';
import type { AnyMatInstance, AnyNumericVecInstance } from '../data/wgslTypes.ts';
import { inCodegenMode } from '../execMode.ts';
import { $comptimeValueOf } from '../shared/symbols.ts';
import { asComptime, type ComptimeValue, type WithComptimeValue } from '../types.ts';

/**
 * CPU implementations of the infix operators. The shader generator maps the names
 * to their `std` counterparts (see `infixOperators` in `std/operators.ts`).
 */
export const infixOperatorImpls = {
  add: cpuAdd,
  sub: cpuSub,
  mul: cpuMul,
  div: cpuDiv,
  mod: cpuMod,
  bitShiftLeft: cpuBitShiftLeft,
  bitShiftRight: cpuBitShiftRight,
} as const;

type Numeric = number | AnyNumericVecInstance | AnyMatInstance;

export type InfixOperatorName = keyof typeof infixOperatorImpls;

/**
 * InfixDispatch is only used in codegen mode.
 * `lhs` may either be Numeric or Snippet.
 * @example
 * const external = d.vec2u(1);
 * const fn = () => {
 *    'use gpu';
 *    external.mul(2); // lhs is Numeric
 *    d.vec2u(1).mul(2) // lhs is a snippet
 * }
 */
export class InfixDispatch implements WithComptimeValue {
  readonly lhs: Snippet | Numeric;
  readonly operator: InfixOperatorName;

  constructor(lhs: Snippet | Numeric, operator: InfixOperatorName) {
    this.lhs = lhs;
    this.operator = operator;
  }

  [$comptimeValueOf](): ComptimeValue {
    const known = isSnippet(this.lhs) ? asComptime(this.lhs) : { value: this.lhs };
    if (!known) {
      return { comptime: false };
    }

    // Same as accessing e.g. `.mul` on a vector in JS, but bound to `lhs`
    const lhs = known.value;
    const operator = infixOperatorImpls[this.operator] as (lhs: unknown, rhs: unknown) => unknown;
    return { comptime: true, value: (rhs: unknown) => operator(lhs, rhs) };
  }
}

export function isInfixDispatch(o: unknown): o is InfixDispatch {
  return o instanceof InfixDispatch;
}

const operatorSymbols: Partial<Record<InfixOperatorName, symbol>> = {
  add: Operator.plus,
  sub: Operator.minus,
  mul: Operator.star,
  div: Operator.slash,
  mod: Operator.percent,
  // bitShift does not yet have a tsover operator symbol
};

/**
 * This function is used on vec/mat prototypes.
 * This is done in runtime in order to avoid a circular dependency.
 */
function assignInfixOperator<T extends typeof VecBase | typeof MatBase>(
  base: T,
  operator: InfixOperatorName,
) {
  const opImpl = infixOperatorImpls[operator];

  const operatorSymbol = operatorSymbols[operator];
  if (operatorSymbol) {
    Object.defineProperty(base.prototype, operatorSymbol, { value: opImpl });
  }

  // Returning this from a getter will work as if this was a vector/matrix's method.
  function jsInfixDispatchFor(this: unknown, arg: unknown) {
    // operator will perform all necessary type checks
    return (opImpl as (lhs: unknown, rhs: unknown) => unknown)(this, arg);
  }

  Object.defineProperty(base.prototype, operator, {
    get() {
      if (inCodegenMode()) {
        return new InfixDispatch(this, operator);
      }
      return jsInfixDispatchFor;
    },
  });
}

/**
 * Called by the modules that define the vector and matrix schemas, so that
 * every vector and matrix has the infix operators, no matter how it was created.
 */
export function assignInfixOperators(
  base: typeof VecBase | typeof MatBase,
  operators: InfixOperatorName[],
) {
  for (const operator of operators) {
    assignInfixOperator(base, operator);
  }
}
