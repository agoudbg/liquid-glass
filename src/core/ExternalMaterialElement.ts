import type { ExternalMaterialConfig } from '../types/ExternalMaterial';
import {
  AutomaticBackgroundColorMode,
  LiquidRendererMaterialElementTransform,
  LiquidRendererMaterialGlassAttributions,
} from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';
import { LiquidRendererManager } from './LiquidRendererManager';

/**
 * A virtual material element that represents an external material
 * delegating its rendering to this LiquidGlass.
 *
 * Unlike LiquidRendererMaterialElement, this doesn't have a real DOM element.
 * Its position is calculated from viewport coordinates provided by the delegating material.
 */
export class ExternalMaterialElement extends EventEmitter {
  public manager: LiquidRendererManager;

  public materialId: string;

  public externalId: string;

  public glassAttributes: LiquidRendererMaterialGlassAttributions;

  public automaticBackgroundColorMode: AutomaticBackgroundColorMode = 'light';

  public position = { x: 0, y: 0 };

  public size = { width: 0, height: 0 };

  public transform: LiquidRendererMaterialElementTransform = {
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
  };

  /** External materials are never delegated to another proxy */
  public isDelegatedToProxy = false;

  /** Mark this as an external (virtual) material element */
  public isExternalMaterial = true;

  /** Callback to emit feedback to the delegating material */
  private feedbackCallback: ((mode: AutomaticBackgroundColorMode) => void) | null = null;

  constructor(
    manager: LiquidRendererManager,
    externalId: string,
    config: ExternalMaterialConfig,
  ) {
    super();
    this.manager = manager;
    this.externalId = externalId;
    this.materialId = `ext-proxy-${externalId}`;

    // Initialize glass attributes from config
    this.glassAttributes = {
      thickness: config.thickness,
      refractIndex: config.refractIndex,
      refractIntensity: config.refractIntensity,
      blur: config.blur,
      dispersion: config.dispersion,
      radius: config.borderRadius.topLeft, // Use TL as default
      radiusTL: config.borderRadius.topLeft,
      radiusTR: config.borderRadius.topRight,
      radiusBR: config.borderRadius.bottomRight,
      radiusBL: config.borderRadius.bottomLeft,
    };

    // Initialize transform from config
    this.transform = {
      scaleX: config.transform.scaleX,
      scaleY: config.transform.scaleY,
      translateX: config.transform.translateX,
      translateY: config.transform.translateY,
    };

    // Calculate initial position
    this.updateFromConfig(config);

    this.manager.log('debug', `ExternalMaterialElement created: ${this.materialId}`);
  }

  /**
   * Update position and size from external config
   */
  public updateFromConfig(config: ExternalMaterialConfig) {
    const containerRect = this.manager.container?.getBoundingClientRect();
    if (!containerRect) {
      this.manager.log('warn', 'No container rect available for external material');
      return;
    }

    const { clientRect, transform } = config;

    // Remove transform effects to get the "natural" position
    const safeScaleX = transform.scaleX === 0 ? 1 : transform.scaleX;
    const safeScaleY = transform.scaleY === 0 ? 1 : transform.scaleY;

    const naturalWidth = clientRect.width / safeScaleX;
    const naturalHeight = clientRect.height / safeScaleY;
    const scaleOffsetX = (clientRect.width - naturalWidth) / 2;
    const scaleOffsetY = (clientRect.height - naturalHeight) / 2;

    // Convert viewport coordinates to container-relative coordinates
    // This gives us the position relative to the visible viewport of the container
    const relativeX = clientRect.x - containerRect.left - transform.translateX + scaleOffsetX;
    const relativeY = clientRect.y - containerRect.top - transform.translateY + scaleOffsetY;

    // For external materials, we store the position relative to the visible viewport,
    // NOT the full canvas. The scroll offset will be applied during rendering
    // to sample from the correct part of the backdrop.
    // However, the manager's renderMaterials expects position in canvas coordinates.
    // So we add the current scroll offset here.
    this.position.x = relativeX + this.manager.scroll.x;
    this.position.y = relativeY + this.manager.scroll.y;

    this.size.width = naturalWidth;
    this.size.height = naturalHeight;

    // Update glass attributes
    this.glassAttributes = {
      thickness: config.thickness,
      refractIndex: config.refractIndex,
      refractIntensity: config.refractIntensity,
      blur: config.blur,
      dispersion: config.dispersion,
      radius: config.borderRadius.topLeft,
      radiusTL: config.borderRadius.topLeft,
      radiusTR: config.borderRadius.topRight,
      radiusBR: config.borderRadius.bottomRight,
      radiusBL: config.borderRadius.bottomLeft,
    };

    // Update transform
    this.transform = {
      scaleX: config.transform.scaleX,
      scaleY: config.transform.scaleY,
      translateX: config.transform.translateX,
      translateY: config.transform.translateY,
    };

    // Store the last config for recalculation on scroll
    this.lastConfig = config;

    this.manager.log('debug', `ExternalMaterial ${this.materialId} updated: pos=(${this.position.x}, ${this.position.y}) size=(${this.size.width}x${this.size.height})`);
  }

  /** Last config for recalculation on scroll */
  private lastConfig: ExternalMaterialConfig | null = null;

  /**
   * Recalculate position based on current scroll.
   * Called by the manager during its RAF loop when scroll changes.
   */
  public recalculatePosition() {
    if (this.lastConfig) {
      this.updateFromConfig(this.lastConfig);
    }
  }

  /**
   * Set the callback for theme color feedback
   */
  public setFeedbackCallback(callback: ((mode: AutomaticBackgroundColorMode) => void) | null) {
    this.feedbackCallback = callback;
  }

  /**
   * Called by the manager when theme color is determined
   */
  public setAutomaticBackgroundColorMode(mode: AutomaticBackgroundColorMode) {
    this.automaticBackgroundColorMode = mode;
    this.manager.log('debug', `ExternalMaterial ${this.materialId} theme mode: ${mode}`);
    this.emit('backgroundColorModeChanged', mode);

    // Send feedback to delegating material
    if (this.feedbackCallback) {
      this.feedbackCallback(mode);
    }
  }

  /**
   * Set transform (called during animation)
   */
  public setTransform(transform: LiquidRendererMaterialElementTransform) {
    this.transform = transform;
    this.manager.markTextureDirty();
  }

  /**
   * Update position and size.
   * For external materials, this recalculates based on the last config and current scroll.
   */
  public updatePositionAndSize(_options?: { suppressReRender?: boolean }) {
    // Recalculate position using stored config and current scroll
    this.recalculatePosition();
  }

  /**
   * Destroy this material element
   */
  public destroy() {
    this.manager.unregisterMaterialElement(this as any);
    this.feedbackCallback = null;
    this.manager.log('debug', `ExternalMaterialElement destroyed: ${this.materialId}`);
  }
}
