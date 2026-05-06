import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

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
      rollupTypes: true,
      tsconfigPath: './tsconfig.json',
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
      external: ['react', 'react-dom', '@agou/liquid-glass-core'],
    },
  },
})
