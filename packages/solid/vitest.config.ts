import { fileURLToPath } from 'node:url';

import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for @agou/liquid-glass-solid.
 *
 * Runs component behavior in a DOM-compatible environment.
 */
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@agou/liquid-glass-core': fileURLToPath(
        new URL('../core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
