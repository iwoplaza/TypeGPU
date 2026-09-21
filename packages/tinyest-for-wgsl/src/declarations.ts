import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';
import type { Context, JsNode, Transpile } from './types.ts';

const { NodeTypeCatalog: NODE } = tinyest;

type VariableDeclaration = acorn.VariableDeclaration | babel.VariableDeclaration;
type VariableDeclarator = acorn.VariableDeclarator | babel.VariableDeclarator;

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
  kind: tinyest.NodeTypeCatalog['const'] | tinyest.NodeTypeCatalog['let'],
  decl: VariableDeclarator,
  transpile: Transpile<TNode>,
): tinyest.Statement[] {
  if (decl.id.type !== 'Identifier') {
    throw new Error(`Invalid variable declaration, expected identifier.`);
  }

  const id = decl.id.name;
  ctx.stack[ctx.stack.length - 1]?.declaredNames.push(id);

  const init = decl.init ? (transpile(ctx, decl.init as TNode) as tinyest.Expression) : undefined;

  const statement: tinyest.Let | tinyest.Const =
    kind === NODE.const
      ? init !== undefined
        ? [NODE.const, id, init]
        : [NODE.const, id]
      : init !== undefined
        ? [NODE.let, id, init]
        : [NODE.let, id];

  return [statement];
}
