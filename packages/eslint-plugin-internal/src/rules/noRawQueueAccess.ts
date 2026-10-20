import { createRule } from '../ruleCreator.ts';

export const noRawQueueAccess = createRule({
  name: 'no-raw-queue-access',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `device.queue` in TypeGPU, where `getQueue(device)` keeps queue operations in order with batched submits',
    },
    messages: {
      rawQueue:
        'Use `getQueue(device)` from core/queue.ts, which first submits work that was batched before this operation.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      MemberExpression(node) {
        if (
          !node.computed &&
          node.property.type === 'Identifier' &&
          node.property.name === 'queue'
        ) {
          context.report({ node, messageId: 'rawQueue' });
        }
      },
    };
  },
});
