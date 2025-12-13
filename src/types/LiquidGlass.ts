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

export interface LiquidRendererBackdropCapturedEvent {
  canvas: OffscreenCanvas;
  width: number;
  height: number;
}
