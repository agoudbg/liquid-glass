module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'plugin:vue/vue3-essential',
    'airbnb-base',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parser: '@typescript-eslint/parser',
  },
  plugins: [
    'vue',
    'simple-import-sort',
    '@typescript-eslint',
  ],
  rules: {
    indent: ['error', 2, { SwitchCase: 1 }],
    'no-console': 0,
    'import/extensions': 0,
    'simple-import-sort/imports': ['warn'],
    'eol-last': ['error', 'always'],
    'import/no-unresolved': 0,
    'max-classes-per-file': 0,
    'no-underscore-dangle': 0,
    'no-plusplus': 0,
    'no-shadow': 0,
    'max-len': ['warn', 200],
    'no-alert': 0,
    'import/prefer-default-export': 0,
    'no-param-reassign': 0,
    semi: ['error', 'always'],
    'no-nested-ternary': 0,
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error'],
    quotes: ['error', 'single'],
  },
  overrides: [
    {
      files: ['vite.config.ts', 'vite.config.js'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['src/workers/**/*.ts'],
      env: {
        worker: true,
      },
      rules: {
        'no-restricted-globals': 'off',
      },
    },
  ],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.vue'],
      },
    },
  },
};
