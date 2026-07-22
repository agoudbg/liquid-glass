import { describe, expect, it } from 'vitest';

import {
  FRAMEWORK_IDS,
  isFrameworkId,
  PLAYGROUND_NAME,
} from '../src/app-meta.js';

describe('playground metadata', () => {
  it('exposes every required framework host exactly once', () => {
    expect(FRAMEWORK_IDS).toEqual(['vue', 'react', 'solid']);
    expect(new Set(FRAMEWORK_IDS).size).toBe(FRAMEWORK_IDS.length);
  });

  it('validates external framework values', () => {
    expect(isFrameworkId('vue')).toBe(true);
    expect(isFrameworkId('svelte')).toBe(false);
    expect(isFrameworkId(null)).toBe(false);
    expect(PLAYGROUND_NAME).toBe('Liquid Glass Playground');
  });
});
