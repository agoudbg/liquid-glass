import {
  AutomaticBackgroundColorMode, LiquidRendererMaterialElementOptions, LiquidRendererMaterialElementTransform, LiquidRendererMaterialGlassAttributions,
} from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';
import { LiquidRendererManager } from './LiquidRendererManager';

export class LiquidRendererMaterialElement extends EventEmitter {
  public manager: LiquidRendererManager;

  public element: HTMLElement;

  public materialId: string;

  public options: LiquidRendererMaterialElementOptions;

  public glassAttributes!: LiquidRendererMaterialGlassAttributions;

  public automaticBackgroundColorMode: AutomaticBackgroundColorMode = 'light';

  public position = { x: 0, y: 0 };

  public size = { width: 0, height: 0 };

  public transform: LiquidRendererMaterialElementTransform = {
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
  };

  /**
   * When true, this material's glass rendering is delegated to a proxy LiquidGlass.
   * The parent manager should skip rendering for this material.
   */
  public isDelegatedToProxy = false;

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

  public setOptions(options: Partial<LiquidRendererMaterialElementOptions>) {
    this.options = { ...this.options, ...options };
    this.initializeGlassAttributes(this.options);
    // this.manager.requestMaterialsRender();
  }

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

  /**
   * Add event listeners based on options
   */
  private addEventListeners() {
    // No individual listeners needed - manager handles all resize/position updates via RAF loop
    // This reduces performance overhead and prevents cascading updates
    this.manager.log('debug', 'MaterialElement initialized without individual observers');
  }

  public updatePositionAndSize(options?: { suppressReRender?: boolean }) {
    const rect = this.element.getBoundingClientRect();
    const {
      translateX, translateY, scaleX, scaleY,
    } = this.transform;

    const safeScaleX = scaleX === 0 ? 1 : scaleX;
    const safeScaleY = scaleY === 0 ? 1 : scaleY;

    // Remove current transform offsets so the renderer does not double-apply them.
    // Because scaling occurs around the element's origin (default center), add back
    // the half-difference introduced by the scale to recover the pre-scale box.
    const width = rect.width / safeScaleX;
    const height = rect.height / safeScaleY;
    const offsetXFromScale = (rect.width - width) / 2;
    const offsetYFromScale = (rect.height - height) / 2;
    const x = rect.left + window.scrollX - translateX + offsetXFromScale;
    const y = rect.top + window.scrollY - translateY + offsetYFromScale;

    // Position should be relative to the document
    this.position.x = x - this.manager.position.x + this.manager.scroll.x;
    this.position.y = y - this.manager.position.y + this.manager.scroll.y;

    this.size.width = width;
    this.size.height = height;

    // Since position or size may have changed, re-calculate recommended attributes
    this.initializeGlassAttributes(this.options);

    if (!options?.suppressReRender) {
      this.sendReRenderRequest();
    }
  }

  public sendReRenderRequest() {
    this.manager.log('debug', 'Requesting re-render for material element:', this.element);
    this.manager.markTextureDirty();
  }

  /**
   * Calculate and return recommended attributes for the material element
   * based on its size
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

  public setAutomaticBackgroundColorMode(mode: AutomaticBackgroundColorMode) {
    this.automaticBackgroundColorMode = mode;
    this.manager.log('debug', 'Material element automatic background color mode set to:', mode, 'for element:', this.element);
    this.emit('backgroundColorModeChanged', mode);
  }

  public setTransform(transform: LiquidRendererMaterialElementTransform) {
    this.transform = transform;
    this.manager.log('debug', 'Material element transform set to:', transform, 'for element:', this.element);
    this.sendReRenderRequest();
  }

  /**
   * Destroy this material element and clean up
   */
  public destroy() {
    // Unregister this element from the manager
    this.manager.unregisterMaterialElement(this);
    this.manager.log('debug', 'LiquidRendererMaterialElement destroyed for element:', this.element);
  }
}
