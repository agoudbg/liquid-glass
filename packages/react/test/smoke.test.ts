import { describe, expect, it } from 'vitest';

import packageJson from '../package.json';
import { REACT_ADAPTER_VERSION } from '../src/index.js';

/**
 * Phase 0 smoke test — verifies that the React adapter package can be imported.
 */
describe('@agou/liquid-glass-react', () => {
  it('exports REACT_ADAPTER_VERSION', () => {
    expect(REACT_ADAPTER_VERSION).toBe(packageJson.version);
  });
});
