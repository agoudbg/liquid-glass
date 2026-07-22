import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const source = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Vite configuration for the framework-neutral playground shell.
 */
export default defineConfig({
  plugins: [
    vue(),
    react({
      include: [
        /src[\\/]hosts[\\/]react[\\/].*\.[jt]sx$/,
        /packages[\\/]react[\\/]src[\\/].*\.[jt]sx$/,
      ],
    }),
    solid({
      include: [
        /src[\\/]hosts[\\/]solid[\\/].*\.[jt]sx$/,
        /packages[\\/]solid[\\/]src[\\/].*\.[jt]sx$/,
      ],
    }),
  ],
  resolve: {
    alias: {
      '@agou/liquid-glass-core': source('../../packages/core/src/index.ts'),
      '@agou/liquid-glass-react': source('../../packages/react/src/index.ts'),
      '@agou/liquid-glass-solid': source('../../packages/solid/src/index.ts'),
      '@agou/liquid-glass-vue': source('../../packages/vue/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
