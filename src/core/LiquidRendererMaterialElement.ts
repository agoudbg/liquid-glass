import { LiquidRendererMaterialElementOptions, LiquidRendererMaterialGlassAttributions } from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';
import { LiquidRendererManager } from './LiquidRendererManager';

export class LiquidRendererMaterialElement extends EventEmitter {
  public manager: LiquidRendererManager;

  public element: HTMLElement;

  public options: LiquidRendererMaterialElementOptions;

  public glassAttributes!: LiquidRendererMaterialGlassAttributions;

  public position = { x: 0, y: 0 };

  public size = { width: 0, height: 0 };

  constructor(manager: LiquidRendererManager, element: HTMLElement, options: LiquidRendererMaterialElementOptions) {
    super();
    this.manager = manager;
    this.element = element;
    this.options = options;

    // Initialize glass attributes with defaults or options
    this.initializeGlassAttributes(options);

    // Register this element with the manager
    this.manager.registerMaterialElement(this);

    this.addEventListeners();

    this.updatePositionAndSize();

    this.manager.log('debug', 'LiquidRendererMaterialElement created for element:', element);
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
    };
  }

  /**
   * Add event listeners based on options
   */
  private addEventListeners() {
    // Add any event listeners needed for this material element
    // Todo: add debounce
    const resizeObserver = new ResizeObserver(() => {
      this.manager.log('debug', 'Material element resized:', this.element);
      // Handle resize logic
      this.updatePositionAndSize();
    });
    resizeObserver.observe(this.element);
  }

  public updatePositionAndSize() {
    const rect = this.element.getBoundingClientRect();
    const x = rect.left + window.scrollX;
    const y = rect.top + window.scrollY;

    // Position should be relative to the document
    this.position.x = x - this.manager.position.x;
    this.position.y = y - this.manager.position.y;

    this.size.width = rect.width * (window.devicePixelRatio || 1);
    this.size.height = rect.height * (window.devicePixelRatio || 1);

    // Since position or size may have changed, re-calculate recommended attributes
    this.initializeGlassAttributes(this.options);

    console.log('LiquidRendererMaterialElement: updatePositionAndSize called, position:', this.position, 'size:', this.size, 'attributes:', this.glassAttributes);

    this.sendReRenderRequest();
  }

  public sendReRenderRequest() {
    this.manager.log('debug', 'Requesting re-render for material element:', this.element);
    this.manager.onMaterialElementChange();
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
    };
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
