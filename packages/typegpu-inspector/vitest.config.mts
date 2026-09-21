import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'typegpu-inspector',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
