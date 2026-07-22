import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import solid from 'eslint-plugin-solid';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

const sharedRules = {
  'comma-dangle': ['error', 'always-multiline'],
  'comma-spacing': ['error', { after: true, before: false }],
  'eol-last': ['error', 'always'],
  'no-multi-spaces': 'error',
  'no-multiple-empty-lines': ['error', { max: 2, maxBOF: 0, maxEOF: 1 }],
  'no-trailing-spaces': 'error',
  quotes: ['error', 'single', { avoidEscape: true }],
  semi: ['error', 'always'],
} as const;

/**
 * Monorepo lint policy with framework-aware parsing and lifecycle checks.
 */
export default tseslint.config(
  {
    ignores: [
      '**/coverage/',
      '**/dist/',
      '**/node_modules/',
      '.development/',
      '.plan/',
    ],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...sharedRules,
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      sourceType: 'module',
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...sharedRules,
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
    },
  },
  {
    files: [
      'packages/vue/**/*.vue',
      'apps/playground/**/*.vue',
      'tests/consumers/vue/**/*.vue',
    ],
    languageOptions: {
      globals: globals.browser,
      parser: vueParser,
      parserOptions: {
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
        sourceType: 'module',
      },
    },
    plugins: {
      vue,
    },
    rules: {
      ...sharedRules,
      'vue/no-mutating-props': 'error',
      'vue/no-v-html': 'error',
      'vue/require-v-for-key': 'error',
    },
  },
  {
    files: [
      'packages/react/src/**/*.{ts,tsx}',
      'apps/playground/src/hosts/react/**/*.{ts,tsx}',
      'tests/consumers/react/src/**/*.{ts,tsx}',
    ],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    files: [
      'packages/solid/src/**/*.{ts,tsx}',
      'apps/playground/src/hosts/solid/**/*.{ts,tsx}',
      'tests/consumers/solid/src/**/*.{ts,tsx}',
    ],
    plugins: {
      solid,
    },
    rules: {
      'solid/jsx-no-undef': 'error',
      'solid/no-innerhtml': 'error',
      'solid/reactivity': 'warn',
    },
  },
  {
    files: ['**/TypedEventEmitter.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
