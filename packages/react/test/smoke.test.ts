import { describe, expect, it } from 'vitest';

/**
 * Phase 0 smoke test — verifies that the React adapter package can be imported.
 */
describe('@agou/liquid-glass-react', () => {
  it('exports REACT_ADAPTER_VERSION', async () => {
    const { REACT_ADAPTER_VERSION } = await import('../src/index.js');
    expect(REACT_ADAPTER_VERSION).toBe('0.1.0');
  });
});
