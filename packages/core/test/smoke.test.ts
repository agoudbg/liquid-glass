import { describe, expect, it } from 'vitest';

/**
 * Phase 0 smoke test — verifies that the core package can be imported
 * and its public API surface is intact.
 */
describe('@agou/liquid-glass-core', () => {
  it('exports CORE_VERSION', async () => {
    const { CORE_VERSION } = await import('../src/index.js');
    expect(CORE_VERSION).toBe('0.1.0');
  });

  it('CORE_VERSION is a string', async () => {
    const { CORE_VERSION } = await import('../src/index.js');
    expect(typeof CORE_VERSION).toBe('string');
  });
});
