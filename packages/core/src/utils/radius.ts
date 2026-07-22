import type { CornerRadii, ShaderCornerRadii } from '../types/common';

/**
 * Per-corner overrides accepted by `resolveCornerRadii`.
 */
export interface CornerRadiusOverrides {
  /** Top-left radius override. */
  topLeft?: number;
  /** Top-right radius override. */
  topRight?: number;
  /** Bottom-right radius override. */
  bottomRight?: number;
  /** Bottom-left radius override. */
  bottomLeft?: number;
}

/**
 * Minimal computed-style fields needed to resolve element corner radii.
 */
export interface BorderRadiusStyle {
  /** Computed top-left radius. */
  borderTopLeftRadius: string;
  /** Computed top-right radius. */
  borderTopRightRadius: string;
  /** Computed bottom-right radius. */
  borderBottomRightRadius: string;
  /** Computed bottom-left radius. */
  borderBottomLeftRadius: string;
}

function parseRadiusComponent(value: string, referenceLength: number): number | null {
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) {
    const percentage = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percentage)
      ? Math.max(0, percentage * referenceLength / 100)
      : null;
  }

  const pixels = Number.parseFloat(trimmed);
  return Number.isFinite(pixels) ? Math.max(0, pixels) : null;
}

/**
 * Parse one computed CSS corner radius into the scalar radius used by the shader.
 *
 * Computed styles normally contain pixels, but percentage values are supported
 * for deterministic tests and alternate DOM implementations. Elliptical radii
 * use the smaller axis so the scalar shader SDF never exceeds either CSS axis.
 * Unsupported computed values resolve to zero.
 *
 * @param value - Computed radius such as `16px`, `50%`, or `20px 12px`.
 * @param width - Element width used to resolve a horizontal percentage.
 * @param height - Element height used to resolve a vertical percentage.
 * @returns Non-negative scalar radius in CSS pixels.
 */
export function parseCSSBorderRadius(
  value: string,
  width: number,
  height: number,
): number {
  const components = value.trim().split(/\s+/).filter(Boolean);
  if (components.length === 0 || components.length > 2) {
    return 0;
  }

  const horizontal = parseRadiusComponent(components[0], width);
  const vertical = parseRadiusComponent(components[1] ?? components[0], height);
  if (horizontal === null || vertical === null) {
    return 0;
  }

  return Math.min(horizontal, vertical);
}

/**
 * Parse all four computed CSS corner radius properties.
 *
 * @param style - Computed border-radius fields.
 * @param width - Element width in CSS pixels.
 * @param height - Element height in CSS pixels.
 * @returns Named scalar corner radii.
 */
export function parseComputedCornerRadii(
  style: BorderRadiusStyle,
  width: number,
  height: number,
): CornerRadii {
  return normalizeCornerRadii({
    topLeft: parseCSSBorderRadius(style.borderTopLeftRadius, width, height),
    topRight: parseCSSBorderRadius(style.borderTopRightRadius, width, height),
    bottomRight: parseCSSBorderRadius(style.borderBottomRightRadius, width, height),
    bottomLeft: parseCSSBorderRadius(style.borderBottomLeftRadius, width, height),
  }, width, height);
}

/**
 * Resolve optional per-corner values against a shared base radius.
 *
 * Nullish checks deliberately preserve an explicit zero, fixing the legacy
 * truthiness bug that prevented disabling individual optical parameters.
 *
 * @param radius - Shared fallback radius.
 * @param overrides - Optional named corner values.
 * @returns Fully populated named radii.
 */
export function resolveCornerRadii(
  radius: number,
  overrides: CornerRadiusOverrides = {},
): CornerRadii {
  return {
    topLeft: overrides.topLeft ?? radius,
    topRight: overrides.topRight ?? radius,
    bottomRight: overrides.bottomRight ?? radius,
    bottomLeft: overrides.bottomLeft ?? radius,
  };
}

/**
 * Apply the CSS corner-overlap reduction rule to scalar corner radii.
 *
 * @param radii - Named corner radii.
 * @param width - Element width in CSS pixels.
 * @param height - Element height in CSS pixels.
 * @returns Non-negative radii scaled by one common overlap factor.
 */
export function normalizeCornerRadii(
  radii: CornerRadii,
  width: number,
  height: number,
): CornerRadii {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const safeRadii: CornerRadii = {
    topLeft: Math.max(0, radii.topLeft),
    topRight: Math.max(0, radii.topRight),
    bottomRight: Math.max(0, radii.bottomRight),
    bottomLeft: Math.max(0, radii.bottomLeft),
  };
  const ratios = [
    safeWidth / (safeRadii.topLeft + safeRadii.topRight),
    safeWidth / (safeRadii.bottomLeft + safeRadii.bottomRight),
    safeHeight / (safeRadii.topLeft + safeRadii.bottomLeft),
    safeHeight / (safeRadii.topRight + safeRadii.bottomRight),
  ];
  const scale = Math.min(1, ...ratios.filter(Number.isFinite));

  return {
    topLeft: safeRadii.topLeft * scale,
    topRight: safeRadii.topRight * scale,
    bottomRight: safeRadii.bottomRight * scale,
    bottomLeft: safeRadii.bottomLeft * scale,
  };
}

/**
 * Convert named corner radii into the reference shader's uniform order.
 *
 * @param radii - Named corner radii.
 * @returns Tuple ordered top-right, bottom-right, bottom-left, top-left.
 */
export function toShaderCornerRadii(radii: CornerRadii): ShaderCornerRadii {
  return [radii.topRight, radii.bottomRight, radii.bottomLeft, radii.topLeft];
}
