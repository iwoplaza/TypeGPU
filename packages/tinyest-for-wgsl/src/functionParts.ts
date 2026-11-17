import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';
import type { JsNode } from './types.ts';

type FunctionNode =
  | acorn.ArrowFunctionExpression
  | acorn.FunctionExpression
  | acorn.FunctionDeclaration
  | acorn.AnonymousFunctionDeclaration
  | babel.ArrowFunctionExpression
  | babel.FunctionExpression
  | babel.FunctionDeclaration;

/**
 * Unwraps the root node until we get to a function.
 */
function unwrapToFunction(rootNode: JsNode): FunctionNode {
  let functionNode: FunctionNode | null = null;

  let unwrappedNode = rootNode;
  while (true) {
    if (unwrappedNode.type === 'Program') {
      const statement = unwrappedNode.body.filter(
        (n) => n.type === 'ExpressionStatement' || n.type === 'FunctionDeclaration',
      )[0]; // <- assuming only one function declaration

      if (!statement) {
        break;
      }

      unwrappedNode = statement;
    } else if (unwrappedNode.type === 'ExpressionStatement') {
      unwrappedNode = unwrappedNode.expression;
    } else if (unwrappedNode.type === 'ArrowFunctionExpression') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else if (unwrappedNode.type === 'FunctionExpression') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else if (unwrappedNode.type === 'FunctionDeclaration') {
      functionNode = unwrappedNode;
      break; // We got a function
    } else {
      // Unsupported node
      break;
    }
  }

  if (!functionNode) {
    throw new Error(
      `tgpu.fn expected a single function to be passed as implementation ${JSON.stringify(
        unwrappedNode,
      )}`,
    );
  }

  return functionNode;
}

/**
 * Rejects TypeGPU functions that cannot be represented.
 */
function validateFunction(functionNode: FunctionNode): void {
  if (functionNode.async) {
    throw new Error('tgpu.fn cannot be async');
  }

  if (functionNode.generator) {
    throw new Error('tgpu.fn cannot be a generator');
  }

  const unsupportedTypes = new Set(
    functionNode.params.flatMap((param) =>
      param.type === 'ObjectPattern' || param.type === 'Identifier' ? [] : [param.type],
    ),
  );
  if (unsupportedTypes.size > 0) {
    throw new Error(`Unsupported function parameter type(s): ${[...unsupportedTypes].join(', ')}`);
  }
}

type ObjectPatternProperty = (babel.ObjectPattern | acorn.ObjectPattern)['properties'][number];

function parseDestructuredProp(prop: ObjectPatternProperty): { name: string; alias: string } {
  if (prop.type === 'RestElement') {
    throw new Error('Rest elements in destructured parameters are not supported in TGSL.');
  }

  if (prop.computed || prop.key.type !== 'Identifier') {
    throw new Error('Only identifier keys are supported in destructured parameters in TGSL.');
  }

  if (prop.value.type === 'AssignmentPattern') {
    throw new Error(
      `Default values in destructured parameters are not supported in TGSL ('${prop.key.name}').`,
    );
  }

  if (prop.value.type !== 'Identifier') {
    throw new Error(
      `Nested destructuring in parameters is not supported in TGSL ('${prop.key.name}').`,
    );
  }

  return { name: prop.key.name, alias: prop.value.name };
}

function parseParams(functionNode: FunctionNode): tinyest.FuncParameter[] {
  return (
    functionNode.params as (
      | babel.Identifier
      | acorn.Identifier
      | babel.ObjectPattern
      | acorn.ObjectPattern
    )[]
  ).map((param) =>
    param.type === 'ObjectPattern'
      ? {
          type: tinyest.FuncParameterType.destructuredObject,
          props: param.properties.map(parseDestructuredProp),
        }
      : {
          type: tinyest.FuncParameterType.identifier,
          name: param.name,
        },
  );
}

export function extractFunctionParts(rootNode: JsNode): {
  params: tinyest.FuncParameter[];
  body: acorn.BlockStatement | acorn.Expression | babel.BlockStatement | babel.Expression;
} {
  const functionNode = unwrapToFunction(rootNode);

  validateFunction(functionNode);

  return {
    params: parseParams(functionNode),
    body: functionNode.body,
  };
}
