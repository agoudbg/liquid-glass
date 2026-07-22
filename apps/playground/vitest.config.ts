import { defineConfig } from 'vitest/config';

/**
 * Unit-test configuration for framework-neutral playground behavior.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
});
