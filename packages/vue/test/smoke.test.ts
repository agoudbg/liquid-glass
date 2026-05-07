import { describe, expect, it } from 'vitest';

/**
 * Phase 0 smoke test — verifies that the Vue adapter package can be imported.
 */
describe('@agou/liquid-glass-vue', () => {
  it('exports VUE_ADAPTER_VERSION', async () => {
    const { VUE_ADAPTER_VERSION } = await import('../src/index.js');
    expect(VUE_ADAPTER_VERSION).toBe('0.1.0');
  });
});
