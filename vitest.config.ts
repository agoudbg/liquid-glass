import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Use jsdom for DOM simulation in tests
      environment: 'jsdom',
      // Include test files pattern
      include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
      // Coverage configuration
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          'src/demo/**',
          'src/**/*.d.ts',
          'src/vite-env.d.ts',
          'src/main.ts',
        ],
      },
      // Global test setup
      globals: true,
      // Setup files to run before each test file
      setupFiles: ['./src/__tests__/setup.ts'],
    },
  }),
);
