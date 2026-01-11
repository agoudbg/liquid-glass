/**
 * @fileoverview Material element wrapper for LiquidGlass rendering.
 *
 * This class manages a single material element (a glass panel) that displays
 * the liquid glass refraction effect. It tracks the element's position, size,
 * and transform, and communicates with the LiquidRendererManager for rendering.
 *
 * Key Features:
 * - Position/size tracking relative to LiquidGlass container
 * - CSS transform matrix parsing for complex animations
 * - Glass attribute management (refraction, blur, dispersion, etc.)
 * - Automatic theme color detection (light/dark background)
 * - Viewport visibility culling for performance
 * - Proxy delegation for nested LiquidGlass support
 *
 * Glass Attributes:
 * - thickness: How "thick" the glass appears (affects refraction depth)
 * - refractIndex: Index of refraction (1.0 = no refraction)
 * - refractIntensity: Strength of the refraction effect
 * - blur: Background blur amount (like frosted glass)
 * - dispersion: Chromatic aberration / color separation
 * - radius/radiusTR/BR/BL/TL: Corner radii for rounded rectangles
 *
 * @module LiquidRendererMaterialElement
 */

import {
  AutomaticBackgroundColorMode,
  LiquidRendererMaterialElementOptions,
  LiquidRendererMaterialElementTransform,
  LiquidRendererMaterialGlassAttributions,
  TextureDirtyReason,
} from '../types/LiquidGlass';
import { parseCSSTransformMatrix } from '../utils/featureDetect';
import { ComputedVisibility, computeElementVisibility } from '../utils/opacity';
import { EventEmitter } from './EventEmitter';
import { LiquidRendererManager } from './LiquidRendererManager';

/**
 * Represents a glass material element registered with the LiquidRendererManager.
 *
 * This class wraps an HTML element that displays the liquid glass effect.
 * The actual rendering is done by the WebGL renderer; this class is responsible
 * for tracking the element's state and communicating with the manager.
 *
 * @emits backgroundColorModeChanged - When the detected theme color changes
 */
export class LiquidRendererMaterialElement extends EventEmitter {
  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================

  /** Reference to the parent manager */
  public manager: LiquidRendererManager;

  /** The DOM element this material wraps */
  public element: HTMLElement;

  /** Unique identifier for this material (used by WebGL renderer) */
  public materialId: string;

  /** Configuration options for this material */
  public options: LiquidRendererMaterialElementOptions;

  /** Glass effect attributes (refraction, blur, etc.) */
  public glassAttributes!: LiquidRendererMaterialGlassAttributions;

  /**
   * Automatic background color mode detected from backdrop luminance.
   * Used by the component to adjust text/icon colors for contrast.
   */
  public automaticBackgroundColorMode: AutomaticBackgroundColorMode = 'light';

  /** Position relative to LiquidGlass container (includes scroll offset) */
  public position = { x: 0, y: 0 };

  /** Size in CSS pixels */
  public size = { width: 0, height: 0 };

  /**
   * Transform state including both programmatic (interaction) and CSS transforms.
   * - scaleX/scaleY: Scale factors from interaction
   * - translateX/translateY: Translation from interaction
   * - matrix: Parsed CSS transform matrix (for complex animations)
   */
  public transform: LiquidRendererMaterialElementTransform = {
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
  };

  /**
   * When true, this material's glass rendering is delegated to a proxy LiquidGlass.
   * This happens in nested LiquidGlass scenarios where a child LiquidGlass
   * takes over rendering for materials that overlap it.
   */
  public isDelegatedToProxy = false;

  /**
   * Whether the material is currently visible in the viewport.
   * Used for visibility culling - when false, the material skips rendering.
   * Set by LiquidGlassMaterial component via IntersectionObserver.
   */
  public isInViewport = true;

  /**
   * Cached computed visibility (opacity and hidden state).
   * Hidden elements (opacity: 0, visibility: hidden, display: none) are skipped.
   */
  public visibility: ComputedVisibility = { state: 'visible', opacity: 1 };

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * Create a new material element wrapper.
   *
   * @param manager - The parent LiquidRendererManager
   * @param element - The DOM element to wrap
   * @param options - Configuration options (radius, refraction settings, etc.)
   */
  constructor(manager: LiquidRendererManager, element: HTMLElement, options: LiquidRendererMaterialElementOptions) {
    super();
    this.manager = manager;
    this.element = element;
    this.options = {
      ...options,
    };
    this.materialId = this.element.id || `material-${Math.random().toString(36).substr(2, 9)}`;

    // Initialize glass attributes with defaults or options
    this.initializeGlassAttributes(options);

    // Register this element with the manager
    this.manager.registerMaterialElement(this);

    this.addEventListeners();

    this.updatePositionAndSize();

    this.manager.log('debug', 'LiquidRendererMaterialElement created for element:', element);
  }

  // ============================================================================
  // OPTIONS AND ATTRIBUTES
  // ============================================================================

  /**
   * Update options for this material element.
   *
   * @param options - Partial options to update
   */
  public setOptions(options: Partial<LiquidRendererMaterialElementOptions>) {
    this.options = { ...this.options, ...options };
    this.initializeGlassAttributes(this.options);
    // this.manager.requestMaterialsRender();
  }

  /**
   * Initialize glass attributes from options with defaults.
   *
   * Priority:
   * 1. Explicitly set options (refractIndex, thickness, etc.)
   * 2. Recommended attributes based on element size
   * 3. Per-corner radii fall back to main radius
   *
   * @param options - The options to initialize from
   */
  private initializeGlassAttributes(options: LiquidRendererMaterialElementOptions) {
    this.glassAttributes = {
      radius: options.radius,
      radiusTR: options.radiusTR ?? options.radius,
      radiusBR: options.radiusBR ?? options.radius,
      radiusBL: options.radiusBL ?? options.radius,
      radiusTL: options.radiusTL ?? options.radius,
      ...this.getRecommendedAttributes(),
      ...this.options.refractIndex && { refractIndex: this.options.refractIndex },
      ...this.options.thickness && { thickness: this.options.thickness },
      ...this.options.refractIntensity && { refractIntensity: this.options.refractIntensity },
      ...this.options.blur && { blur: this.options.blur },
      ...this.options.dispersion !== undefined && { dispersion: this.options.dispersion },
    };
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  /**
   * Add event listeners based on options.
   *
   * Note: Material elements don't add individual resize/scroll observers.
   * All position updates are handled by the manager's centralized RAF loop.
   * This reduces performance overhead and prevents cascading updates.
   */
  private addEventListeners() {
    // No individual listeners needed - manager handles all resize/position updates via RAF loop
    // This reduces performance overhead and prevents cascading updates
    this.manager.log('debug', 'MaterialElement initialized without individual observers');
  }

  // ============================================================================
  // POSITION AND SIZE
  // ============================================================================

  /**
   * Update the element's position and size from the DOM.
   *
   * This method:
   * 1. Reads the element's bounding rect
   * 2. Parses CSS transform matrix for complex animations
   * 3. Compensates for scale transforms to get base size
   * 4. Calculates position relative to LiquidGlass container
   * 5. Computes cumulative opacity for transparency
   * 6. Re-initializes glass attributes (may depend on size)
   *
   * Transform Handling:
   * - Interaction transforms (translateX/Y, scaleX/Y) are tracked separately
   * - CSS transform matrix is parsed and stored for the renderer
   * - Position calculation compensates for scale to get "untransformed" position
   *
   * @param options - Control whether to trigger re-render and reason
   */
  public updatePositionAndSize(options?: { suppressReRender?: boolean; reason?: TextureDirtyReason }) {
    const rect = this.element.getBoundingClientRect();
    const containerRect = this.manager.container.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const {
      translateX, translateY, scaleX, scaleY,
    } = this.transform;

    const safeScaleX = scaleX === 0 ? 1 : scaleX;
    const safeScaleY = scaleY === 0 ? 1 : scaleY;

    // Extract the CSS transform matrix from the element's computed style
    // This captures the full transform including skew/rotation applied via CSS or animation
    const computedStyle = window.getComputedStyle(this.element);
    const cssTransform = computedStyle.transform;
    const cssMatrix = parseCSSTransformMatrix(cssTransform);

    // Merge the CSS matrix with any programmatic transform from interaction
    // The interaction transform (translateX, translateY, scaleX, scaleY) is applied on top
    // We need to compose the matrices: cssMatrix * interactionMatrix
    // For now, we store the CSS matrix and let the renderer use it for shape distortion
    // while keeping the interaction transform separate for position calculations
    this.transform.matrix = cssMatrix;

    // Remove current transform offsets so the renderer does not double-apply them.
    // Because scaling occurs around the element's origin (default center), add back
    // the half-difference introduced by the scale to recover the pre-scale box.
    const width = rect.width / safeScaleX;
    const height = rect.height / safeScaleY;
    const offsetXFromScale = (rect.width - width) / 2;
    const offsetYFromScale = (rect.height - height) / 2;
    const elementLeftDocument = rect.left + scrollX;
    const elementTopDocument = rect.top + scrollY;
    const containerLeftDocument = containerRect.left + scrollX;
    const containerTopDocument = containerRect.top + scrollY;

    // Position relative to the LiquidGlass container content coordinates
    // (container origin plus its own scroll offset).
    this.position.x = elementLeftDocument - containerLeftDocument - translateX + offsetXFromScale + this.manager.scroll.x;
    this.position.y = elementTopDocument - containerTopDocument - translateY + offsetYFromScale + this.manager.scroll.y;

    this.size.width = width;
    this.size.height = height;

    // Compute cumulative opacity from element up to LiquidGlass container
    this.visibility = computeElementVisibility(this.element, this.manager.container);

    // Since position or size may have changed, re-calculate recommended attributes
    this.initializeGlassAttributes(this.options);

    if (!options?.suppressReRender) {
      this.sendReRenderRequest(options?.reason ?? 'layout');
    }
  }

  /**
   * Request the manager to re-render materials.
   *
   * @param reason - The reason for re-render (affects throttling for nested LiquidGlass)
   */
  public sendReRenderRequest(reason: TextureDirtyReason = 'material_interaction') {
    this.manager.log('debug', 'Requesting re-render for material element:', this.element);
    this.manager.markTextureDirty(reason);
  }

  /**
   * Calculate and return recommended attributes for the material element.
   *
   * TODO: Implement logic to calculate recommended attributes based on:
   * - Element size (larger elements may need different settings)
   * - Device capabilities
   * - Performance mode
   *
   * @returns Default glass attributes
   */
  // eslint-disable-next-line class-methods-use-this
  public getRecommendedAttributes(): Omit<LiquidRendererMaterialGlassAttributions, 'radius' | 'radiusTR' | 'radiusBR' | 'radiusBL' | 'radiusTL'> {
    // Todo: implement logic to calculate recommended attributes

    return {
      thickness: 10,
      refractIndex: 1.1,
      refractIntensity: 0.5,
      blur: 0,
      dispersion: 0.01,
    };
  }

  // ============================================================================
  // THEME COLOR DETECTION
  // ============================================================================

  /**
   * Set the automatic background color mode based on backdrop luminance.
   *
   * Called by the manager after analyzing the backdrop colors beneath this material.
   * The component can listen to 'backgroundColorModeChanged' to update text/icon colors.
   *
   * @param mode - The detected mode: 'light', 'dark', 'ultra_light', or 'ultra_dark'
   */
  public setAutomaticBackgroundColorMode(mode: AutomaticBackgroundColorMode) {
    this.automaticBackgroundColorMode = mode;
    this.manager.log('debug', 'Material element automatic background color mode set to:', mode, 'for element:', this.element);
    this.emit('backgroundColorModeChanged', mode);
  }

  // ============================================================================
  // TRANSFORM
  // ============================================================================

  /**
   * Set the interaction transform for this material.
   *
   * Used for click/touch interactions that scale or translate the material.
   * This is separate from CSS transforms applied via stylesheets.
   *
   * @param transform - The new transform state
   */
  public setTransform(transform: LiquidRendererMaterialElementTransform) {
    this.transform = transform;
    this.manager.log('debug', 'Material element transform set to:', transform, 'for element:', this.element);

    // Recalculate bounds with the latest interaction transform so the WebGL
    // material stays aligned with the DOM element during animations.
    this.updatePositionAndSize({ suppressReRender: true, reason: 'material_interaction' });

    this.sendReRenderRequest('material_interaction');
  }

  // ============================================================================
  // VIEWPORT VISIBILITY
  // ============================================================================

  /**
   * Set the viewport visibility state for this material.
   *
   * Called by the component's IntersectionObserver when the material
   * enters or leaves the viewport. Used for visibility culling.
   *
   * @param inViewport - Whether the material is currently in viewport
   * @param requestUpdate - Whether to request a manager update when entering viewport
   */
  public setViewportVisibility(inViewport: boolean, requestUpdate = true) {
    const wasInViewport = this.isInViewport;
    this.isInViewport = inViewport;

    if (inViewport && !wasInViewport && requestUpdate) {
      // Material just entered viewport - request position update and re-render
      this.manager.log('debug', 'Material entered viewport, requesting update:', this.element);
      this.updatePositionAndSize({ suppressReRender: false, reason: 'layout' });
    } else if (!inViewport && wasInViewport) {
      this.manager.log('debug', 'Material left viewport:', this.element);
    }
  }

  /**
   * Check if this material should be rendered.
   *
   * Returns false if:
   * - Material is outside viewport (isInViewport = false)
   * - Material is delegated to a proxy LiquidGlass
   *
   * @returns True if the material should be rendered
   */
  public shouldRender(): boolean {
    return this.isInViewport && !this.isDelegatedToProxy;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Destroy this material element and clean up resources.
   *
   * IMPORTANT: After calling destroy(), this element is no longer usable.
   */
  public destroy() {
    // Unregister this element from the manager
    this.manager.unregisterMaterialElement(this);
    this.manager.log('debug', 'LiquidRendererMaterialElement destroyed for element:', this.element);
  }
}
