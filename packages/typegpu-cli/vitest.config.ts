import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __WORKSPACE_PACKAGE_VERSIONS__: '{}',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
