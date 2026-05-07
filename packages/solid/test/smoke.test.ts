import { describe, expect, it } from 'vitest';

/**
 * Phase 0 smoke test — verifies that the Solid adapter package can be imported.
 */
describe('@agou/liquid-glass-solid', () => {
  it('exports SOLID_ADAPTER_VERSION', async () => {
    const { SOLID_ADAPTER_VERSION } = await import('../src/index.js');
    expect(SOLID_ADAPTER_VERSION).toBe('0.1.0');
  });
});
