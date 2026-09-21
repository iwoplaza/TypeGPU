import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';
import type { Context, JsNode, Transpile } from './types.ts';

const { NodeTypeCatalog: NODE } = tinyest;

type VariableDeclaration = acorn.VariableDeclaration | babel.VariableDeclaration;
type VariableDeclarator = acorn.VariableDeclarator | babel.VariableDeclarator;
type DeclarationKind = tinyest.NodeTypeCatalog['const'] | tinyest.NodeTypeCatalog['let'];
type Pattern = acorn.ObjectPattern | acorn.ArrayPattern | babel.ObjectPattern | babel.ArrayPattern;
type PatternTarget = acorn.Pattern | babel.LVal | babel.PatternLike | null;

/**
 * Name of the variable that holds the value of a destructured expression that
 * cannot be evaluated multiple times. Not a valid JS identifier on purpose, so it
 * can never shadow user code. Generators strip the invalid characters.
 */
const DESTRUCTURED_TEMP = '#destructured';

/**
 * Transpiles a `let`/`const` declaration into one tinyest statement per declarator,
 * so `let a = 1, b = 2;` becomes `let a = 1; let b = 2;`.
 */
export function transpileVariableDeclaration<TNode extends JsNode>(
  ctx: Context,
  node: VariableDeclaration,
  transpile: Transpile<TNode>,
): tinyest.Statement[] {
  if (node.kind === 'var') {
    throw new Error('`var` declarations are not supported.');
  }

  const kind = node.kind === 'const' ? NODE.const : NODE.let;

  return (node.declarations as VariableDeclarator[]).flatMap((decl) =>
    transpileDeclarator(ctx, kind, decl, transpile),
  );
}

function transpileDeclarator<TNode extends JsNode>(
  ctx: Context,
  kind: DeclarationKind,
  decl: VariableDeclarator,
  transpile: Transpile<TNode>,
): tinyest.Statement[] {
  if (decl.id.type === 'ObjectPattern' || decl.id.type === 'ArrayPattern') {
    if (!decl.init) {
      throw new Error('Destructuring declarations require an initializer.');
    }
    const init = transpile(ctx, decl.init as TNode) as tinyest.Expression;
    return destructure(ctx, kind, decl.id, init);
  }

  if (decl.id.type !== 'Identifier') {
    throw new Error(`Invalid variable declaration, expected identifier.`);
  }

  const init = decl.init ? (transpile(ctx, decl.init as TNode) as tinyest.Expression) : undefined;

  return [declare(ctx, kind, decl.id.name, init)];
}

function declare(
  ctx: Context,
  kind: DeclarationKind,
  id: string,
  init: tinyest.Expression | undefined,
): tinyest.Let | tinyest.Const {
  ctx.stack[ctx.stack.length - 1]?.declaredNames.push(id);

  return kind === NODE.const
    ? init !== undefined
      ? [NODE.const, id, init]
      : [NODE.const, id]
    : init !== undefined
      ? [NODE.let, id, init]
      : [NODE.let, id];
}

/**
 * An identifier or a chain of non-computed member accesses (`a.b.c`). Evaluating
 * it multiple times is free of side effects and as cheap as evaluating it once.
 */
function isSimpleChain(expr: tinyest.Expression): boolean {
  if (typeof expr === 'string') {
    return true;
  }
  return typeof expr === 'object' && expr[0] === NODE.memberAccess && isSimpleChain(expr[1]);
}

/**
 * Desugars `const { a, b: { c } } = <source>;` into `const a = source.a; const c = source.b.c;`
 * (and the array equivalent). When `source` is not a simple chain, it's evaluated
 * once into a temporary variable first.
 */
function destructure(
  ctx: Context,
  kind: DeclarationKind,
  pattern: Pattern,
  source: tinyest.Expression,
): tinyest.Statement[] {
  const statements: tinyest.Statement[] = [];

  let base = source;
  if (!isSimpleChain(source)) {
    statements.push(declare(ctx, NODE.const, DESTRUCTURED_TEMP, source));
    base = DESTRUCTURED_TEMP;
  }

  const bind = (target: PatternTarget, access: tinyest.Expression) => {
    if (target === null) {
      return; // an elided element, e.g. `const [, b] = arr;`
    }
    if (target.type === 'Identifier') {
      statements.push(declare(ctx, kind, target.name, access));
      return;
    }
    if (target.type === 'ObjectPattern' || target.type === 'ArrayPattern') {
      statements.push(...destructure(ctx, kind, target, access));
      return;
    }
    if (target.type === 'AssignmentPattern') {
      throw new Error(
        'Default values in destructuring declarations are not supported, since there is no `undefined` in WGSL.',
      );
    }
    if (target.type === 'RestElement') {
      throw new Error('Rest elements in destructuring declarations are not supported.');
    }
    throw new Error(`Unsupported destructuring target: ${target.type}.`);
  };

  if (pattern.type === 'ArrayPattern') {
    pattern.elements.forEach((element, index) => {
      bind(element, [NODE.indexAccess, base, [NODE.numericLiteral, String(index)]]);
    });
    return statements;
  }

  for (const property of pattern.properties) {
    if (property.type === 'RestElement') {
      throw new Error('Rest elements in destructuring declarations are not supported.');
    }
    if (property.computed) {
      throw new Error('Computed keys in destructuring declarations are not supported.');
    }

    let key: string;
    if (property.key.type === 'Identifier') {
      key = property.key.name;
    } else if (
      property.key.type === /* acorn */ 'Literal' ||
      property.key.type === /* babel */ 'StringLiteral' ||
      property.key.type === /* babel */ 'NumericLiteral'
    ) {
      key = String(property.key.value);
    } else {
      throw new Error(`Unsupported destructuring key: ${property.key.type}.`);
    }

    bind(property.value as PatternTarget, [NODE.memberAccess, base, key]);
  }

  return statements;
}
