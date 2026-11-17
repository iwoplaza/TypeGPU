import type { TSESTree } from '@typescript-eslint/utils';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking, type FunctionNode } from '../enhancers/directiveTracking.ts';
import { createRule } from '../ruleCreator.ts';

export const noUnsupportedSyntax = createRule({
  name: 'no-unsupported-syntax',
  meta: {
    type: 'problem',
    docs: {
      description: `Disallow JS syntax that will not be parsed into valid WGSL.`,
    },
    messages: {
      unexpected:
        "'{{snippet}}' will not parse into valid WGSL because it uses unsupported syntax: {{syntax}}.",
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    function report(node: TSESTree.Node, syntax: string) {
      context.report({
        node,
        messageId: 'unexpected',
        data: { snippet: context.sourceCode.getText(node), syntax },
      });
    }

    function checkTypegpuFunction(node: FunctionNode) {
      if (directives.getEnclosingTypegpuFunction() !== node) {
        return;
      }
      if (node.async) {
        report(node, 'async function');
      }
      if (node.generator) {
        report(node, 'generator function');
      }
      for (const param of node.params) {
        if (param.type === 'RestElement') {
          report(param, 'rest parameter');
        } else if (param.type === 'ArrayPattern') {
          report(param, 'parameter using array destructuring');
        } else if (param.type === 'ObjectPattern') {
          checkDestructuredParam(param);
        }
      }
    }

    function checkDestructuredParam(param: TSESTree.ObjectPattern) {
      for (const prop of param.properties) {
        if (prop.type === 'RestElement') {
          report(prop, 'rest element in destructured parameter');
          continue;
        }
        if (prop.computed || prop.key.type !== 'Identifier') {
          report(prop, 'non-identifier key in destructured parameter');
        }
        if (prop.value.type === 'ObjectPattern' || prop.value.type === 'ArrayPattern') {
          report(prop, 'nested destructuring in parameter');
        }
      }
    }

    return {
      ArrowFunctionExpression(node) {
        if (directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')) {
          report(node, 'arrow function');
        }
        checkTypegpuFunction(node);
      },

      AssignmentExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (unsupportedAssignmentOps.includes(node.operator)) {
          report(node, `assignment expression '${node.operator}'`);
        }
      },

      AssignmentPattern(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'assignment pattern (default parameter)');
      },

      AwaitExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'await expression');
      },

      BinaryExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (unsupportedBinaryOps.includes(node.operator)) {
          report(node, `binary operator '${node.operator}'`);
        }
      },

      ChainExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'chain expression');
      },

      ClassDeclaration(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'class declaration');
      },

      ClassExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'class expression');
      },

      DoWhileStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'do-while loop');
      },

      EmptyStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'empty statement');
      },

      ForInStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'for-in loop');
      },

      FunctionDeclaration(node) {
        if (directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')) {
          report(node, 'function declaration');
        }
        checkTypegpuFunction(node);
      },

      FunctionExpression(node) {
        if (directives.getDirectiveStack().at(-2)?.directives.includes('use gpu')) {
          report(node, 'function expression');
        }
        checkTypegpuFunction(node);
      },

      LabeledStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'labeled statement');
      },

      Literal(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if ('regex' in node && node.regex) {
          report(node, 'regular expression literal');
        }
      },

      LogicalExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.operator === '??') {
          report(node, 'nullish coalescing');
        }
      },

      NewExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, `'new' expression`);
      },

      SequenceExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'sequence expression (comma operator)');
      },

      SpreadElement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'spread element');
      },

      TemplateLiteral(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'template literal');
      },

      ThrowStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'throw statement');
      },

      TryStatement(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'try-catch statement');
      },

      UnaryExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (unsupportedUnaryOps.includes(node.operator)) {
          report(node, `unary operator '${node.operator}'`);
        }
      },

      UpdateExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.prefix) {
          report(node, 'prefix update expression');
        }
      },

      VariableDeclaration(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.kind === 'var') {
          report(node, `'var' declaration`);
        }
        if (node.declarations.length > 1) {
          report(node, 'multiple variable declarations in one statement');
        }
      },

      VariableDeclarator(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        if (node.id.type !== 'Identifier') {
          report(node, 'variable declaration using destructuring');
        }
      },

      YieldExpression(node) {
        if (!directives.getEnclosingTypegpuFunction()) {
          return;
        }
        report(node, 'yield expression');
      },
    };
  }),
});

const unsupportedAssignmentOps = ['&&=', '**=', '||=', '??='];
const unsupportedBinaryOps = ['==', '!=', 'in', 'instanceof', '|>'];
const unsupportedUnaryOps = ['+', 'typeof', 'void', 'delete'];
