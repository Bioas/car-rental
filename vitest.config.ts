import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The suite drives the real Express app against a throwaway SQLite file.
    include: ['api/__tests__/**/*.test.mjs'],
    // Each file prepares its own database, so files are independent; running
    // them one at a time keeps the output readable and avoids spinning up
    // several sql.js instances at once.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
