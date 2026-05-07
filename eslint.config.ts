import path from 'node:path'
import { fileURLToPath } from 'node:url'

import js from '@eslint/js'
import globals from 'globals'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import tseslint from 'typescript-eslint'

/**
 * ESLint 9 flat configuration for the Liquid Glass monorepo.
 *
 * Merged from:
 *   1. Original project `.eslintrc.cjs` (airbnb-base + vue3-essential)
 *   2. Modern flat config reference (typescript-eslint, import, simple-import-sort)
 *
 * Not included (by design):
 *   - prettier — formatting handled by ESLint rules directly
 *   - tailwindcss — not used in this project
 *   - React/Vue plugins — those live in each framework adapter's own config
 *
 * Code style:
 *   - 2-space indent
 *   - Single quotes
 *   - Semicolons required
 *   - Trailing commas (multiline)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
    // ── Global ignores ──────────────────────────────────────────
    {
        ignores: [
            '**/dist/',
            '**/node_modules/',
            '**/coverage/',
            '.plan/',
            '.development/',
        ],
    },

    // ── Base TypeScript config ──────────────────────────────────
    {
        files: ['**/*.{ts,tsx,vue}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: __dirname,
            },
        },
        plugins: {
            'simple-import-sort': simpleImportSort,
        },
        settings: {},
        rules: {
            // ── TypeScript-specific ──────────────────────────────
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],

            // ── Import ordering ──────────────────────────────────
            'simple-import-sort/imports': 'warn',
            'simple-import-sort/exports': 'warn',

            // ── Code style ───────────────────────────────────────
            indent: ['error', 2, { SwitchCase: 1 }],
            quotes: ['error', 'single', { avoidEscape: true }],
            semi: ['error', 'always'],

            // ── Spacing & formatting ─────────────────────────────
            'comma-dangle': ['error', 'always-multiline'],
            'comma-spacing': ['error', { before: false, after: true }],
            'no-trailing-spaces': 'error',
            'no-multi-spaces': 'error',
            'space-in-parens': ['error', 'never'],
            'spaced-comment': ['error', 'always'],
            'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 0 }],
            'eol-last': ['error', 'always'],
            'max-len': ['warn', 200],

            // ── Disabled (too strict for this codebase) ──────────
            'no-console': 0,
            'no-plusplus': 0,
            'no-shadow': 0,
            'no-underscore-dangle': 0,
            'no-alert': 0,
            'no-param-reassign': 0,
            'no-nested-ternary': 0,
            'max-classes-per-file': 0,

            // ── Relaxed newline rules ────────────────────────────
            'function-call-argument-newline': 'off',
            'function-paren-newline': 'off',
            'object-curly-newline': 'off',
            'func-call-spacing': 'off',
        },
    },

    // ── Allow `any` in TypedEventEmitter ───────────────────────
    // Event handler parameters are inherently dynamic — this is the
    // only place `any` is permitted in the codebase.
    {
        files: ['**/TypedEventEmitter.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
)
