import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import solid from 'vite-plugin-solid';

/**
 * Vite library build configuration for @agou/liquid-glass-solid.
 *
 * Externals:
 *   - solid-js (peer dependency)
 *   - @agou/liquid-glass-core (runtime dependency)
 */
export default defineConfig(({ mode }) => {
  const isSsrBuild = mode === 'ssr';
  return {
    plugins: [
      solid({ ssr: isSsrBuild }),
      ...isSsrBuild
        ? []
        : [
            dts({
              entryRoot: 'src',
              include: ['src'],
              rollupTypes: true,
              tsconfigPath: './tsconfig.build.json',
            }),
          ],
    ],
    build: {
      emptyOutDir: !isSsrBuild,
      outDir: 'dist',
      sourcemap: true,
      minify: false,
      ...isSsrBuild
        ? {
            ssr: './src/index.ts',
            rollupOptions: {
              external: ['@agou/liquid-glass-core', /^solid-js(?:\/.*)?$/],
              output: { entryFileNames: 'ssr.js' },
            },
          }
        : {
            lib: {
              entry: './src/index.ts',
              name: 'LiquidGlassSolid',
              formats: ['es'] as const,
              fileName: () => 'index.js',
            },
            rollupOptions: {
              external: ['@agou/liquid-glass-core', /^solid-js(?:\/.*)?$/],
            },
          },
    },
  };
});
