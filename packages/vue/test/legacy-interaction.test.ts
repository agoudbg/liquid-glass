import { describe, expect, it } from 'vitest';

import type { LegacyInteractionConfig } from '../src';
import {
  convertLegacyInteractionConfig,
  mergeVueInteractionConfig,
} from '../src/legacy-interaction';

describe('Vue legacy interaction compatibility', () => {
  it('maps supported fields and deliberately ignores legacy-only rebound fields', () => {
    const legacy: Partial<LegacyInteractionConfig> = {
      activeScale: 1.12,
      baseScale: 0.96,
      damping: 0.25,
      followLag: 0.3,
      highlightHDRFactor: 1.8,
      highlightOpacity: 0.44,
      highlightSize: 180,
      reboundDamping: 0.11,
      reboundThreshold: 0.12,
      releaseDamping: 0.6,
      releaseReboundDamping: 0.13,
      stretchFactor: 0.22,
      stretchLimit: 1.4,
      translateFactor: 0.7,
    };

    expect(convertLegacyInteractionConfig(legacy)).toEqual({
      activeScale: 1.12,
      activeSpring: { damping: 19, mass: 1, stiffness: 450 },
      baseScale: 0.96,
      highlightFollowSpeed: 0.3,
      highlightHDRFactor: 1.8,
      highlightOpacity: 0.44,
      highlightSize: 180,
      releaseSpring: { damping: 24, mass: 1, stiffness: 380 },
      stretchFactor: 0.22,
      stretchLimit: 1.4,
      translateFactor: 0.7,
    });
  });

  it('gives modern overrides precedence and preserves an absent configuration', () => {
    const modern = {
      activeScale: 1.24,
      activeSpring: { damping: 16, mass: 2, stiffness: 220 },
    };

    expect(mergeVueInteractionConfig({ activeScale: 1.1, damping: 0.5 }, modern))
      .toEqual(modern);
    expect(mergeVueInteractionConfig(undefined, modern)).toBe(modern);
    expect(mergeVueInteractionConfig(undefined, undefined)).toBeUndefined();
  });
});
