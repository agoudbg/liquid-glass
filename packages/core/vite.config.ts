import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

/**
 * Vite library build configuration for @agou/liquid-glass-core.
 *
 * Produces:
 *   - dist/index.js (ESM)
 *   - dist/index.d.ts (rolled-up type declarations)
 *
 * No externals — core package bundles html-to-image as a regular dependency.
 */
export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      tsconfigPath: './tsconfig.json',
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
  },
})
