import { describe, expect, it } from 'vitest';
import { getTranspilationErrorNode } from 'tinyest-for-wgsl';
import { dualTest } from './helpers.ts';

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected to throw');
}

describe('getTranspilationErrorNode', () => {
  it(
    'points to the innermost node that could not be transpiled',
    dualTest((p, transpileFn) => {
      const code = `() => {
        if (true) {
          return foo(1, \`x\`);
        }
      }`;
      const error = catchError(() => transpileFn(p(code)));

      expect(error).toMatchInlineSnapshot(`[Error: Unsupported JS functionality: TemplateLiteral]`);
      expect(getTranspilationErrorNode(error)).toMatchObject({
        type: 'TemplateLiteral',
        start: code.indexOf('`x`'),
      });
    }),
  );

  it(
    'points to the function when its signature is unsupported',
    dualTest((p, transpileFn) => {
      const code = `(...args) => {}`;
      const error = catchError(() => transpileFn(p(code)));

      expect(getTranspilationErrorNode(error)).toMatchObject({ start: 0 });
    }),
  );

  it('returns undefined for unrelated errors', () => {
    expect(getTranspilationErrorNode(new Error('unrelated'))).toBeUndefined();
    expect(getTranspilationErrorNode('not an error')).toBeUndefined();
  });
});
