import { describe, expect, it } from 'vitest';

import { VUE_ADAPTER_VERSION } from '../src/index.js';

/**
 * Phase 0 smoke test — verifies that the Vue adapter package can be imported.
 */
describe('@agou/liquid-glass-vue', () => {
  it('exports VUE_ADAPTER_VERSION', () => {
    expect(VUE_ADAPTER_VERSION).toBe('0.1.0');
  });
});
