import type { CornerRadii } from '../types/common';
import type { MaterialConfig } from '../types/context';
import {
  normalizeCornerRadii,
  parseComputedCornerRadii,
} from '../utils/radius';
import { validateOptionalFiniteNumber } from '../utils/validation';

/** Resolved optical and corner values shared by local and delegated rendering. */
export interface MaterialGlassValues {
  /** Effective corner radii in CSS order. */
  readonly borderRadius: CornerRadii;
  /** Effective blur amount. */
  readonly blur: number;
  /** Effective glass thickness. */
  readonly thickness: number;
  /** Effective index of refraction. */
  readonly refractIndex: number;
  /** Effective refraction displacement multiplier. */
  readonly refractIntensity: number;
  /** Effective chromatic dispersion strength. */
  readonly dispersion: number;
}

function optionalNumber(
  value: number | undefined,
  field: string,
  fallback: number,
  minimum: number = 0,
): number {
  return validateOptionalFiniteNumber(value, field, { minimum }) ?? fallback;
}

function resolveRadii(
  config: MaterialConfig,
  style: CSSStyleDeclaration,
  width: number,
  height: number,
): CornerRadii {
  const computed = parseComputedCornerRadii(style, width, height);
  const base = config.radius === undefined
    ? undefined
    : optionalNumber(config.radius, 'material.radius', 0);

  return normalizeCornerRadii({
    topLeft: optionalNumber(
      config.radiusTL,
      'material.radiusTL',
      base ?? computed.topLeft,
    ),
    topRight: optionalNumber(
      config.radiusTR,
      'material.radiusTR',
      base ?? computed.topRight,
    ),
    bottomRight: optionalNumber(
      config.radiusBR,
      'material.radiusBR',
      base ?? computed.bottomRight,
    ),
    bottomLeft: optionalNumber(
      config.radiusBL,
      'material.radiusBL',
      base ?? computed.bottomLeft,
    ),
  }, width, height);
}

/** Resolve one material's public values into renderer-ready glass attributes. */
export function resolveMaterialGlassValues(
  config: MaterialConfig,
  style: CSSStyleDeclaration,
  width: number,
  height: number,
): MaterialGlassValues {
  return {
    borderRadius: resolveRadii(config, style, width, height),
    blur: optionalNumber(config.blur, 'material.blur', 0),
    thickness: optionalNumber(config.thickness, 'material.thickness', 10),
    refractIndex: optionalNumber(
      config.refractIndex,
      'material.refractIndex',
      1.1,
      Number.EPSILON,
    ),
    refractIntensity: optionalNumber(
      config.refractIntensity,
      'material.refractIntensity',
      0.5,
    ),
    dispersion: optionalNumber(
      config.dispersion,
      'material.dispersion',
      0.01,
    ),
  };
}
