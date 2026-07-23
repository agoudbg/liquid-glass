import type { PartialInteractionConfig } from '@agou/liquid-glass-core';

import type { LegacyInteractionConfig } from './types';

function convertDamping(
  damping: number,
): NonNullable<PartialInteractionConfig['activeSpring']> {
  return {
    stiffness: Math.round(300 + (1 - damping) * 200),
    damping: Math.round(15 + damping * 15),
    mass: 1,
  };
}

/** Convert the deprecated Vue interaction shape into modern core overrides. */
export function convertLegacyInteractionConfig(
  legacy: Partial<LegacyInteractionConfig>,
): PartialInteractionConfig {
  const config: PartialInteractionConfig = {};
  if (legacy.baseScale !== undefined) config.baseScale = legacy.baseScale;
  if (legacy.activeScale !== undefined) config.activeScale = legacy.activeScale;
  if (legacy.translateFactor !== undefined) {
    config.translateFactor = legacy.translateFactor;
  }
  if (legacy.stretchFactor !== undefined) config.stretchFactor = legacy.stretchFactor;
  if (legacy.stretchLimit !== undefined) config.stretchLimit = legacy.stretchLimit;
  if (legacy.highlightSize !== undefined) config.highlightSize = legacy.highlightSize;
  if (legacy.highlightOpacity !== undefined) {
    config.highlightOpacity = legacy.highlightOpacity;
  }
  if (legacy.highlightHDRFactor !== undefined) {
    config.highlightHDRFactor = legacy.highlightHDRFactor;
  }
  if (legacy.damping !== undefined) {
    config.activeSpring = convertDamping(legacy.damping);
  }
  if (legacy.releaseDamping !== undefined) {
    config.releaseSpring = convertDamping(legacy.releaseDamping);
  }
  if (legacy.followLag !== undefined) {
    config.highlightFollowSpeed = legacy.followLag;
  }
  return config;
}

/** Merge deprecated Vue overrides below the modern interaction configuration. */
export function mergeVueInteractionConfig(
  legacy: Partial<LegacyInteractionConfig> | undefined,
  modern: PartialInteractionConfig | undefined,
): PartialInteractionConfig | undefined {
  if (!legacy) return modern;
  return {
    ...convertLegacyInteractionConfig(legacy),
    ...modern,
  };
}
