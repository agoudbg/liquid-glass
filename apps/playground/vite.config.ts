import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'

/**
 * Vite dev server configuration for the playground app.
 *
 * Hosts all framework demos side by side with HMR.
 * Vue, React, and Solid plugins are all loaded to support
 * .vue, .tsx, and .jsx files in the playground.
 */
export default defineConfig({
  plugins: [
    vue(),
    react(),
    // solid plugin will be added when solid demos are ready
  ],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
  },
})
