import { typegpuBuiltAliases } from 'typegpu-testing-utility/config';
import { defineConfig } from 'vitest/config';

// Standalone config for the shader generator fuzz test (`pnpm --filter typegpu test:fuzz`).
// Not part of the root `projects`, and `*.fuzz.ts` does not match the default test globs,
// so the regular unit test runs never pick these files up.
export default defineConfig({
  resolve: {
    alias: typegpuBuiltAliases(),
  },
  test: {
    include: ['tests/**/*.fuzz.ts'],
    testTimeout: 600_000,
  },
});
