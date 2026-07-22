import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

/**
 * Vite configuration for the framework-neutral playground shell.
 */
export default defineConfig({
  plugins: [
    vue(),
    react({
      include: /src\/hosts\/react\/.*\.[jt]sx$/,
    }),
    solid({
      include: /src\/hosts\/solid\/.*\.[jt]sx$/,
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
