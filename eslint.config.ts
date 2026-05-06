import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import simpleImportSort from 'eslint-plugin-simple-import-sort'

/**
 * ESLint 9 flat configuration for the entire monorepo.
 *
 * Rules:
 * - Strict TypeScript: no `any`, explicit return types on public API
 * - Single quotes, 2-space indent
 * - Consistent import ordering via simple-import-sort
 */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // Import ordering
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',

      // Style
      'quotes': ['error', 'single', { avoidEscape: true }],
      'indent': ['error', 2, { SwitchCase: 1 }],
      'semi': ['error', 'never'],
      'no-console': 'off',
      'no-plusplus': 'off',

      // TypeScript-specific
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Event handler arguments in TypedEventEmitter are inherently dynamic
    // Allow `any` only for event handler parameter types
    files: ['**/TypedEventEmitter.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: [
      '**/dist/',
      '**/node_modules/',
      '**/coverage/',
      '.plan/',
      '.development/',
      '**/*.config.*',
    ],
  },
)
