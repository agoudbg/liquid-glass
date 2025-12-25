/**
 * Types for Cross-Component Render Delegation
 *
 * This module defines the interfaces for materials that delegate their rendering
 * to a different LiquidGlass instance (proxy target).
 */

/**
 * Configuration data sent from Material to its proxy target LiquidGlass
 */
export interface ExternalMaterialConfig {
  /** Unique identifier for this external material */
  id: string;

  /** Client bounding rect in viewport coordinates */
  clientRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Border radius values (all four corners) */
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };

  /** Blur amount for the glass effect */
  blur: number;

  /** Glass thickness parameter */
  thickness: number;

  /** Refraction index for glass effect */
  refractIndex: number;

  /** Refraction intensity */
  refractIntensity: number;

  /** Chromatic aberration / dispersion strength */
  dispersion: number;

  /** Transform applied to the material (scale, translate) */
  transform: {
    scaleX: number;
    scaleY: number;
    translateX: number;
    translateY: number;
  };
}

/**
 * Data returned from proxy LiquidGlass to the Material
 * for background/text color adaptation
 */
export interface ExternalMaterialFeedback {
  /** The computed theme color mode based on the backdrop beneath this material */
  themeColorMode: 'light' | 'dark' | 'ultra_light' | 'ultra_dark';

  /** Average luminance of the backdrop area (0-255) */
  averageLuminance?: number;
}

/**
 * Registration callback for when material is first registered with proxy
 */
export type ExternalMaterialRegistrationCallback = (id: string, config: ExternalMaterialConfig) => void;

/**
 * Update callback for when material position/config changes
 */
export type ExternalMaterialUpdateCallback = (id: string, data: Partial<ExternalMaterialConfig>) => void;

/**
 * Unregistration callback for when material is removed
 */
export type ExternalMaterialUnregistrationCallback = (id: string) => void;

/**
 * Interface for the proxy target (LiquidGlass component) exposed methods
 */
export interface ProxyTargetInterface {
  /** Register a new external material with the proxy */
  registerExternalMaterial: ExternalMaterialRegistrationCallback;

  /** Update an existing external material's configuration */
  updateExternalMaterial: ExternalMaterialUpdateCallback;

  /** Unregister an external material */
  unregisterExternalMaterial: ExternalMaterialUnregistrationCallback;

  /** Get the container element's bounding rect for coordinate calculations */
  getContainerRect: () => DOMRect | null;

  /** Get the current scroll position of the proxy container */
  getScrollPosition: () => { x: number; y: number };

  /** Subscribe to feedback updates for a material */
  onMaterialFeedback: (id: string, callback: (feedback: ExternalMaterialFeedback) => void) => () => void;
}

/**
 * Computed canvas coordinates for an external material
 * relative to the proxy LiquidGlass's internal canvas
 */
export interface ExternalMaterialCanvasCoords {
  /** Destination X in the proxy's canvas (CSS pixels) */
  destX: number;

  /** Destination Y in the proxy's canvas (CSS pixels) */
  destY: number;

  /** Source X in the proxy's backdrop canvas (CSS pixels) */
  srcX: number;

  /** Source Y in the proxy's backdrop canvas (CSS pixels) */
  srcY: number;

  /** Width of the material region (CSS pixels) */
  width: number;

  /** Height of the material region (CSS pixels) */
  height: number;

  /** Whether the material is at least partially visible within the proxy bounds */
  isVisible: boolean;
}
