import { GlassError } from '../errors/GlassError';
import { BUTTON_PRESET } from '../interaction/presets';
import type {
  MaterialAppearanceInput,
  MaterialAppearanceTokens,
  MaterialHighlightAppearanceConfig,
  MaterialInteractionAppearanceOutput,
  MaterialThemeAppearance,
} from '../types/appearance';
import type { AutomaticBackgroundColorMode } from '../types/context';
import { validateFiniteNumber } from '../utils/validation';

/** Default backdrop theme used before the first sampled feedback event. */
export const DEFAULT_MATERIAL_THEME_MODE: AutomaticBackgroundColorMode = 'light';

/** Legacy tint, foreground, and repaired inset-shadow colors for every theme. */
export const MATERIAL_THEME_APPEARANCE: Readonly<
  Record<AutomaticBackgroundColorMode, MaterialThemeAppearance>
> = Object.freeze({
  ultra_dark: Object.freeze({
    backgroundTint: '#00000022',
    foregroundColor: '#ffffff',
    insetShadowColor: '#00000033',
  }),
  dark: Object.freeze({
    backgroundTint: '#00000066',
    foregroundColor: '#ffffff',
    insetShadowColor: '#00000033',
  }),
  light: Object.freeze({
    backgroundTint: '#ffffff99',
    foregroundColor: '#000000',
    insetShadowColor: '#ffffff33',
  }),
  ultra_light: Object.freeze({
    backgroundTint: '#ffffff33',
    foregroundColor: '#000000',
    insetShadowColor: '#ffffff33',
  }),
});

const DEFAULT_INTERACTION_OUTPUT: MaterialInteractionAppearanceOutput = {
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
  originX: 50,
  originY: 50,
  opacity: 1,
  backgroundColor: null,
  highlightX: 0.5,
  highlightY: 0.5,
  highlightVisible: false,
};

const DEFAULT_HIGHLIGHT_CONFIG: MaterialHighlightAppearanceConfig = {
  showHighlight: BUTTON_PRESET.showHighlight,
  highlightSize: BUTTON_PRESET.highlightSize,
  highlightOpacity: BUTTON_PRESET.highlightOpacity,
  highlightHDRFactor: BUTTON_PRESET.highlightHDRFactor,
};

function cssNumber(value: number): string {
  return String(Object.is(value, -0) ? 0 : value);
}

function validatedNumber(
  value: number,
  field: string,
  minimum?: number,
  maximum?: number,
): number {
  return validateFiniteNumber(value, `materialAppearance.${field}`, {
    minimum,
    maximum,
  });
}

function fixedHexAlpha(color: string): string | null {
  if (!color.startsWith('#')) {
    return null;
  }

  const hex = color.slice(1);
  if (!/^[0-9a-f]+$/i.test(hex)) {
    return null;
  }

  let rgb: string;
  if (hex.length === 3 || hex.length === 4) {
    rgb = [...hex.slice(0, 3)].map((channel) => channel.repeat(2)).join('');
  } else if (hex.length === 6 || hex.length === 8) {
    rgb = hex.slice(0, 6);
  } else {
    return null;
  }

  return `#${rgb.toLowerCase()}33`;
}

function fixedAlphaColor(color: string): string {
  if (color === 'initial' || color.toLowerCase() === 'transparent') {
    return 'transparent';
  }

  return fixedHexAlpha(color) ?? `rgb(from ${color} r g b / 20%)`;
}

function resolveBaseColors(input: MaterialAppearanceInput): MaterialThemeAppearance {
  if (input.backgroundColor) {
    return {
      backgroundTint: input.backgroundColor,
      foregroundColor: 'initial',
      insetShadowColor: fixedAlphaColor(input.backgroundColor),
    };
  }

  if (input.useCustomColor) {
    return {
      backgroundTint: 'initial',
      foregroundColor: 'initial',
      insetShadowColor: 'transparent',
    };
  }

  return MATERIAL_THEME_APPEARANCE[
    input.themeColorMode ?? DEFAULT_MATERIAL_THEME_MODE
  ];
}

function illuminationGradient(angle: number, intensity: number): string {
  const high = Math.max(0, Math.min(intensity, 1));
  const mid = Math.max(0, Math.min(intensity * 0.45, 1));
  const low = Math.max(0, Math.min(intensity * 0.2, 1));
  const normalizeAngle = (value: number): number => (
    ((value % 360) + 360) % 360
  );
  const stops = [
    { angle: normalizeAngle(angle), opacity: high },
    { angle: normalizeAngle(angle + 60), opacity: mid },
    { angle: normalizeAngle(angle + 90), opacity: low },
    { angle: normalizeAngle(angle + 120), opacity: mid },
    { angle: normalizeAngle(angle + 180), opacity: high },
    { angle: normalizeAngle(angle + 240), opacity: mid },
    { angle: normalizeAngle(angle + 270), opacity: low },
    { angle: normalizeAngle(angle + 300), opacity: mid },
    { angle: normalizeAngle(angle + 360), opacity: high },
  ].sort((left, right) => left.angle - right.angle);

  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first.angle !== 0) {
    const wrapSpan = 360 - last.angle + first.angle;
    const ratio = wrapSpan === 0 ? 0 : (360 - last.angle) / wrapSpan;
    stops.unshift({
      angle: 0,
      opacity: last.opacity + (first.opacity - last.opacity) * ratio,
    });
  }
  if (stops[stops.length - 1].angle !== 360) {
    stops.push({ angle: 360, opacity: stops[0].opacity });
  }

  return `conic-gradient(${stops
    .map((stop) => (
      `rgba(255, 255, 255, ${cssNumber(stop.opacity)}) ${cssNumber(stop.angle)}deg`
    ))
    .join(', ')})`;
}

function highlightGradient(opacity: number, hdrFactor: number): string {
  return `radial-gradient(circle at 50% 50%,
      rgba(255, 255, 255, ${cssNumber(opacity * hdrFactor)}) 0%,
      rgba(255, 255, 255, ${cssNumber(opacity * hdrFactor * 0.95)}) 15%,
      rgba(255, 255, 255, ${cssNumber(opacity * hdrFactor * 0.03)}) 65%,
      rgba(255, 255, 255, 0) 100%)`;
}

function darkEdgeSpecularGradient(intensity: number): string {
  // Fixed inner glints complement the shaded flanks without outlining every edge.
  // Keep this light independent of the legacy rim angle and optical thickness.
  return `linear-gradient(180deg, rgba(255, 255, 255, ${cssNumber(intensity)}) 0%, `
    + `rgba(255, 255, 255, ${cssNumber(intensity * 0.15)}) 28%, `
    + 'rgba(255, 255, 255, 0) 45%, rgba(255, 255, 255, 0) 60%, '
    + `rgba(255, 255, 255, ${cssNumber(intensity * 0.35)}) 82%, `
    + `rgba(255, 255, 255, ${cssNumber(intensity * 0.9)}) 100%)`;
}

/**
 * Resolve material CSS tokens while preserving the original appearance by default.
 *
 * The resolver repairs the reference implementation's malformed inset-shadow
 * color by retaining the tint hue and replacing its alpha with `0x33`.
 * Arbitrary CSS colors use relative-color syntax instead of string slicing.
 *
 * @param input - Theme, appearance, and interaction presentation inputs.
 * @returns CSS-ready custom properties shared by every framework adapter.
 * @throws GlassError when a present numeric input is non-finite or out of range.
 */
export function resolveMaterialAppearance(
  input: MaterialAppearanceInput = {},
): MaterialAppearanceTokens {
  const edgeStyle = input.edgeStyle === undefined ? 'illuminated' : input.edgeStyle;
  if (edgeStyle !== 'illuminated' && edgeStyle !== 'dark') {
    throw new GlassError('INVALID_CONFIG', 'Invalid materialAppearance.edgeStyle.', {
      phase: 'configuration',
      details: { field: 'materialAppearance.edgeStyle', value: edgeStyle },
    });
  }
  const thickness = validatedNumber(input.thickness ?? 10, 'thickness', 0);
  const angle = validatedNumber(input.illuminationAngle ?? 45, 'illuminationAngle');
  const intensity = validatedNumber(
    input.illuminationIntensity ?? 0.5,
    'illuminationIntensity',
    0,
    1,
  );
  const highlightConfig = {
    ...DEFAULT_HIGHLIGHT_CONFIG,
    ...input.interactionConfig,
  };
  const output = {
    ...DEFAULT_INTERACTION_OUTPUT,
    ...input.interactionOutput,
  };
  const highlightSize = validatedNumber(
    highlightConfig.highlightSize,
    'highlightSize',
    0,
  );
  const configuredHighlightOpacity = validatedNumber(
    highlightConfig.highlightOpacity,
    'highlightOpacity',
    0,
    1,
  );
  const highlightHDRFactor = validatedNumber(
    highlightConfig.highlightHDRFactor,
    'highlightHDRFactor',
    0,
  );
  const scaleX = validatedNumber(output.scaleX, 'scaleX');
  const scaleY = validatedNumber(output.scaleY, 'scaleY');
  const translateX = validatedNumber(output.translateX, 'translateX');
  const translateY = validatedNumber(output.translateY, 'translateY');
  const originX = validatedNumber(output.originX, 'originX');
  const originY = validatedNumber(output.originY, 'originY');
  const materialOpacity = validatedNumber(output.opacity, 'opacity', 0, 1);
  const highlightX = validatedNumber(output.highlightX, 'highlightX');
  const highlightY = validatedNumber(output.highlightY, 'highlightY');
  const highlightVisible = highlightConfig.showHighlight
    && output.highlightVisible
    && !input.fallbackMode;
  const highlightOpacity = highlightVisible ? configuredHighlightOpacity : 0;
  const colors = resolveBaseColors(input);
  const effectiveBackground = output.backgroundColor ?? colors.backgroundTint;

  return {
    '--lg-background-tint': colors.backgroundTint,
    '--lg-effective-background-tint': effectiveBackground,
    '--lg-foreground-color': colors.foregroundColor,
    '--lg-outer-shadow-color': '#00000033',
    '--lg-outer-shadow-size': '10px',
    '--lg-inset-shadow-color': colors.insetShadowColor,
    '--lg-inset-shadow-size': `${cssNumber(Math.max(5, thickness))}px`,
    '--lg-illumination-angle': `${cssNumber(angle)}deg`,
    '--lg-illumination-intensity': cssNumber(intensity),
    '--lg-illumination-gradient': edgeStyle === 'dark'
      ? darkEdgeSpecularGradient(intensity)
      : illuminationGradient(angle, intensity),
    // Horizontal inset projections follow local curvature and vanish along the
    // lit top/bottom edges, including on elongated pills and asymmetric corners.
    '--lg-edge-contour-shadow': edgeStyle === 'dark'
      ? 'inset 1px 0 0 rgba(0, 0, 0, 0.38), inset -0.5px 0 0 rgba(0, 0, 0, 0.18)'
      : 'none',
    '--lg-scale-x': cssNumber(scaleX),
    '--lg-scale-y': cssNumber(scaleY),
    '--lg-translate-x': `${cssNumber(translateX)}px`,
    '--lg-translate-y': `${cssNumber(translateY)}px`,
    '--lg-origin-x': `${cssNumber(originX)}%`,
    '--lg-origin-y': `${cssNumber(originY)}%`,
    '--lg-material-opacity': cssNumber(materialOpacity),
    '--lg-highlight-size': `${cssNumber(highlightSize)}px`,
    '--lg-highlight-opacity': cssNumber(highlightOpacity),
    '--lg-highlight-left': `${cssNumber(highlightX * 100)}%`,
    '--lg-highlight-top': `${cssNumber(highlightY * 100)}%`,
    '--lg-highlight-scale': highlightVisible ? '1' : '5',
    '--lg-highlight-gradient': highlightGradient(
      highlightOpacity,
      highlightHDRFactor,
    ),
    '--lg-highlight-filter': `brightness(${cssNumber(highlightHDRFactor)}) saturate(1.1)`,
  };
}
