import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * Vite library build configuration for @agou/liquid-glass-react.
 *
 * Externals:
 *   - react, react-dom (peer dependencies)
 *   - @agou/liquid-glass-core (peer dependency)
 */
export default defineConfig({
  plugins: [
    react(),
    dts({
      entryRoot: 'src',
      include: ['src'],
      rollupTypes: true,
      tsconfigPath: './tsconfig.build.json',
    }),
  ],
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'LiquidGlassReact',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: [
        '@agou/liquid-glass-core',
        /^react(?:\/.*)?$/,
        /^react-dom(?:\/.*)?$/,
      ],
    },
  },
});
