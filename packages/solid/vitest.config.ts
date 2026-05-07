import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for @agou/liquid-glass-solid.
 *
 * Uses 'node' environment since Phase 0 smoke tests don't need DOM.
 * Will be changed to 'jsdom' in Phase 5 when component tests are added.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
