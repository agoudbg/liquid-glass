export interface LiquidRendererManagerOptions {
  /** Container can be undefined if the LiquidRendererManager is initialized before the container element is available */
  container?: HTMLElement;
  debug?: boolean;
  /** Render precision; 0 means auto */
  renderPrecision?: number;
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
