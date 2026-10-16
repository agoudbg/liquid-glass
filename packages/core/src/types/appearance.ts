import type { AutomaticBackgroundColorMode } from './context';

/** Material edge treatment: the original rotating light or an iOS 27-style dark contour. */
export type MaterialEdgeStyle = 'illuminated' | 'dark';

/**
 * Portable visual options shared by framework material adapters.
 *
 * Core rendering remains responsible for optics. Adapters map these values to
 * the shared CSS appearance contract without coupling core to a framework.
 */
export interface MaterialAppearanceOptions {
  /** Edge treatment; defaults to the original `illuminated` rim. */
  edgeStyle?: MaterialEdgeStyle;
  /** Use an explicit tint instead of backdrop-derived theme colors. */
  useCustomColor?: boolean;
  /** Explicit CSS color used for the material tint. */
  backgroundColor?: string;
  /** Direction of the original illuminated rim in degrees; unused by dark edges. */
  illuminationAngle?: number;
  /** Rim illumination strength in the inclusive 0-1 range. */
  illuminationIntensity?: number;
}

/** Interaction configuration fields that affect CSS material presentation. */
export interface MaterialHighlightAppearanceConfig {
  /** Whether the pointer highlight may be shown. */
  showHighlight: boolean;
  /** Highlight diameter in CSS pixels. */
  highlightSize: number;
  /** Highlight element opacity while visible. */
  highlightOpacity: number;
  /** Brightness multiplier applied to the highlight gradient and filter. */
  highlightHDRFactor: number;
}

/** One interaction-engine output consumed by the material appearance resolver. */
export interface MaterialInteractionAppearanceOutput {
  /** Horizontal material scale. */
  scaleX: number;
  /** Vertical material scale. */
  scaleY: number;
  /** Horizontal translation in CSS pixels. */
  translateX: number;
  /** Vertical translation in CSS pixels. */
  translateY: number;
  /** Horizontal transform origin as a percentage. */
  originX: number;
  /** Vertical transform origin as a percentage. */
  originY: number;
  /** Material opacity. */
  opacity: number;
  /** Interaction-owned tint override, or `null` to retain the resolved tint. */
  backgroundColor: string | null;
  /** Normalized horizontal highlight position. */
  highlightX: number;
  /** Normalized vertical highlight position. */
  highlightY: number;
  /** Whether the interaction engine requests a visible highlight. */
  highlightVisible: boolean;
}

/** Complete framework-neutral input used to resolve material CSS tokens. */
export interface MaterialAppearanceInput extends MaterialAppearanceOptions {
  /** Backdrop-derived theme mode; defaults to `light`. */
  themeColorMode?: AutomaticBackgroundColorMode;
  /** Resolved optical thickness used by the legacy inset shadow. */
  thickness?: number;
  /** Highlight-related interaction overrides. */
  interactionConfig?: Partial<MaterialHighlightAppearanceConfig>;
  /** Latest interaction transform and highlight output. */
  interactionOutput?: Partial<MaterialInteractionAppearanceOutput>;
  /** Suppress the pointer highlight while CSS fallback presentation is active. */
  fallbackMode?: boolean;
}

/** Theme-owned colors before interaction and custom-color overrides are applied. */
export interface MaterialThemeAppearance {
  /** Background tint composited over the shader canvas. */
  readonly backgroundTint: string;
  /** Foreground inherited by material content. */
  readonly foregroundColor: string;
  /** Same-hue inset shadow with fixed `0x33` alpha. */
  readonly insetShadowColor: string;
}

/** CSS custom properties forming the cross-framework material appearance contract. */
export interface MaterialAppearanceTokens {
  /** Theme or custom tint before interaction overrides. */
  '--lg-background-tint': string;
  /** Tint after an active interaction override is applied. */
  '--lg-effective-background-tint': string;
  /** Theme-aware inherited foreground. */
  '--lg-foreground-color': string;
  /** Fixed outer shadow color. */
  '--lg-outer-shadow-color': string;
  /** Fixed outer shadow blur radius. */
  '--lg-outer-shadow-size': string;
  /** Same-hue inset shadow color with `0x33` alpha. */
  '--lg-inset-shadow-color': string;
  /** Thickness-aware inset shadow blur radius. */
  '--lg-inset-shadow-size': string;
  /** Rim illumination rotation. */
  '--lg-illumination-angle': string;
  /** Rim illumination peak alpha. */
  '--lg-illumination-intensity': string;
  /** Resolved rim light: rotating for illuminated edges, stationary for dark edges. */
  '--lg-illumination-gradient': string;
  /** Directional dark flanks, fading out along the lit top and bottom edges. */
  '--lg-edge-contour-shadow': string;
  /** Horizontal interaction scale. */
  '--lg-scale-x': string;
  /** Vertical interaction scale. */
  '--lg-scale-y': string;
  /** Horizontal interaction translation. */
  '--lg-translate-x': string;
  /** Vertical interaction translation. */
  '--lg-translate-y': string;
  /** Horizontal transform origin. */
  '--lg-origin-x': string;
  /** Vertical transform origin. */
  '--lg-origin-y': string;
  /** Interaction-driven material opacity. */
  '--lg-material-opacity': string;
  /** Pointer highlight diameter. */
  '--lg-highlight-size': string;
  /** Pointer highlight opacity. */
  '--lg-highlight-opacity': string;
  /** Pointer highlight horizontal position. */
  '--lg-highlight-left': string;
  /** Pointer highlight vertical position. */
  '--lg-highlight-top': string;
  /** Pointer highlight entrance or exit scale. */
  '--lg-highlight-scale': string;
  /** Fully resolved legacy radial-gradient value. */
  '--lg-highlight-gradient': string;
  /** HDR brightness and saturation filter. */
  '--lg-highlight-filter': string;
}
