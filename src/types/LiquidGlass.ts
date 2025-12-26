export type RenderMode = 'uniform' | 'dedicated';

export type CustomDrawCallback = (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void;

/**
 * Configuration for theme color detection thresholds.
 * Luma values are in the range 0-255.
 * - Below ultraDarkMax: ultra_dark mode
 * - Below darkMax: dark mode
 * - Above ultraLightMin: ultra_light mode
 * - Otherwise: light mode
 */
export interface ThemeColorThresholds {
  /** Maximum luma for ultra_dark mode (default: 25) */
  ultraDarkMax?: number;
  /** Maximum luma for dark mode (default: 85) */
  darkMax?: number;
  /** Minimum luma for ultra_light mode (default: 230) */
  ultraLightMin?: number;
}

export interface LiquidRendererManagerOptions {
  /** Container can be undefined if the LiquidRendererManager is initialized before the container element is available */
  container?: HTMLElement;
  debug?: boolean;
  /** Render precision; 0 means auto */
  renderPrecision?: number;
  /**
   * Render mode determines how the rendering is handled.
   * - 'uniform': A single canvas will be used for all glass materials.
   *   This will make the z-index of the glass materials 10000.
   * - 'dedicated': Each glass material will have its own canvas.
   *   This allows for independent z-index management per material but may have performance implications with many materials.
   */
  renderMode?: RenderMode;
  /** Enable power efficient mode to reduce resource consumption */
  powerEfficientMode?: boolean;
  requireFullRender?: boolean;
  /** Enable scrollable mode - sets overflow:auto and enables scroll management */
  scrollable?: boolean;
  /**
   * Theme color detection thresholds (luma values 0-255).
   * Used to determine automatic background color mode for materials.
   */
  themeColorThresholds?: ThemeColorThresholds;
}

export type LiquidRendererBackdropElementType = 'canvas' | 'html' | 'scroll_box' | 'liquid_glass' | undefined;

export interface LiquidRendererBackdropElementOptions {
  zIndex?: number;
  type: LiquidRendererBackdropElementType;
  watchResize?: boolean;
  watchNodeChanges?: boolean;
  watchPositionChanges?: boolean;
  /** User canvas callback */
  userCanvasCallback?: CustomDrawCallback;
}

export interface LiquidRendererMaterialElementOptions {
  thickness?: number;
  refractIndex?: number;
  refractIntensity?: number;
  blur?: number;
  dispersion?: number; // Chromatic aberration strength (0.0 to 0.05)
  radius: number;
  radiusTR?: number;
  radiusBR?: number;
  radiusBL?: number;
  radiusTL?: number;
  useCustomColor?: boolean;
}

export interface LiquidRendererMaterialGlassAttributions {
  thickness: number;
  refractIndex: number;
  refractIntensity: number;
  blur: number;
  dispersion: number; // Chromatic aberration strength (0.0 to 0.05)
  radius: number;
  radiusTR: number;
  radiusBR: number;
  radiusBL: number;
  radiusTL: number;
}

export interface LiquidRendererMaterialElementTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
  /**
   * Full CSS 2D transform matrix components [a, b, c, d, e, f].
   * Corresponds to matrix(a, b, c, d, e, f) or the 2D portion of a 3D matrix.
   * If undefined, a matrix will be computed from scale/translate values.
   * The matrix is used by the shader for transform-aware rendering.
   */
  matrix?: [number, number, number, number, number, number];
}

export type TextureDirtyReason =
  | 'layout'
  | 'scroll'
  | 'material_interaction'
  | 'structural'
  | 'external'
  | 'unknown';

export interface LiquidRendererBackdropCapturedEvent {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}

export interface LiquidRendererFullCanvasRenderedEvent {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}

export type AutomaticBackgroundColorMode = 'light' | 'dark' | 'ultra_light' | 'ultra_dark';
