import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import solid from 'vite-plugin-solid';

/**
 * Vite library build configuration for @agou/liquid-glass-solid.
 *
 * Externals:
 *   - solid-js (peer dependency)
 *   - @agou/liquid-glass-core (peer dependency)
 */
export default defineConfig({
  plugins: [
    solid(),
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
      name: 'LiquidGlassSolid',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['@agou/liquid-glass-core', /^solid-js(?:\/.*)?$/],
    },
  },
});
