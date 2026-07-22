import { defineConfig } from 'vitest/config';

/** Unit-test configuration for framework-independent core behavior. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
