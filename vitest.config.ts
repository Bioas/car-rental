import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['api/__tests__/**/*.test.mjs', 'api/__tests__/**/*.test.cjs'],
    exclude: ['**/node_modules/**', '**/.git/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
  },
});
