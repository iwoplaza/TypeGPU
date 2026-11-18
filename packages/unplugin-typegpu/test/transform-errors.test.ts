import { describe, expect, test } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

describe('transform errors', () => {
  const code = `\
const fn = () => {
  'use gpu';
  const a = 1;
  const b = a + 1;
  return \`\${b}\`;
};
`;

  test('[BABEL]', () => {
    expect(() => babelTransform(code)).toThrowErrorMatchingInlineSnapshot(`
      [Error: unknown file: Unsupported JS functionality: TemplateLiteral
        3 |   const a = 1;
        4 |   const b = a + 1;
      > 5 |   return \`\${b}\`;
          |          ^^^^^^
        6 | };
        7 |]
    `);
  });

  test('[ROLLUP]', async () => {
    const error = await rollupTransform(code).catch((e: unknown) => e);
    expect(error).toMatchObject({
      message: expect.stringContaining('Unsupported JS functionality: TemplateLiteral'),
      plugin: 'unplugin-typegpu',
      id: '\0virtual:code',
      loc: { file: '\0virtual:code', line: 5, column: 9 },
    });
    expect((error as { frame: string }).frame).toMatchInlineSnapshot(`
      "3:   const a = 1;
      4:   const b = a + 1;
      5:   return \`\${b}\`;
                  ^
      6: };"
    `);
  });
});

describe('transform errors in function signatures', () => {
  const code = `\
const a = 1;

const fn = (...args) => {
  'use gpu';
  return 1;
};
`;

  test('[BABEL]', () => {
    expect(() => babelTransform(code)).toThrowErrorMatchingInlineSnapshot(`
      [Error: unknown file: Unsupported function parameter type(s): RestElement
        1 | const a = 1;
        2 |
      > 3 | const fn = (...args) => {
          |            ^
        4 |   'use gpu';
        5 |   return 1;
        6 | };]
    `);
  });

  test('[ROLLUP]', async () => {
    await expect(rollupTransform(code)).rejects.toMatchObject({
      loc: { line: 3, column: 11 },
    });
  });
});
