import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

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
      rollupTypes: true,
      tsconfigPath: './tsconfig.json',
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
      external: ['vue', '@agou/liquid-glass-core'],
    },
  },
})
