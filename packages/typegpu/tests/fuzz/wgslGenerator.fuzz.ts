/**
 * Fuzzes the shader generator: generates random `'use gpu'` programs, resolves them with
 * `tgpu.resolve` and validates the resulting WGSL with the `naga` CLI.
 *
 *   pnpm --filter typegpu test:fuzz
 *   FUZZ_SEED=123 FUZZ_COUNT=10000 pnpm --filter typegpu test:fuzz
 *
 * Needs `naga` on the PATH (`cargo install naga-cli`), skips otherwise.
 */

import Babel from '@babel/standalone';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import babelPlugin from 'unplugin-typegpu/babel';
import { expect, test } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { generators, type Program, Rng } from './generators.ts';

const seed = Number(process.env.FUZZ_SEED ?? Date.now() % 1_000_000);
const count = Number(process.env.FUZZ_COUNT ?? 2000);
const BATCH_SIZE = 250;

const nagaAvailable = spawnSync('naga', ['--version']).status === 0;

interface KnownFailure {
  matches: (program: Program, message: string) => boolean;
}

/**
 * Invalid WGSL the generator is known to emit today. Each entry is a TypeGPU bug: remove it
 * once the bug is fixed, so that a regression shows up as a failure.
 */
const knownFailures: Record<string, KnownFailure> = {
  // Binary operators on operand types WGSL has no overload for (`f32 ^ f32`, `bool * bool`,
  // `vec3f & vec3f`, `vec4h * mat4x4f`, ...) are emitted as is instead of being rejected.
  uncheckedBinaryOperator: {
    matches: ({ generator, shape }, message) =>
      generator === 'operator' &&
      (/Operation \w+ can't work with|Abstract types may only appear in constant expressions|failed to convert expression to a concrete type|type mismatch for reject and accept values/.test(
        message,
      ) ||
        (['&', '|', '^'].includes(shape.op as string) &&
          /automatic conversions cannot convert/.test(message))),
  },
  // Indexing an array with a non-integer or vector expression is emitted as is.
  nonIntegerIndex: {
    matches: ({ generator, shape }, message) =>
      generator === 'operator' && shape.pos === 'index' && /Accessing with index/.test(message),
  },
  // `2 << x` with a runtime `x` keeps an integer type and is not converted where an `f32` is
  // expected.
  abstractIntegerShift: {
    matches: ({ generator, shape }, message) =>
      generator === 'operator' &&
      ['<<', '>>'].includes(shape.op as string) &&
      shape.lt === 'abstractInt' &&
      /Composing 0's component type|automatic conversions cannot convert/.test(message),
  },
  // A constant array index that is out of bounds (`arr[5u << 3]`) is emitted as is.
  constantIndexOutOfBounds: {
    matches: ({ generator, shape }, message) =>
      generator === 'operator' &&
      shape.pos === 'index' &&
      /Accessing index \d+ is out of \[\d+\] bounds/.test(message),
  },
  // `r op= x` with an `x` that does not convert to the type of `r` is emitted as is.
  uncheckedCompoundAssignment: {
    matches: ({ generator, shape }, message) =>
      generator === 'operator' &&
      shape.pos === 'compound' &&
      /automatic conversions cannot convert|doesn't match the type stored/.test(message),
  },
  // `scalar % vector` is given the scalar's type instead of the vector's.
  scalarModuloVector: {
    matches: ({ generator, shape }, message) =>
      generator === 'operator' &&
      shape.op === '%' &&
      !/^(vec|mat)/.test(shape.lt as string) &&
      (shape.rt as string).startsWith('vec') &&
      /Expected reject and accept args|Expected selection argument types to match|cannot cast a vec|Composing 0's component type|automatic conversions cannot convert `vec|doesn't match the type/.test(
        message,
      ),
  },
  // `d.vecNf(v, v, v)` with vector arguments is emitted as is, with too many components.
  oversizedVectorConstructor: {
    matches: ({ generator, shape }, message) =>
      generator === 'conversion' &&
      shape.site === 'ctorArgs' &&
      /Composing expects \d+ components but \d+ were given/.test(message),
  },
  // A value of a type that does not convert to the target type is emitted as is at
  // assignments, struct fields, array elements, return values and constructor calls.
  uncheckedConversion: {
    matches: ({ generator, shape }, message) =>
      generator === 'conversion' &&
      shape.tt !== shape.st &&
      /automatic conversions cannot convert|doesn't match the type stored|cannot cast a|Composing|does not match the declared return type|doesn't match the type|Abstract types may only appear in constant expressions|cannot represent the abstract value/.test(
        message,
      ),
  },
  // Constant integer expressions (`3 ^ -1`, shifts) are evaluated with WGSL's 64-bit abstract
  // integer rules instead of JS's 32-bit ones, giving values the concrete type cannot hold.
  abstractIntegerConstants: {
    matches: ({ generator }, message) =>
      generator === 'statements' &&
      /cannot represent the abstract value|numeric literal not representable/.test(message),
  },
  // `f += x` with an `i32` `x` (e.g. a helper whose return type was inferred from `100.0`,
  // which is an integer in JS) is emitted as is.
  uncheckedIntegerToFloatAssignment: {
    matches: ({ generator }, message) =>
      generator === 'statements' &&
      /automatic conversions cannot convert elements of `i32` to `f32`/.test(message),
  },
  // Integer division by a constant zero (`x /= 0i`) is emitted as is.
  integerDivisionByZero: {
    matches: ({ generator }, message) =>
      generator === 'statements' && /Division by zero/.test(message),
  },
  // `std.normalize` of a constant zero vector is emitted as a constant expression.
  constantNormalizeOfZero: {
    matches: ({ generator }, message) =>
      generator === 'statements' &&
      /normalize built-in function argument is out of valid range/.test(message),
  },
};

/**
 * Valid WGSL that `naga` rejects. Not TypeGPU bugs.
 */
const validatorGaps: Record<string, KnownFailure> = {
  // naga does not support assignments to swizzles yet (`v.xy = ...`).
  swizzleAssignment: {
    matches: ({ generator }, message) =>
      generator === 'statements' && /WGSL does not support assignments to swizzles/.test(message),
  },
};

type Outcome =
  | { kind: 'valid' }
  | { kind: 'rejected'; message: string }
  | { kind: 'crashed'; message: string }
  | { kind: 'invalid'; wgsl: string; message: string };

function resolveProgram(program: Program): { wgsl: string } | Exclude<Outcome, { kind: 'valid' }> {
  const code = Babel.transform(`function __program(tgpu, d, std) {\n${program.source}\n}`, {
    plugins: [[babelPlugin, { forceTgpuAlias: 'tgpu', autoNamingEnabled: false }]],
  }).code;
  // oxlint-disable-next-line typescript/no-implied-eval -- running generated test programs
  const run = new Function(`${code}\nreturn __program;`)() as (
    ...args: unknown[]
  ) => Parameters<typeof tgpu.resolve>[0];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return { wgsl: tgpu.resolve(run(tgpu, d, std), { enableExtensions: ['f16'] }) };
  } catch (error) {
    let leaf = error;
    while (leaf instanceof Error && leaf.cause && leaf.cause !== leaf) {
      leaf = leaf.cause;
    }
    const message = leaf instanceof Error ? `${leaf.name}: ${leaf.message}` : String(leaf);
    const crashed =
      leaf instanceof TypeError || leaf instanceof ReferenceError || leaf instanceof RangeError;
    return { kind: crashed ? 'crashed' : 'rejected', message };
  } finally {
    console.warn = originalWarn;
  }
}

/** Validates many shaders with one `naga` process, returns the error message per index. */
function validate(shaders: Map<number, string>): Map<number, string> {
  const dir = mkdtempSync(join(tmpdir(), 'tgpu-fuzz-'));
  try {
    for (const [i, wgsl] of shaders) {
      writeFileSync(join(dir, `${i}.wgsl`), wgsl);
    }
    const files = [...shaders.keys()].map((i) => `${i}.wgsl`);
    const result = spawnSync('naga', ['--bulk-validate', ...files], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    });
    const output = `${result.stdout}${result.stderr}`;
    if (result.error) {
      throw new Error(`Running naga failed: ${result.error.message}`);
    }
    const errors = new Map<number, string>();
    const [body = '', failedList = ''] = output.split(
      /^Validation failed for the following inputs:$/m,
    );
    const parts = body.split(/^Error validating (\S+)\.wgsl:$/m);
    for (let j = 1; j < parts.length; j += 2) {
      errors.set(Number(parts[j]), (parts[j + 1] ?? '').trim());
    }
    const failed = failedList.match(/\S+(?=\.wgsl)/g) ?? [];
    const consistent =
      result.status === (errors.size ? 1 : 0) &&
      failed.length === errors.size &&
      failed.every((name) => errors.has(Number(name)));
    if (!consistent) {
      throw new Error(
        `Unexpected naga output (exit status ${result.status}, signal ${result.signal}, ${errors.size} errors parsed, ${failed.length} inputs listed as failed):\n${output.slice(0, 4000)}`,
      );
    }
    return errors;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function classify(program: Program, message: string): string | undefined {
  for (const [name, entry] of [
    ...Object.entries(knownFailures),
    ...Object.entries(validatorGaps),
  ]) {
    if (entry.matches(program, message)) {
      return name;
    }
  }
  return undefined;
}

test.skipIf(!nagaAvailable)('generated WGSL passes validation', () => {
  const names = Object.keys(generators) as (keyof typeof generators)[];
  const programs: Program[] = [];
  const outcomes: Outcome[] = [];

  for (let start = 0; start < count; start += BATCH_SIZE) {
    const toValidate = new Map<number, string>();
    for (let i = start; i < Math.min(start + BATCH_SIZE, count); i++) {
      const rng = new Rng(seed * 1_000_003 + i);
      let program: Program | null = null;
      while (!program) {
        program = generators[names[i % names.length] as keyof typeof generators](rng);
      }
      programs[i] = program;
      const result = resolveProgram(program);
      if ('wgsl' in result) {
        toValidate.set(i, result.wgsl);
        outcomes[i] = { kind: 'valid' };
      } else {
        outcomes[i] = result;
      }
    }
    for (const [i, message] of validate(toValidate)) {
      outcomes[i] = { kind: 'invalid', wgsl: toValidate.get(i) as string, message };
    }
  }

  const summary: Record<string, number> = { valid: 0, rejected: 0 };
  const failures: string[] = [];
  outcomes.forEach((outcome, i) => {
    const program = programs[i] as Program;
    if (outcome.kind === 'valid' || outcome.kind === 'rejected') {
      summary[outcome.kind] = (summary[outcome.kind] ?? 0) + 1;
      return;
    }
    const known = outcome.kind === 'invalid' ? classify(program, outcome.message) : undefined;
    if (known) {
      summary[known] = (summary[known] ?? 0) + 1;
      return;
    }
    failures.push(
      [
        `--- program ${i} (${program.generator} ${JSON.stringify(program.shape)}) ---`,
        program.source,
        ...(outcome.kind === 'invalid'
          ? ['--- generated WGSL ---', outcome.wgsl, '--- naga ---']
          : ['--- error during resolution ---']),
        outcome.message,
      ].join('\n'),
    );
  });

  process.stdout.write(
    `seed ${seed}, ${count} programs, ${failures.length} unexpected failures\n${Object.entries(
      summary,
    )
      .map(([name, n]) => `  ${name}: ${n}`)
      .join('\n')}\n`,
  );
  if (failures.length) {
    process.stdout.write(
      `First unexpected failure (reproduce with FUZZ_SEED=${seed} FUZZ_COUNT=${count}):\n${failures[0]}\n`,
    );
  }
  expect(failures.length, `seed ${seed}`).toBe(0);
});

test.skipIf(nagaAvailable)('naga is not installed, skipping the shader generator fuzz test', () => {
  process.stdout.write(
    '`naga` was not found on the PATH. Install it with `cargo install naga-cli`.\n',
  );
});
