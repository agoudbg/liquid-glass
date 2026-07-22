import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

/** Component-test configuration for the Vue adapter. */
export default defineConfig({
  plugins: [vue()],
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
