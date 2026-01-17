/**
 * @fileoverview Type definitions for the Liquid Glass component library.
 *
 * This module exports all TypeScript interfaces and types used throughout
 * the liquid glass rendering pipeline, including:
 *
 * - Manager configuration options
 * - Backdrop element configuration
 * - Material element configuration (glass effect parameters)
 * - Event payloads
 * - Viewport optimization types
 *
 * @module types/LiquidGlass
 */

// =============================================================================
// Rendering Configuration Types
// =============================================================================

/**
 * Render mode determines how glass materials are rendered.
 * - 'uniform': A single canvas renders all materials (better performance)
 * - 'dedicated': Each material has its own canvas (flexible z-index)
 */
export type RenderMode = 'uniform' | 'dedicated';

/** Callback function for custom canvas drawing in LgBackdropCanvas */
export type CustomDrawCallback = (
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number
) => void;

/**
 * Configuration for theme color detection thresholds.
 * Used to automatically determine material tint based on backdrop brightness.
 *
 * Luma values are in the range 0-255 (0 = black, 255 = white).
 * The system classifies backdrop brightness into four modes:
 * - Below ultraDarkMax → ultra_dark mode
 * - Below darkMax → dark mode
 * - Above ultraLightMin → ultra_light mode
 * - Otherwise → light mode
 */
export interface ThemeColorThresholds {
  /** Maximum luma value for ultra_dark mode (default: 25) */
  ultraDarkMax?: number;
  /** Maximum luma value for dark mode (default: 85) */
  darkMax?: number;
  /** Minimum luma value for ultra_light mode (default: 230) */
  ultraLightMin?: number;
}

// =============================================================================
// Manager Configuration
// =============================================================================

/**
 * Configuration options for LiquidRendererManager.
 * These options control the overall behavior of the rendering pipeline.
 */
export interface LiquidRendererManagerOptions {
  /**
   * The container element for the LiquidGlass instance.
   * Can be undefined if initialized before the DOM is ready.
   */
  container?: HTMLElement;

  /** Enable debug logging to console */
  debug?: boolean;

  /**
   * Render precision multiplier (0 = auto-detect based on device).
   * Higher values produce sharper effects but use more memory.
   */
  renderPrecision?: number;

  /**
   * Render mode determines how materials are rendered.
   * - 'uniform': Single canvas for all materials (z-index fixed at 10000)
   * - 'dedicated': Separate canvas per material (flexible z-index)
   */
  renderMode?: RenderMode;

  /**
   * Enable blurred effect mode.
   * When enabled, border and shadow will be hidden when the page loses focus,
   * reducing visual distraction while maintaining the glass effect.
   */
  enableBlurredEffect?: boolean;

  /** Request full composite render for nested LiquidGlass components */
  requireFullRender?: boolean;

  /** Enable scrollable mode with overflow:auto and scroll management */
  scrollable?: boolean;

  /** Theme color detection thresholds for automatic background mode */
  themeColorThresholds?: ThemeColorThresholds;
}

// =============================================================================
// Backdrop Element Types
// =============================================================================

/**
 * Type of backdrop element in the rendering pipeline.
 * - 'canvas': Custom canvas drawing via LgBackdropCanvas
 * - 'html': HTML content converted to canvas via LgBackdropConverter
 * - 'scroll_box': Scrollable content area
 * - 'liquid_glass': Nested LiquidGlass component
 */
export type LiquidRendererBackdropElementType =
  | 'canvas'
  | 'html'
  | 'scroll_box'
  | 'liquid_glass'
  | undefined;

/**
 * Configuration options for backdrop elements.
 * Controls how backdrop content is captured and managed.
 */
export interface LiquidRendererBackdropElementOptions {
  /** Z-index for draw order (higher = drawn later, on top) */
  zIndex?: number;

  /** Type of backdrop element */
  type: LiquidRendererBackdropElementType;

  /** Watch for element resize changes */
  watchResize?: boolean;

  /** Watch for DOM node changes (MutationObserver) */
  watchNodeChanges?: boolean;

  /** Watch for position changes in the document */
  watchPositionChanges?: boolean;

  /** Custom canvas drawing callback for 'canvas' type */
  userCanvasCallback?: CustomDrawCallback;
}

// =============================================================================
// Material Element Types (Glass Effect Parameters)
// =============================================================================

/**
 * Configuration options for glass material elements.
 * These parameters control the visual appearance of the glass effect.
 */
export interface LiquidRendererMaterialElementOptions {
  /**
   * Glass thickness affecting refraction depth.
   * @default 0.3
   */
  thickness?: number;

  /**
   * Index of refraction (1.0 = air, 1.5 = glass, 2.4 = diamond).
   * Higher values create more distortion.
   * @default 1.2
   */
  refractIndex?: number;

  /**
   * Overall intensity multiplier for the refraction effect.
   * @default 0.8
   */
  refractIntensity?: number;

  /**
   * Blur amount for the frosted glass effect.
   * @default 0.03
   */
  blur?: number;

  /**
   * Chromatic aberration (color separation) strength.
   * Range: 0.0 to 0.05. Higher values create rainbow edges.
   * @default 0.02
   */
  dispersion?: number;

  /**
   * Default corner radius for all corners (in pixels).
   */
  radius: number;

  /** Top-right corner radius override */
  radiusTR?: number;

  /** Bottom-right corner radius override */
  radiusBR?: number;

  /** Bottom-left corner radius override */
  radiusBL?: number;

  /** Top-left corner radius override */
  radiusTL?: number;

  /** Use custom background color instead of automatic detection */
  useCustomColor?: boolean;

  /**
   * Override render mode for this specific material.
   * - 'uniform': Share canvas with other materials (default, inherited from manager)
   * - 'dedicated': Use a dedicated canvas for this material
   * If not set, inherits from the parent LiquidGlass manager.
   */
  renderMode?: RenderMode;
}

/**
 * Resolved glass attributes with all values filled in.
 * Created from LiquidRendererMaterialElementOptions with defaults applied.
 */
export interface LiquidRendererMaterialGlassAttributions {
  thickness: number;
  refractIndex: number;
  refractIntensity: number;
  blur: number;
  dispersion: number;
  radius: number;
  radiusTR: number;
  radiusBR: number;
  radiusBL: number;
  radiusTL: number;
}

/**
 * Transform state for a material element.
 * Used for applying CSS transforms in WebGL rendering.
 */
export interface LiquidRendererMaterialElementTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;

  /**
   * Full CSS 2D transform matrix components [a, b, c, d, e, f].
   * Corresponds to matrix(a, b, c, d, e, f).
   * If undefined, computed from scale/translate values.
   */
  matrix?: [number, number, number, number, number, number];
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Reason why the texture needs to be re-rendered.
 * Used for optimizing update frequency based on change type.
 */
export type TextureDirtyReason =
  | 'layout' // Layout change (resize, position)
  | 'scroll' // Scroll position changed
  | 'material_interaction' // User interaction with material
  | 'structural' // DOM structure changed
  | 'external' // External trigger (API call)
  | 'unknown'; // Unknown reason

/**
 * Event payload when backdrop capture completes.
 */
export interface LiquidRendererBackdropCapturedEvent {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}

/**
 * Event payload when full composite canvas is rendered.
 * Used for nested LiquidGlass components.
 */
export interface LiquidRendererFullCanvasRenderedEvent {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}

/**
 * Automatic background color mode based on backdrop brightness.
 * Determines the tint applied to materials for optimal contrast.
 */
export type AutomaticBackgroundColorMode =
  | 'light' // Light backdrop, dark text/icons
  | 'dark' // Dark backdrop, light text/icons
  | 'ultra_light' // Very bright backdrop
  | 'ultra_dark'; // Very dark backdrop

// =============================================================================
// Viewport Optimization Types (Mobile Performance)
// =============================================================================

/**
 * Configuration for viewport-based backdrop capture optimization.
 * Used by LgBackdropConverter to capture only visible areas + buffer.
 */
export interface ViewportCaptureConfig {
  /**
   * Vertical buffer (in pixels) to capture above and below the visible area.
   * Helps prevent visible tearing during fast scrolling.
   * @default 200
   */
  bufferY?: number;
  /**
   * Horizontal buffer (in pixels) to capture left and right of the visible area.
   * Useful for horizontal scrolling scenarios.
   * @default 0
   */
  bufferX?: number;
  /**
   * Whether to enable viewport-based capture optimization.
   * When false, captures the entire element (original behavior).
   * @default true
   */
  enabled?: boolean;
}

/**
 * Represents the currently captured viewport region within a backdrop element.
 * Used to coordinate between backdrop capture and material rendering.
 */
export interface ViewportCaptureRect {
  /** X offset of the captured region relative to element's top-left (in CSS pixels) */
  x: number;
  /** Y offset of the captured region relative to element's top-left (in CSS pixels) */
  y: number;
  /** Width of the captured region (in CSS pixels) */
  width: number;
  /** Height of the captured region (in CSS pixels) */
  height: number;
}
