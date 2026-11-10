import { defineConfig } from 'vitest/config';

// One test run for the whole monorepo: core logic and source adapters.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
