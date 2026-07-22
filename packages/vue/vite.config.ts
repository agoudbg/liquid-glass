import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * Vite library build configuration for @agou/liquid-glass-vue.
 *
 * Externals:
 *   - vue (peer dependency)
 *   - @agou/liquid-glass-core (peer dependency)
 */
export default defineConfig({
  plugins: [
    vue(),
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
      name: 'LiquidGlassVue',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['@agou/liquid-glass-core', /^vue(?:\/.*)?$/],
    },
  },
});
