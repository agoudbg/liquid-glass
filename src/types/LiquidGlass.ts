export type RenderMode = 'uniform' | 'dedicated';

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
}

export interface LiquidRendererBackdropElementOptions {
  zIndex?: number;
  watchResize?: boolean;
  watchNodeChanges?: boolean;
  watchPositionChanges?: boolean;
}

export interface LiquidRendererMaterialElementOptions {
  thickness?: number;
  refractIndex?: number;
  refractIntensity?: number;
  radius: number;
  radiusTR?: number;
  radiusBR?: number;
  radiusBL?: number;
  radiusTL?: number;
  useAutomaticColor?: boolean;
}

export interface LiquidRendererMaterialGlassAttributions {
  thickness: number;
  refractIndex: number;
  refractIntensity: number;
  radius: number;
  radiusTR: number;
  radiusBR: number;
  radiusBL: number;
  radiusTL: number;
}

export interface LiquidRendererBackdropCapturedEvent {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}
