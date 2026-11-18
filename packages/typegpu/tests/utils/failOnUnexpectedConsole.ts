import { afterEach, beforeEach } from 'vitest';

/**
 * Fails any test that logs a warning or an error it didn't expect.
 *
 * To expect one, spy on the console method (which keeps it from reaching this guard) and assert
 * on the spy:
 * ```ts
 * using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
 * // ...
 * expect(warnSpy).toHaveBeenCalledWith(...);
 * ```
 */

/**
 * Files with tests that log warnings nobody asserts on. Remove a file from this list once its
 * tests either expect their warnings or no longer cause them.
 */
const unguardedFiles = new Set([
  'tests/abstractCast.test.ts',
  'tests/accessor.test.ts',
  'tests/array.test.ts',
  'tests/bindGroupLayout.test.ts',
  'tests/computePipeline.test.ts',
  'tests/entryFnHeaderGen.test.ts',
  'tests/externalPropAccess.test.ts',
  'tests/internal/capturedSnippets.test.ts',
  'tests/internal/jitPreference.lazyProbe.test.ts',
  'tests/internal/renderPipeline.test.ts',
  'tests/jsMath.test.ts',
  'tests/mutabilityTracking.test.ts',
  'tests/renderPipeline.test.ts',
  'tests/resolve.test.ts',
  'tests/root.test.ts',
  'tests/std/boolean/select.test.ts',
  'tests/std/matrix/rotate.test.ts',
  'tests/std/numeric/bitShift.test.ts',
  'tests/std/numeric/div.test.ts',
  'tests/std/numeric/max.test.ts',
  'tests/std/numeric/min.test.ts',
  'tests/std/numeric/mul.test.ts',
  'tests/std/range.test.ts',
  'tests/std/texture/textureGather.test.ts',
  'tests/std/texture/textureQueries.test.ts',
  'tests/struct.test.ts',
  'tests/switch.test.ts',
  'tests/tgpuGenericFn.test.ts',
  'tests/tgsl/accessIndexOrigin.test.ts',
  'tests/tgsl/assignment.test.ts',
  'tests/tgsl/binaryLogicalOps.test.ts',
  'tests/tgsl/consoleLog.test.ts',
  'tests/tgsl/conversion.test.ts',
  'tests/tgsl/extensionEnabled.test.ts',
  'tests/tgsl/infixOperators.test.ts',
  'tests/tgsl/nameClashes.test.ts',
  'tests/tgsl/shellless.test.ts',
  'tests/tgsl/ternaryOperator.test.ts',
  'tests/tgsl/typeInference.test.ts',
  'tests/tgsl/wgslGenerator.test.ts',
  'tests/tgslFn.test.ts',
  'tests/unroll.test.ts',
  'tests/vector.test.ts',
]);

const methods = ['warn', 'error'] as const;
const originals = { warn: console.warn, error: console.error };
const unexpected: string[] = [];

beforeEach(({ task }) => {
  unexpected.length = 0;
  if (unguardedFiles.has(task.file.name)) {
    return;
  }

  for (const method of methods) {
    console[method] = (...args: unknown[]) => {
      unexpected.push(`console.${method}: ${args.map(String).join(' ')}`);
      originals[method](...args);
    };
  }
});

afterEach(() => {
  for (const method of methods) {
    console[method] = originals[method];
  }

  if (unexpected.length > 0) {
    throw new Error(
      `Unexpected console output (spy on the console method to expect it):\n${unexpected.join('\n')}`,
    );
  }
});
