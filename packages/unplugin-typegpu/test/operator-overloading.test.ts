import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { babelTransform, rollupTransform } from './transform.ts';

const code = `\
  ctx.f = (a, b) => {
    'use gpu';
    let r = a * b + a;
    r -= 1;
    r /= 2;
    r %= 3;
    return r;
  };
`;

const runtimeFns = ['add', 'sub', 'mul', 'div', 'mod'].map((op) => `__tsover_${op}`);
const globals = globalThis as Record<string, unknown>;

function evaluate(transformed: string | null | undefined) {
  const ctx: { f?: (a: unknown, b: unknown) => unknown } = {};
  // oxlint-disable-next-line typescript-eslint/no-implied-eval
  new Function('ctx', transformed ?? '')(ctx);
  if (!ctx.f) {
    throw new Error('Expected the code to define ctx.f');
  }
  return ctx.f;
}

describe.each([
  ['babel', babelTransform],
  ['rollup', rollupTransform],
])('operators in "use gpu" functions transformed with %s', (_, transform) => {
  let previous: Record<string, unknown>;

  beforeEach(() => {
    previous = Object.fromEntries(runtimeFns.map((name) => [name, globals[name]]));
    for (const name of runtimeFns) {
      delete globals[name];
    }
  });

  afterEach(() => {
    for (const name of runtimeFns) {
      globals[name] = previous[name];
    }
  });

  it('work on numbers when tsover-runtime was never evaluated', async () => {
    const f = evaluate(await transform(code));
    expect(f(2, 3)).toBe(0.5);
  });

  it('go through the tsover-runtime functions once they are installed', async () => {
    const f = evaluate(await transform(code));
    for (const name of runtimeFns) {
      globals[name] = (a: unknown, b: unknown) => `${name.slice('__tsover_'.length)}(${a}, ${b})`;
    }
    expect(f(2, 3)).toBe('mod(div(sub(add(mul(2, 3), 2), 1), 2), 3)');
  });
});
