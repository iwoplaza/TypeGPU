import { describe } from 'vitest';
import { ruleTester } from '../utils/ruleTester.ts';
import { noRawQueueAccess } from '../../src/rules/noRawQueueAccess.ts';

describe('noRawQueueAccess', () => {
  ruleTester.run('noRawQueueAccess', noRawQueueAccess, {
    valid: [
      { code: 'getQueue(device).writeBuffer(buffer, 0, data);' },
      { code: "const queue = map['queue'];" },
      { code: 'const { queues } = state;' },
    ],
    invalid: [
      {
        code: 'device.queue.writeBuffer(buffer, 0, data);',
        errors: [{ messageId: 'rawQueue' }],
      },
      {
        code: 'this[$soul].device.queue.submit([encoder.finish()]);',
        errors: [{ messageId: 'rawQueue' }],
      },
    ],
  });
});
