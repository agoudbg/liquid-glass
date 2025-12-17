import { toCanvas } from 'html-to-image';

import { AutomaticBackgroundColorMode, LiquidRendererBackdropCapturedEvent, LiquidRendererManagerOptions } from '../types/LiquidGlass';
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

  // Performance optimization: persistent canvas for WebGL backdrop conversion
  private backdropCanvasForGL: HTMLCanvasElement | null = null;

  private backdropCanvasForGLCtx: CanvasRenderingContext2D | null = null;

  // Performance optimization: dirty flag to avoid unnecessary texture uploads
  private isBackdropDirty = true;

  // Track which materials have been added to avoid remove+add on every frame
  private addedMaterialIds = new Set<string>();

  public visible: boolean = true;

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

      // Update container position first, BEFORE triggering any re-renders.
      // This ensures that when materials re-calculate their positions,
      // manager.position is already set correctly.
      this.updateContainerPositionAndSize();

      // After container position is updated, re-calculate all element positions.
      // This is necessary because elements may have been registered before the container
      // was set, and their positions were calculated relative to (0, 0).
      // We suppress re-render because addResizeListeners() will trigger onContainerChange()
      // which will capture backdrop and render materials properly.
      this.registeredBackdropElements.forEach((el) => {
        el.updatePositionAndSize({ suppressReRender: true });
      });
      this.registeredMaterialElements.forEach((el) => {
        el.updatePositionAndSize({ suppressReRender: true });
      });

      // Now add resize listeners, which will trigger onContainerChange() and render.
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
  private async onContainerChange() {
    this.log('debug', 'Container resized');

    const rect = this.updateContainerPositionAndSize();
    const dpr = window.devicePixelRatio || 1;
    const newWidth = Math.round(rect.width * dpr);
    const newHeight = Math.round(rect.height * dpr);

    // Skip if container has no size yet
    if (newWidth <= 0 || newHeight <= 0) {
      this.log('debug', 'Skipping resize - container has no size');
      return;
    }

    // Check if size actually changed
    const sizeChanged = this.backdropCanvas.width !== newWidth || this.backdropCanvas.height !== newHeight;
    if (!sizeChanged) {
      this.log('debug', 'Container size unchanged, skipping resize');
      return;
    }

    this.backdropCanvas.width = newWidth;
    this.backdropCanvas.height = newHeight;

    // If a backdrop capture is in progress, we need to restart it with the new size
    // Mark that we need to redo the capture
    if (this.isRenderingBackdrop) {
      this.hasPendingBackdropRenderRequest = true;
      this.log('debug', 'Backdrop capture in progress, will restart after current capture');
    }

    // Check if materialsCanvas size needs to change
    // Modifying canvas.width/height resets WebGL context, so we must dispose the renderer
    if (this.materialsCanvas.width !== newWidth || this.materialsCanvas.height !== newHeight) {
      this.log('debug', 'Materials canvas size changed, disposing old renderer');
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer = null;
      }
      // Clear tracked materials so they get re-added to the new renderer
      this.addedMaterialIds.clear();
      // Clear cached backdrop canvas so it gets recreated with new size
      this.backdropCanvasForGL = null;
      this.backdropCanvasForGLCtx = null;
      // Force backdrop to be dirty so it gets uploaded to the new renderer
      this.isBackdropDirty = true;

      this.materialsCanvas.width = newWidth;
      this.materialsCanvas.height = newHeight;
    }

    // Ask backdrop to re-check their sizes
    this.registeredBackdropElements.forEach((el) => {
      el.updatePositionAndSize();
    });

    this.log('debug', `Canvas resized to ${this.backdropCanvas.width}x${this.backdropCanvas.height}`);

    // Capture the backdrop after resizing
    await this.captureBackdrop();
  }

  /**
   * Capture the backdrop of the container element with all registered elements
   */
  private async captureBackdrop() {
    if (this.isRenderingBackdrop) {
      this.hasPendingBackdropRenderRequest = true;
      this.log('debug', 'Backdrop capture already in progress, marking pending request.');
      return;
    }

    // Skip capturing if container size is not yet set (container not ready)
    if (this.size.width <= 0 || this.size.height <= 0) {
      this.log('debug', 'Skipping backdrop capture - container size not ready:', this.size);
      return;
    }

    this.isRenderingBackdrop = true;
    this.updateFallbackMode();

    this.log('debug', 'Capturing backdrop for container');

    const ctx = this.backdropCanvas.getContext('2d');
    if (!ctx) {
      this.log('error', 'Failed to get 2D context for backdrop canvas');
      return;
    }

    ctx.clearRect(0, 0, this.backdropCanvas.width, this.backdropCanvas.height);

    const dpr = window.devicePixelRatio;

    ctx.save();

    ctx.scale(dpr, dpr);

    const style = getComputedStyle(this.container);
    const { backgroundColor, backgroundImage } = style;

    if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, this.container.clientWidth, this.container.clientHeight);
      this.log('debug', `Filled backdrop with background color: ${backgroundColor}`);
    }

    if (backgroundImage && backgroundImage !== 'none') {
      // Since backgroundImage is complex, use html-to-image to capture it
      // Create a element with the same size and background but no children
      const bgDiv = document.createElement('div');
      bgDiv.style.width = `${this.container.clientWidth}px`;
      bgDiv.style.height = `${this.container.clientHeight}px`;
      bgDiv.style.backgroundColor = backgroundColor;
      bgDiv.style.backgroundImage = backgroundImage;
      bgDiv.style.backgroundSize = style.backgroundSize;
      bgDiv.style.backgroundPosition = style.backgroundPosition;
      bgDiv.style.backgroundRepeat = style.backgroundRepeat;

      // Add to body temporarily
      document.body.appendChild(bgDiv);

      await toCanvas(bgDiv).then((bgCanvas) => {
        ctx.drawImage(bgCanvas, 0, 0, this.container.clientWidth, this.container.clientHeight);
        this.log('debug', `Drawn backdrop with background image: ${backgroundImage}`);
        document.body.removeChild(bgDiv);
      }).catch((error) => {
        this.log('error', 'Failed to capture background image for backdrop:', error);
      });
    }

    // Draw registered elements onto the backdrop canvas
    // Sort draw order by zIndex
    const sortedElements = this.registeredBackdropElements.slice().sort((a, b) => {
      const zIndexA = a.options?.zIndex ?? 0;
      const zIndexB = b.options?.zIndex ?? 0;
      return zIndexA - zIndexB;
    });

    sortedElements.forEach((element) => {
      const { position, size, canvas } = element;

      if (!canvas) {
        this.log('warn', 'Backdrop element has no canvas to draw:', element.element);
        return;
      }

      if (size.width > 0 && size.height > 0) {
        const drawX = Math.round(position.x);
        const drawY = Math.round(position.y);
        const drawW = Math.round(size.width / (window.devicePixelRatio || 1));
        const drawH = Math.round(size.height / (window.devicePixelRatio || 1));

        ctx.drawImage(
          canvas,
          drawX,
          drawY,
          drawW,
          drawH,
        );

        // Debug: Draw a border around the backdrop item
        // if (this.debug) {
        //   ctx.strokeStyle = 'yellow';
        //   ctx.lineWidth = 2 / dpr;
        //   ctx.strokeRect(drawX, drawY, drawW, drawH);
        // }
      }
    });

    ctx.restore();

    // Mark backdrop as dirty so texture will be re-uploaded on next render
    this.isBackdropDirty = true;

    // Emit event that backdrop capture is complete...
    this.emit('backdropCaptured', {
      canvas: this.backdropCanvas,
      width: this.backdropCanvas.width,
      height: this.backdropCanvas.height,
    } as LiquidRendererBackdropCapturedEvent);

    this.log('debug', 'Backdrop capture complete');

    this.isRenderingBackdrop = false;
    this.updateFallbackMode();

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

    // Skip rendering if container size is not yet set (container not ready)
    if (this.size.width <= 0 || this.size.height <= 0) {
      this.log('debug', 'Skipping materials render - container size not ready:', this.size);
      return;
    }

    // Skip rendering if not all backdrop elements have their canvas ready
    // This prevents rendering with an incomplete backdrop before html-to-image finishes
    const allBackdropsReady = this.registeredBackdropElements.every((el) => el.hasContent);
    if (this.registeredBackdropElements.length > 0 && !allBackdropsReady) {
      this.log('debug', 'Skipping materials render - not all backdrop elements have captured their content');
      return;
    }

    this.isRenderingMaterials = true;

    const renderPrecision = this.getRenderPrecision();

    this.log('debug', 'Rendering materials for registered material elements', {
      size: this.size,
      position: this.position,
      registeredMaterials: this.registeredMaterialElements.map((el) => ({
        id: el.materialId, element: el.element, size: el.size, position: el.position,
      })),
      renderPrecision,
    });

    // Create renderer on the persistent materialsCanvas
    if (!this.renderer) {
      this.renderer = createLiquidGlassRenderer(this.materialsCanvas, {
        renderScale: renderPrecision,
      });
      this.log('debug', 'Created new LiquidGlassRenderer instance');
    }

    if (!this.renderer) {
      this.log('error', 'Failed to create LiquidGlassRenderer');
      this.glassNotSupported = true;
      this.updateFallbackMode();
      this.isRenderingMaterials = false;
      return;
    }

    // PERFORMANCE OPTIMIZATION: Only update backdrop texture when it has changed
    if (this.isBackdropDirty) {
      // Reuse persistent canvas for backdrop conversion to avoid GC pressure
      if (
        !this.backdropCanvasForGL
        || this.backdropCanvasForGL.width !== this.backdropCanvas.width
        || this.backdropCanvasForGL.height !== this.backdropCanvas.height
      ) {
        this.backdropCanvasForGL = document.createElement('canvas');
        this.backdropCanvasForGL.width = this.backdropCanvas.width;
        this.backdropCanvasForGL.height = this.backdropCanvas.height;
        this.backdropCanvasForGLCtx = this.backdropCanvasForGL.getContext('2d');
      }

      if (this.backdropCanvasForGLCtx) {
        this.backdropCanvasForGLCtx.drawImage(this.backdropCanvas, 0, 0);
        this.renderer.setBackground(this.backdropCanvasForGL);
        this.isBackdropDirty = false;
        this.log('debug', 'Backdrop texture uploaded to GPU');
      } else {
        this.log('error', 'Failed to get 2D context for backdrop canvas conversion');
        this.isRenderingMaterials = false;
        return;
      }

      this.renderer.resize();
    }

    // PERFORMANCE OPTIMIZATION: Update existing materials instead of remove+add
    const currentMaterialIds = new Set<string>();
    this.registeredMaterialElements.forEach((element) => {
      const { glassAttributes, position, size } = element;
      const { transform } = element;
      const dpr = window.devicePixelRatio || 1;

      currentMaterialIds.add(element.materialId);

      const materialConfig = {
        thickness: glassAttributes.thickness,
        refractIndex: glassAttributes.refractIndex,
        refractIntensity: glassAttributes.refractIntensity,
        blur: glassAttributes.blur,
        dispersion: glassAttributes.dispersion,
        radius: glassAttributes.radius,
        radiusTR: glassAttributes.radiusTR,
        radiusBR: glassAttributes.radiusBR,
        radiusBL: glassAttributes.radiusBL,
        radiusTL: glassAttributes.radiusTL,
        width: size.width / dpr,
        height: size.height / dpr,
      };

      const materialPosition = {
        x: position.x + size.width / 2 / dpr,
        y: position.y + size.height / 2 / dpr,
      };

      if (this.addedMaterialIds.has(element.materialId)) {
        // Material already exists, just update config and position
        this.renderer!.updateMaterial(element.materialId, materialConfig);
        this.renderer!.setMaterialPosition(element.materialId, materialPosition.x, materialPosition.y);
        this.renderer!.setMaterialTransform(element.materialId, transform);
      } else {
        // New material, add it
        this.renderer!.addMaterial(element.materialId, materialConfig, materialPosition, transform);
        this.addedMaterialIds.add(element.materialId);
      }
    });

    // Remove materials that are no longer registered
    this.addedMaterialIds.forEach((id) => {
      if (!currentMaterialIds.has(id)) {
        this.renderer!.removeMaterial(id);
        this.addedMaterialIds.delete(id);
      }
    });

    // Render and optionally collect theme colors beneath each material
    const themeColors = this.renderer.render({ collectThemes: true });
    if (themeColors) {
      this.log('debug', 'Collected theme colors for materials:', themeColors);
      const mapThemeToMode = (theme: string): AutomaticBackgroundColorMode => {
        switch (theme) {
          case 'ultra_black':
            return 'ultra_dark';
          case 'black':
            return 'dark';
          case 'ultra_white':
            return 'ultra_light';
          case 'white':
          default:
            return 'light';
        }
      };

      this.registeredMaterialElements.forEach((element) => {
        const theme = themeColors[element.materialId];
        if (!theme) return;
        element.setAutomaticBackgroundColorMode(mapThemeToMode(theme));
      });
    }
    this.log('debug', 'Materials renderer updated');

    // Defer the emit to the next animation frame so that the WebGL draw has completed.
    requestAnimationFrame(() => {
      this.emit('materialsRendered', themeColors);

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
    // Clean up cached resources
    this.backdropCanvasForGL = null;
    this.backdropCanvasForGLCtx = null;
    this.addedMaterialIds.clear();
  }

  public getRenderPrecision() {
    return this.renderPrecision === 0 ? 1 : this.renderPrecision;
  }

  public updateFallbackMode() {
    this.log('debug', 'Updating fallback mode. Glass supported:', !this.glassNotSupported, 'Power efficient mode:', this.powerEfficientMode, 'Is rendering backdrop:', this.isRenderingBackdrop);
    if (this.glassNotSupported || !this.visible) {
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

  public setVisibility(visible: boolean) {
    this.visible = visible;
    this.updateFallbackMode();
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
