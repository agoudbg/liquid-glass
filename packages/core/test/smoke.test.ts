import { describe, expect, it } from 'vitest';

import * as core from '../src/index.js';

/**
 * Phase 0 smoke test — verifies that the core package can be imported
 * and its public API surface is intact.
 */
describe('@agou/liquid-glass-core', () => {
  it('exports CORE_VERSION', () => {
    expect(core.CORE_VERSION).toBe('0.1.0');
  });

  it('CORE_VERSION is a string', () => {
    expect(typeof core.CORE_VERSION).toBe('string');
  });

  it('exposes the framework-neutral primitive contract', () => {
    expect(core.TypedEventEmitter).toBeTypeOf('function');
    expect(core.GlassError).toBeTypeOf('function');
    expect(core.generateUUID).toBeTypeOf('function');
    expect(core.LIQUID_GLASS_VERTEX_SHADER).toContain('#version 300 es');
    expect(core.LIQUID_GLASS_FRAGMENT_SHADER).toContain('float sdfRect');
  });
});
