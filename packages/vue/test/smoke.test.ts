import { describe, expect, it } from 'vitest';

import packageJson from '../package.json';
import { VUE_ADAPTER_VERSION } from '../src/index.js';

/**
 * Phase 0 smoke test — verifies that the Vue adapter package can be imported.
 */
describe('@agou/liquid-glass-vue', () => {
  it('exports VUE_ADAPTER_VERSION', () => {
    expect(VUE_ADAPTER_VERSION).toBe(packageJson.version);
  });
});
