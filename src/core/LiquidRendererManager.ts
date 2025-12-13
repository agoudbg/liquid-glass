import { LiquidRendererBackdropCapturedEvent, LiquidRendererManagerOptions } from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';
import { createLiquidGlassRenderer, LiquidGlassRenderer } from './liquidGlassRenderer';
import { LiquidRendererBackdropElement } from './LiquidRendererBackdropElement';
import { LiquidRendererMaterialElement } from './LiquidRendererMaterialElement';

export class LiquidRendererManager extends EventEmitter {
  public debug = false;

  public container: HTMLElement;

  public backdropCanvas = new OffscreenCanvas(1, 1);

  public materialsCanvas = document.createElement('canvas');

  private renderer: LiquidGlassRenderer | null = null;

  public renderPrecision = 0; // 0=auto

  public renderMode: 'uniform' | 'dedicated' = 'uniform';

  public registeredBackdropElements: LiquidRendererBackdropElement[] = [];

  public registeredMaterialElements: LiquidRendererMaterialElement[] = [];

  public isRenderingBackdrop = false;

  public hasPendingBackdropRenderRequest = false;

  public isRenderingMaterials = false;

  public hasPendingMaterialsRenderRequest = false;

  public glassNotSupported = false;

  public powerEfficientMode = false;

  public isFallbackMode = false;

  public position = { x: 0, y: 0 };

  public size = { width: 0, height: 0 };

  constructor(options: LiquidRendererManagerOptions) {
    super();
    // Initialize with options if needed
    this.debug = options.debug ?? false;

    this.log('debug', 'Initializing LiquidRendererManager with options:', options);

    // Add resize listener and observer for container
    if (options.container) {
      this.container = options.container;
      this.addResizeListeners();
    } else {
      // Fallback to document body if no container provided
      this.container = document.body;
      // This will not run resize listeners until container is set
      this.log('warn', 'No container provided for LiquidRendererManager; resize listeners not added.');
    }

    this.renderPrecision = options.renderPrecision ?? 0;

    this.renderMode = options.renderMode ?? 'uniform';

    this.powerEfficientMode = options.powerEfficientMode ?? false;

    this.log('debug', 'LiquidRendererManager initialized');
  }

  /**
   * Update manager options
   */
  public setOptions(options: Partial<LiquidRendererManagerOptions>) {
    if (options.debug !== undefined) {
      this.debug = options.debug;
      this.log('debug', `Debug mode set to: ${this.debug}`);
    }

    if (options.container && options.container !== this.container) {
      this.container = options.container;
      this.log('debug', 'Container updated, adding resize listeners.');
      this.addResizeListeners();
    }

    if (options.renderPrecision !== undefined) {
      this.renderPrecision = options.renderPrecision;
      this.log('debug', `Render precision set to: ${this.renderPrecision}`);
    }

    if (options.renderMode !== undefined) {
      this.renderMode = options.renderMode;
      this.log('debug', `Render mode set to: ${this.renderMode}`);
    }

    if (options.powerEfficientMode !== undefined) {
      this.powerEfficientMode = options.powerEfficientMode;
      this.log('debug', `Power efficient mode set to: ${this.powerEfficientMode}`);
    }
  }

  public registerBackdropElement(element: LiquidRendererBackdropElement) {
    this.registeredBackdropElements.push(element);
    this.log('debug', 'Registered backdrop element:', element.element);
    this.onBackdropElementChange();
  }

  public unregisterBackdropElement(element: LiquidRendererBackdropElement) {
    this.registeredBackdropElements = this.registeredBackdropElements.filter(
      (el) => el !== element,
    );
    this.log('debug', 'Unregistered backdrop element:', element.element);
    this.onBackdropElementChange();
  }

  public onBackdropElementChange() {
    this.emit('backdropElementChanged', this.registeredBackdropElements);

    // Re-capture the backdrop when elements change
    // Check pending requests
    const pendingRequests = this.registeredBackdropElements.some(
      (el) => el.isReCapturing || el.hasPendingCaptureRequest,
    );
    if (pendingRequests) {
      this.log('debug', 'Backdrop capture deferred due to pending requests from backdrop elements.');
      return;
    }

    this.log('debug', 'No pending. Backdrop elements changed, capturing backdrop.');
    this.captureBackdrop();
  }

  public registerMaterialElement(element: LiquidRendererMaterialElement) {
    this.registeredMaterialElements.push(element);
    this.log('debug', 'Registered material element:', element.element);
    this.onMaterialElementChange();
  }

  public unregisterMaterialElement(element: LiquidRendererMaterialElement) {
    this.registeredMaterialElements = this.registeredMaterialElements.filter(
      (el) => el !== element,
    );
    this.log('debug', 'Unregistered material element:', element.element);
    this.onMaterialElementChange();
  }

  public onMaterialElementChange() {
    this.emit('materialElementChanged', this.registeredMaterialElements);

    // Re-render materials when elements change
    this.renderMaterials();
  }

  /**
   * Add resize listeners to handle container size changes
   */
  private addResizeListeners() {
    this.log('debug', 'Adding resize listeners');

    const resizeObserver = new ResizeObserver(() => {
      this.onContainerChange();
    });
    resizeObserver.observe(this.container);

    window.addEventListener('resize', () => {
      this.onContainerChange();
    });

    // Initial resize
    this.onContainerChange();
  }

  /**
   * Update container position and size
   */
  private updateContainerPositionAndSize() {
    const rect = this.container.getBoundingClientRect();
    this.position.x = rect.left + window.scrollX;
    this.position.y = rect.top + window.scrollY;
    this.size.width = rect.width;
    this.size.height = rect.height;

    return rect;
  }

  /**
   * Handle container change events
   */
  private onContainerChange() {
    this.log('debug', 'Container resized');

    const rect = this.updateContainerPositionAndSize();
    this.backdropCanvas.width = rect.width * (window.devicePixelRatio || 1);
    this.backdropCanvas.height = rect.height * (window.devicePixelRatio || 1);

    this.materialsCanvas.width = rect.width * (window.devicePixelRatio || 1);
    this.materialsCanvas.height = rect.height * (window.devicePixelRatio || 1);

    this.log('debug', `Canvas resized to ${this.backdropCanvas.width}x${this.backdropCanvas.height}`);

    // Capture the backdrop after resizing
    this.captureBackdrop();
  }

  /**
   * Capture the backdrop of the container element with all registered elements
   */
  private captureBackdrop() {
    if (this.isRenderingBackdrop) {
      this.hasPendingBackdropRenderRequest = true;
      this.log('debug', 'Backdrop capture already in progress, marking pending request.');
      return;
    }

    this.isRenderingBackdrop = true;
    this.updateFallbackMode();

    this.log('debug', 'Capturing backdrop for container');

    // Clear the canvas
    const ctx = this.backdropCanvas.getContext('2d');
    if (!ctx) {
      this.log('error', 'Failed to get 2D context for backdrop canvas');
      return;
    }
    ctx.clearRect(0, 0, this.backdropCanvas.width, this.backdropCanvas.height);

    // Get the container's background configuration
    const style = getComputedStyle(this.container);
    const { backgroundColor, backgroundImage } = style;

    // Fill background color
    if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, this.backdropCanvas.width, this.backdropCanvas.height);
      this.log('debug', `Filled backdrop with background color: ${backgroundColor}`);
    }

    // Draw background image if exists
    if (backgroundImage && backgroundImage !== 'none') {
      const imageUrlMatch = backgroundImage.match(/url\(["']?(.+?)["']?\)/);
      if (imageUrlMatch) {
        const imageUrl = imageUrlMatch[1];
        const img = new Image();
        img.crossOrigin = 'Anonymous'; // Handle CORS if needed
        img.onload = () => {
          ctx.drawImage(img, 0, 0, this.backdropCanvas.width, this.backdropCanvas.height);
          this.log('debug', `Drew backdrop image from URL: ${imageUrl}`);
        };
        img.onerror = () => {
          this.log('error', `Failed to load backdrop image from URL: ${imageUrl}`);
        };
        img.src = imageUrl;
      }
    }

    // Draw registered elements onto the backdrop canvas
    this.registeredBackdropElements.forEach((element) => {
      const { position, size, canvas } = element;

      if (!canvas) {
        this.log('warn', 'Backdrop element has no canvas to draw:', element.element);
        return;
      }

      this.log('debug', `Drew backdrop element onto canvas at (${position.x}, ${position.y})`);

      // OffscreenCanvas is already a valid CanvasImageSource; draw directly to avoid ImageBitmap allocation failures
      if (size.width > 0 && size.height > 0) {
        ctx.drawImage(
          canvas,
          position.x,
          position.y,
          size.width,
          size.height,
        );
      } else {
        this.log('warn', 'Backdrop element has zero size, skipped drawing:', element.element);
      }
    });

    // Emit event that backdrop capture is complete

    this.emit('backdropCaptured', {
      canvas: this.backdropCanvas,
      width: this.backdropCanvas.width,
      height: this.backdropCanvas.height,
    } as LiquidRendererBackdropCapturedEvent);

    this.log('debug', 'Backdrop capture complete');

    this.isRenderingBackdrop = false;
    this.updateFallbackMode();

    // If there was a pending request, trigger another capture
    if (this.hasPendingBackdropRenderRequest) {
      this.hasPendingBackdropRenderRequest = false;
      this.captureBackdrop();
      return;
    }

    this.renderMaterials();
  }

  public renderMaterials() {
    if (this.isRenderingMaterials) {
      this.hasPendingMaterialsRenderRequest = true;
      this.log('debug', 'Materials rendering already in progress, marking pending request.');
      return;
    }

    this.isRenderingMaterials = true;

    this.log('debug', 'Rendering materials for registered material elements');

    // Dispose existing renderer to recreate with new materials
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    // Create renderer on the persistent materialsCanvas
    this.renderer = createLiquidGlassRenderer(this.materialsCanvas, {
      renderScale: this.getRenderPrecision(),
    });
    if (!this.renderer) {
      this.log('error', 'Failed to create LiquidGlassRenderer');
      this.glassNotSupported = true;
      this.updateFallbackMode();
      this.isRenderingMaterials = false;
      return;
    }

    // Add materials
    this.registeredMaterialElements.forEach((element) => {
      const { glassAttributes, position, size } = element;

      this.renderer!.addMaterial(
        element.element.id || `material-${Math.random().toString(36).substr(2, 9)}`,
        {
          thickness: glassAttributes.thickness,
          refractIndex: glassAttributes.refractIndex,
          refractIntensity: glassAttributes.refractIntensity,
          radius: glassAttributes.radius,
          radiusTR: glassAttributes.radiusTR,
          radiusBR: glassAttributes.radiusBR,
          radiusBL: glassAttributes.radiusBL,
          radiusTL: glassAttributes.radiusTL,
          width: size.width / (window.devicePixelRatio || 1),
          height: size.height / (window.devicePixelRatio || 1),
          foregroundColor: [0, 0, 0, 0],
        },
        {
          x: position.x + size.width / 2 / (window.devicePixelRatio || 1),
          y: position.y + size.height / 2 / (window.devicePixelRatio || 1),
        },
      );
    });

    // Convert OffscreenCanvas to HTMLCanvasElement for WebGL processing
    const backdropCanvasForGL = document.createElement('canvas');
    backdropCanvasForGL.width = this.backdropCanvas.width;
    backdropCanvasForGL.height = this.backdropCanvas.height;
    const backdropCtxForGL = backdropCanvasForGL.getContext('2d');
    if (backdropCtxForGL) {
      backdropCtxForGL.drawImage(this.backdropCanvas, 0, 0);
    } else {
      this.log('error', 'Failed to get 2D context for backdrop canvas conversion');
      this.isRenderingMaterials = false;
      return;
    }

    // Set backdrop
    this.renderer.setBackground(backdropCanvasForGL);

    // Render
    this.renderer.resize();
    this.log('debug', 'Materials renderer updated');

    // Defer the emit to the next animation frame so that the WebGL draw has completed.
    requestAnimationFrame(() => {
      this.emit('materialsRendered');

      this.isRenderingMaterials = false;

      // If there was a pending request, trigger another render
      if (this.hasPendingMaterialsRenderRequest) {
        this.hasPendingMaterialsRenderRequest = false;
        this.renderMaterials();
      }
    });
  }

  public dispose() {
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  public getRenderPrecision() {
    return this.renderPrecision === 0 ? 1 : this.renderPrecision;
  }

  public updateFallbackMode() {
    this.log('debug', 'Updating fallback mode. Glass supported:', !this.glassNotSupported, 'Power efficient mode:', this.powerEfficientMode, 'Is rendering backdrop:', this.isRenderingBackdrop);
    if (this.glassNotSupported) {
      this.isFallbackMode = true;
      this.log('debug', 'Glass not supported, enabling fallback mode.');
    } else if (this.isRenderingBackdrop && this.powerEfficientMode) {
      this.isFallbackMode = true;
    } else {
      this.isFallbackMode = false;
    }

    this.log('debug', 'Fallback mode set to:', this.isFallbackMode);

    this.emit('fallbackModeChanged', this.isFallbackMode);
  }

  /**
   * Log messages based on the debug flag
   */
  public log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: any[]) {
    if (level === 'debug' && !this.debug) return;

    const prefix = '[LiquidRendererManager] ';

    switch (level) {
      case 'info':
        console.info(`${prefix}${message}`, ...args);
        break;
      case 'warn':
        console.warn(`${prefix}${message}`, ...args);
        break;
      case 'error':
        console.error(`${prefix}${message}`, ...args);
        break;
      case 'debug':
        console.debug(`${prefix}${message}`, ...args);
        break;
      default:
    }
  }
}
