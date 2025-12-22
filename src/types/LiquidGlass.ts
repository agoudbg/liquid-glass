export type RenderMode = 'uniform' | 'dedicated';

export type CustomDrawCallback = (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void;

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
}

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
