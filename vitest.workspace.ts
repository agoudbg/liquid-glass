import { defineWorkspace } from 'vitest/config';

/** Explicit unit-test projects prevent a missing package configuration from being skipped. */
export default defineWorkspace([
  'packages/core/vitest.config.ts',
  'packages/vue/vitest.config.ts',
  'packages/react/vitest.config.ts',
  'packages/solid/vitest.config.ts',
  'apps/playground/vitest.config.ts',
]);
