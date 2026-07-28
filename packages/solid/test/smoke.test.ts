import { describe, expect, it } from 'vitest';

import { SOLID_ADAPTER_VERSION } from '../src/index.js';

/**
 * Phase 0 smoke test — verifies that the Solid adapter package can be imported.
 */
describe('@agou/liquid-glass-solid', () => {
  it('exports SOLID_ADAPTER_VERSION', () => {
    expect(SOLID_ADAPTER_VERSION).toBe('0.1.0');
  });
});
