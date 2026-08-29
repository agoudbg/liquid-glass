import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

/**
 * Vite library build configuration for @agou/liquid-glass-core.
 *
 * Produces:
 *   - dist/index.js (ESM)
 *   - dist/index.d.ts (rolled-up type declarations)
 *
 * Externals:
 *   - html-to-image (regular runtime dependency)
 *   - html2canvas (optional package dependency loaded only when selected)
 */
export default defineConfig({
  plugins: [
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
      name: 'LiquidGlassCore',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ['html-to-image', 'html2canvas'],
    },
  },
});
