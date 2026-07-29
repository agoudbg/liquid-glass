import type { ExternalMaterialConfig } from '../../src/types/external-material';

/** Create one detached valid external material fixture. */
export function externalMaterialConfig(
  overrides: Partial<ExternalMaterialConfig> = {},
): ExternalMaterialConfig {
  const base: ExternalMaterialConfig = {
    clientRect: { x: 40, y: 30, width: 120, height: 60 },
    borderRadius: {
      topLeft: 12,
      topRight: 16,
      bottomRight: 20,
      bottomLeft: 24,
    },
    blur: 3,
    thickness: 10,
    refractIndex: 1.1,
    refractIntensity: 0.5,
    dispersion: 0.01,
    transform: {
      scaleX: 1,
      scaleY: 1,
      translateX: 0,
      translateY: 0,
    },
  };
  return {
    ...base,
    ...overrides,
    clientRect: overrides.clientRect
      ? { ...overrides.clientRect }
      : { ...base.clientRect },
    borderRadius: overrides.borderRadius
      ? { ...overrides.borderRadius }
      : { ...base.borderRadius },
    transform: overrides.transform
      ? { ...overrides.transform }
      : { ...base.transform },
  };
}
