import type * as acorn from 'acorn';
import type * as babel from '@babel/types';
import * as tinyest from 'tinyest';
import type { Context, JsNode, Transpile, Transpilers } from './types.ts';
import { transpileVariableDeclaration } from './declarations.ts';

const { NodeTypeCatalog: NODE } = tinyest;

type SharedTranspilers = Extract<babel.Node['type'], acorn.AnyNode['type']>;

export const baseTranspilers = {
  Program(ctx, node, transpile) {
    const body = node.body[0];

    if (!body) {
      throw new Error('tgpu.fn was not implemented correctly.');
    }

    return transpile(ctx, body);
  },

  ExpressionStatement(ctx, node, transpile) {
    return transpile(ctx, node.expression);
  },

  EmptyStatement() {
    // A lone `;` does nothing, which an empty block conveys without introducing a node.
    return [NODE.block, []];
  },

  ArrowFunctionExpression() {
    throw new Error('Arrow functions are not supported inside TGSL.');
  },

  BlockStatement(ctx, node, transpile) {
    ctx.stack.push({ declaredNames: [] });

    try {
      return [
        NODE.block,
        node.body.flatMap((statement) =>
          // Declarations can expand into multiple statements, e.g. `let a = 1, b = 2;`
          statement.type === 'VariableDeclaration'
            ? transpileVariableDeclaration(ctx, statement, transpile)
            : [transpile(ctx, statement) as tinyest.Statement],
        ),
      ] as const;
    } finally {
      ctx.stack.pop();
    }
  },

  ReturnStatement(ctx, node, transpile) {
    return node.argument
      ? [NODE.return, transpile(ctx, node.argument) as tinyest.Expression]
      : [NODE.return];
  },

  Identifier(_ctx, node) {
    return node.name;
  },

  ThisExpression() {
    return 'this';
  },

  BinaryExpression(ctx, node, transpile) {
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;

    return [NODE.binaryExpr, left, node.operator as tinyest.BinaryOperator, right];
  },

  LogicalExpression(ctx, node, transpile) {
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;

    return [NODE.logicalExpr, left, node.operator as tinyest.LogicalOperator, right];
  },

  AssignmentExpression(ctx, node, transpile) {
    const left = transpile(ctx, node.left) as tinyest.Expression;
    const right = transpile(ctx, node.right) as tinyest.Expression;

    return [NODE.assignmentExpr, left, node.operator as tinyest.AssignmentOperator, right];
  },

  UnaryExpression(ctx, node, transpile) {
    const wgslOp = node.operator;
    const argument = transpile(ctx, node.argument) as tinyest.Expression;

    return [NODE.unaryExpr, wgslOp, argument] as tinyest.UnaryExpression;
  },

  MemberExpression(ctx, node, transpile) {
    const object = transpile(ctx, node.object) as tinyest.Expression;

    // If the property is computed, it could potentially be an external identifier.
    if (node.computed) {
      const property = transpile(ctx, node.property) as tinyest.Expression;
      return [NODE.indexAccess, object, property];
    }

    // If the property is not computed, we don't want to register identifiers as external.
    ctx.ignoreExternalDepth++;
    const property = transpile(ctx, node.property) as tinyest.Expression;
    ctx.ignoreExternalDepth--;

    if (typeof property !== 'string') {
      throw new Error('Expected identifier as property access key.');
    }

    return [NODE.memberAccess, object, property];
  },

  UpdateExpression(ctx, node, transpile) {
    const operator = node.operator;
    const argument = transpile(ctx, node.argument) as tinyest.Expression;

    return node.prefix
      ? [NODE.preUpdate, operator, argument]
      : [NODE.postUpdate, operator, argument];
  },

  ConditionalExpression(ctx, node, transpile) {
    const test = transpile(ctx, node.test) as tinyest.Expression;
    const consequent = transpile(ctx, node.consequent) as tinyest.Expression;
    const alternative = transpile(ctx, node.alternate) as tinyest.Expression;

    return [NODE.conditionalExpr, test, consequent, alternative];
  },

  CallExpression(ctx, node, transpile) {
    const callee = transpile(ctx, node.callee) as tinyest.Expression;
    const args = node.arguments.map((argument) => transpile(ctx, argument) as tinyest.Expression);

    return [NODE.call, callee, args];
  },

  ArrayExpression(ctx, node, transpile) {
    return [
      NODE.arrayExpr,
      node.elements.map((element) => {
        if (!element || element.type === 'SpreadElement') {
          throw new Error('Spread elements are not supported in TGSL.');
        }
        return transpile(ctx, element) as tinyest.Expression;
      }),
    ];
  },

  VariableDeclaration(ctx, node, transpile) {
    // Only reached outside of statement lists (e.g. `for` initializers and
    // `for...of` heads), where a declaration has to stay a single statement.
    const statements = transpileVariableDeclaration(ctx, node, transpile);

    if (statements.length !== 1 || !statements[0]) {
      throw new Error(
        'Only one declaration is allowed in a `for` initializer. Declare the remaining variables in separate statements.',
      );
    }

    return statements[0];
  },

  IfStatement(ctx, node, transpile) {
    const test = transpile(ctx, node.test) as tinyest.Expression;
    const consequent = transpile(ctx, node.consequent) as tinyest.Statement;
    const alternate = node.alternate
      ? (transpile(ctx, node.alternate) as tinyest.Statement)
      : undefined;

    return alternate ? [NODE.if, test, consequent, alternate] : [NODE.if, test, consequent];
  },

  ForStatement(ctx, node, transpile) {
    ctx.stack.push({ declaredNames: [] });

    const init = node.init ? (transpile(ctx, node.init) as tinyest.Statement) : null;
    const condition = node.test ? (transpile(ctx, node.test) as tinyest.Expression) : null;
    const update = node.update ? (transpile(ctx, node.update) as tinyest.Statement) : null;
    const body = transpile(ctx, node.body) as tinyest.Statement;

    ctx.stack.pop();

    return [NODE.for, init, condition, update, body];
  },

  WhileStatement(ctx, node, transpile) {
    const condition = transpile(ctx, node.test) as tinyest.Expression;
    const body = transpile(ctx, node.body) as tinyest.Statement;

    return [NODE.while, condition, body];
  },

  SwitchStatement(ctx, node, transpile) {
    const discriminant = transpile(ctx, node.discriminant) as tinyest.Expression;

    const cases = node.cases.map((switchCase): tinyest.SwitchCase => {
      const test = switchCase.test ? (transpile(ctx, switchCase.test) as tinyest.Expression) : null;

      // Each case gets its own scope. In JS all cases share the switch's scope, but
      // since fallthrough is not supported, a declaration can only be used in its own case.
      ctx.stack.push({ declaredNames: [] });
      try {
        const body = switchCase.consequent.flatMap((statement) =>
          statement.type === 'VariableDeclaration'
            ? transpileVariableDeclaration(ctx, statement, transpile)
            : [transpile(ctx, statement) as tinyest.Statement],
        );
        return [test, body];
      } finally {
        ctx.stack.pop();
      }
    });

    return [NODE.switch, discriminant, cases];
  },

  DoWhileStatement(ctx, node, transpile) {
    const body = transpile(ctx, node.body) as tinyest.Statement;
    const condition = transpile(ctx, node.test) as tinyest.Expression;

    return [NODE.doWhile, body, condition];
  },

  ForOfStatement(ctx, node, transpile) {
    ctx.stack.push({ declaredNames: [] });

    if (
      node.left.type === 'VariableDeclaration' &&
      node.left.declarations[0]?.id.type !== 'Identifier'
    ) {
      throw new Error('Destructuring in `for...of` heads is not supported.');
    }

    const loopVar = transpile(ctx, node.left) as tinyest.Const | tinyest.Let;
    const iterable = transpile(ctx, node.right) as tinyest.Expression;
    const body = transpile(ctx, node.body) as tinyest.Statement;

    ctx.stack.pop();

    return [NODE.forOf, loopVar, iterable, body];
  },

  ContinueStatement() {
    return [NODE.continue];
  },

  BreakStatement() {
    return [NODE.break];
  },
} satisfies Pick<Transpilers<JsNode>, SharedTranspilers>;

export function transpileAcornProperty(
  ctx: Context,
  node: acorn.Property,
  transpile: Transpile<acorn.AnyNode>,
): tinyest.ObjectProperty {
  if (node.computed) {
    const key = transpile(ctx, node.key) as tinyest.Expression;
    const value = transpile(ctx, node.value) as tinyest.Expression;

    return [key, value, true];
  }

  if (
    (node.key.type !== 'Identifier' && node.key.type !== 'Literal') ||
    (node.key.type === 'Literal' && (node.key.raw === null || node.key.regex))
  ) {
    throw new Error(`Unsupported non-computed object property key.`);
  }

  const key = node.key.type === 'Identifier' ? node.key.name : String(node.key.value);
  const value = transpile(ctx, node.value) as tinyest.Expression;
  return [key, value, false];
}

const acornSpecificTranspilers = {
  Literal(_ctx, node) {
    if (node.regex) {
      throw new Error('Regular expression literals are not representable in WGSL.');
    }
    if (node.raw === 'null') {
      return [NODE.nullLiteral];
    }
    if (typeof node.value === 'boolean') {
      return node.value;
    }
    if (typeof node.value === 'string') {
      return [NODE.stringLiteral, node.value];
    }
    if (node.bigint) {
      console.warn('BigInt literals are represented as numbers - loss of precision may occur.');
    }
    return [NODE.numericLiteral, String(Number(node.value))];
  },

  ObjectExpression(ctx, node, transpile) {
    const objectProperties = node.properties.map((prop) => {
      // TODO: Handle SpreadElement
      if (prop.type === 'SpreadElement') {
        throw new Error('Spread elements are not supported in TGSL.');
      }

      // TODO: Handle Object method
      if (prop.method) {
        throw new Error('Object method elements are not supported in TGSL.');
      }

      return transpileAcornProperty(ctx, prop, transpile);
    });

    if (objectProperties.some((prop) => /* computed */ prop[2])) {
      return [NODE.objectExpr, objectProperties] as tinyest.ObjectExpression;
    }

    const obj: Record<string, tinyest.Expression> = {};
    const seenKeys = new Set<string>();

    for (const prop of objectProperties) {
      const key = prop[0] as string;
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate object property key: '${key}'.`);
      }
      seenKeys.add(key);
      obj[key] = /* value */ prop[1];
    }

    return [NODE.objectExpr, obj] as tinyest.ObjectExpression;
  },
} satisfies Transpilers<acorn.AnyNode>;

export const acornTranspilers = {
  ...(baseTranspilers as Pick<Transpilers<acorn.AnyNode>, SharedTranspilers>),
  ...acornSpecificTranspilers,
} satisfies Transpilers<acorn.AnyNode>;

const tsFallthrough = (
  ctx: Context,
  node: { expression: babel.Expression },
  transpile: Transpile<babel.Node>,
) => {
  return transpile(ctx, node.expression);
};

export function transpileBabelObjectProperty(
  ctx: Context,
  node: babel.ObjectProperty,
  transpile: Transpile<babel.Node>,
): tinyest.ObjectProperty {
  if (node.computed) {
    const key = transpile(ctx, node.key) as tinyest.Expression;
    const value = transpile(ctx, node.value) as tinyest.Expression;

    return [key, value, true];
  }

  let key: string;
  switch (node.key.type) {
    case 'Identifier':
      key = node.key.name;
      break;
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BigIntLiteral':
      key = String(node.key.value);
      break;
    default:
      throw new Error(`Unsupported non-computed object property key.`);
  }

  const value = transpile(ctx, node.value) as tinyest.Expression;
  return [key, value, false];
}

const babelSpecificTranspilers = {
  NumericLiteral(_ctx, node) {
    return [NODE.numericLiteral, String(node.value)];
  },

  BigIntLiteral(_ctx, node) {
    console.warn('BigInt literals are represented as numbers - loss of precision may occur.');
    return [NODE.numericLiteral, String(Number(node.value))];
  },

  BooleanLiteral(_ctx, node) {
    return node.value;
  },

  StringLiteral(_ctx, node) {
    return [NODE.stringLiteral, node.value];
  },

  NullLiteral() {
    return [NODE.nullLiteral];
  },

  ObjectExpression(ctx, node, transpile) {
    const objectProperties = node.properties.map((prop) => {
      // TODO: Handle SpreadElement
      if (prop.type === 'SpreadElement') {
        throw new Error('Spread elements are not supported in TGSL.');
      }
      // TODO: Handle Object method
      if (prop.type === 'ObjectMethod') {
        throw new Error('Object method elements are not supported in TGSL.');
      }

      return transpileBabelObjectProperty(ctx, prop, transpile);
    });

    if (objectProperties.some((prop) => /* computed */ prop[2])) {
      return [NODE.objectExpr, objectProperties] as tinyest.ObjectExpression;
    }

    const obj: Record<string, tinyest.Expression> = {};
    const seenKeys = new Set<string>();

    for (const prop of objectProperties) {
      const key = prop[0] as string;
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate object property key: '${key}'.`);
      }
      seenKeys.add(key);
      obj[key] = /* value */ prop[1];
    }

    return [NODE.objectExpr, obj] as tinyest.ObjectExpression;
  },

  TSAsExpression: tsFallthrough,
  TSSatisfiesExpression: tsFallthrough,
  TSNonNullExpression: tsFallthrough,
} satisfies Transpilers<babel.Node>;

export const babelTranspilers = {
  ...(baseTranspilers as Pick<Transpilers<babel.Node>, SharedTranspilers>),
  ...babelSpecificTranspilers,
} satisfies Transpilers<babel.Node>;
