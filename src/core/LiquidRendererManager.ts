import { toCanvas } from 'html-to-image';

import {
  AutomaticBackgroundColorMode, LiquidRendererBackdropCapturedEvent, LiquidRendererFullCanvasRenderedEvent, LiquidRendererManagerOptions,
} from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';
import { createLiquidGlassRenderer, LiquidGlassRenderer } from './liquidGlassRenderer';
import { LiquidRendererBackdropElement } from './LiquidRendererBackdropElement';
import { LiquidRendererMaterialElement } from './LiquidRendererMaterialElement';

export class LiquidRendererManager extends EventEmitter {
  public debug = false;

  public container: HTMLElement;

  public content: HTMLElement;

  public backdropCanvas = new OffscreenCanvas(1, 1);

  public materialsCanvas = document.createElement('canvas');

  // Cached composite canvas used when baking backdrop + materials for nesting
  private compositeCanvas: OffscreenCanvas | null = null;

  private compositeCanvasCtx: OffscreenCanvasRenderingContext2D | null = null;

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

  public scroll = { x: 0, y: 0 };

  public size = { width: 0, height: 0 };

  public viewportSize = { width: 0, height: 0 };

  public scrollBarSize = { width: 0, height: 0 };

  // Performance optimization: persistent canvas for WebGL backdrop conversion
  private backdropCanvasForGL: HTMLCanvasElement | null = null;

  private backdropCanvasForGLCtx: CanvasRenderingContext2D | null = null;

  // Performance optimization: dirty flag to avoid unnecessary texture uploads
  private isBackdropDirty = true;

  // Track which materials have been added to avoid remove+add on every frame
  private addedMaterialIds = new Set<string>();

  public visible: boolean = true;

  // RAF loop and dirty flags
  private rafId: number | null = null;

  private isLayoutDirty = false;

  private isTextureDirty = false;

  private isRunning = false;

  // Scrollable mode
  public scrollable = false;

  // Event listener cleanup
  private cleanupFunctions: Array<() => void> = [];

  constructor(options: LiquidRendererManagerOptions) {
    super();
    // Initialize with options if needed
    this.debug = options.debug ?? false;

    this.log('debug', 'Initializing LiquidRendererManager with options:', options);

    // Add resize listener and observer for container
    if (options.container) {
      this.container = options.container;
      this.content = this.container.getElementsByClassName('liquid-glass-content')[0] as HTMLElement;
      this.scrollable = options.scrollable ?? false;
      this.addResizeListeners();
    } else {
      // Fallback to document body if no container provided
      this.container = document.body;
      this.content = document.body;
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
      this.content = this.container.getElementsByClassName('liquid-glass-content')[0] as HTMLElement;
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

    if (options.scrollable !== undefined) {
      this.scrollable = options.scrollable;
      this.log('debug', `Scrollable mode set to: ${this.scrollable}`);
      this.markLayoutDirty();
    }

    this.emit('optionsChanged', options);

    // Start RAF loop if not already running
    if (!this.isRunning) {
      this.startRAFLoop();
    }
  }

  /**
   * Start the RAF loop for centralized update handling
   */
  private startRAFLoop() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.log('debug', 'Starting RAF loop');
    this.rafLoop();
  }

  /**
   * Stop the RAF loop
   */
  private stopRAFLoop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.log('debug', 'Stopped RAF loop');
  }

  /**
   * RAF loop: centralized update mechanism
   */
  private rafLoop() {
    if (!this.isRunning) return;

    // Ensure canvases stay in sync with container size to avoid stretched backdrops
    const dpr = window.devicePixelRatio || 1;
    const expectedBackdropWidth = Math.round(this.container?.scrollWidth * dpr || 0);
    const expectedBackdropHeight = Math.round(this.container?.scrollHeight * dpr || 0);
    if (expectedBackdropWidth > 0 && expectedBackdropHeight > 0) {
      const sizeMismatch = this.backdropCanvas.width !== expectedBackdropWidth
        || this.backdropCanvas.height !== expectedBackdropHeight;
      if (sizeMismatch) {
        this.log('debug', 'RAF: Backdrop canvas size mismatch detected; resizing');
        this.resizeInternalCanvases(expectedBackdropWidth, expectedBackdropHeight);
        this.isBackdropDirty = true;
        this.hasPendingBackdropRenderRequest = true;
      }
    }

    // Check if we need to do anything
    if (this.isLayoutDirty) {
      this.log('debug', 'RAF: Layout dirty, recalculating positions');
      
      // Update container first
      this.updateContainerPositionAndSize();
      
      // Recalculate all material positions
      this.registeredMaterialElements.forEach((el) => {
        el.updatePositionAndSize({ suppressReRender: true });
      });
      
      this.isLayoutDirty = false;
      this.isTextureDirty = true; // Layout change requires re-render
    }

    if (this.isTextureDirty && !this.isRenderingMaterials) {
      this.log('debug', 'RAF: Texture dirty, rendering materials');
      this.renderMaterials();
      this.isTextureDirty = false;
    }

    if (this.hasPendingBackdropRenderRequest && !this.isRenderingBackdrop) {
      this.hasPendingBackdropRenderRequest = false;
      this.captureBackdrop();
    }

    // Schedule next frame
    this.rafId = requestAnimationFrame(() => this.rafLoop());
  }

  /**
   * Mark layout as dirty (positions/sizes changed)
   */
  public markLayoutDirty() {
    this.isLayoutDirty = true;
  }

  /**
   * Mark texture as dirty (need to re-render WebGL)
   */
  public markTextureDirty() {
    this.isTextureDirty = true;
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

    this.log('debug', 'No pending. Backdrop elements changed, marking backdrop dirty.');
    this.isBackdropDirty = true;
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
    this.markTextureDirty();
  }

  /**
   * Add resize listeners to handle container size changes
   */
  private addResizeListeners() {
    this.log('debug', 'Adding resize listeners');

    // Clean up old listeners
    this.cleanupListeners();

    const resizeObserver = new ResizeObserver(() => {
      this.markLayoutDirty();
    });
    resizeObserver.observe(this.container);
    this.cleanupFunctions.push(() => resizeObserver.disconnect());

    const windowResizeHandler = () => {
      this.markLayoutDirty();
    };
    window.addEventListener('resize', windowResizeHandler);
    this.cleanupFunctions.push(() => window.removeEventListener('resize', windowResizeHandler));

    const scrollHandler = () => {
      this.markLayoutDirty();
    };
    this.content.addEventListener('scroll', scrollHandler);
    this.cleanupFunctions.push(() => this.content.removeEventListener('scroll', scrollHandler));

    // Initial update
    this.markLayoutDirty();
  }

  /**
   * Clean up event listeners
   */
  private cleanupListeners() {
    this.cleanupFunctions.forEach((cleanup) => cleanup());
    this.cleanupFunctions = [];
  }

  /**
   * Update container position and size
   */
  private updateContainerPositionAndSize() {
    const rect = this.container.getBoundingClientRect();
    this.position.x = rect.left + window.scrollX;
    this.position.y = rect.top + window.scrollY;

    this.scrollBarSize.width = this.content.offsetWidth - this.content.clientWidth;
    this.scrollBarSize.height = this.content.offsetHeight - this.content.clientHeight;

    this.scroll.x = this.content.scrollLeft || 0;
    this.scroll.y = this.content.scrollTop || 0;

    const contentWidth = this.container.scrollWidth;
    const contentHeight = this.container.scrollHeight;

    // Canvas sizing strategy based on scrollable mode
    if (this.scrollable) {
      // Scrollable mode: Canvas = full content size
      this.size.width = contentWidth;
      this.size.height = contentHeight;
    } else {
      // Non-scrollable mode: Canvas = at least viewport, but honor content growth to avoid stretching
      this.size.width = Math.max(rect.width, contentWidth);
      this.size.height = Math.max(rect.height, contentHeight);
    }

    this.viewportSize.width = rect.width;
    this.viewportSize.height = rect.height;
    
    return rect;
  }

  /**
   * Keep internal canvases sized to container scroll size (device-pixel aware).
   */
  private resizeInternalCanvases(newWidth: number, newHeight: number) {
    if (newWidth <= 0 || newHeight <= 0) return;

    const backdropChanged = this.backdropCanvas.width !== newWidth || this.backdropCanvas.height !== newHeight;

    if (!backdropChanged) return;

    this.log('debug', `Resizing internal canvases to ${newWidth}x${newHeight}`);

    this.backdropCanvas.width = newWidth;
    this.backdropCanvas.height = newHeight;

    // Resize materials canvas and dispose renderer if the size changes
    if (this.materialsCanvas.width !== newWidth || this.materialsCanvas.height !== newHeight) {
      if (this.renderer) {
        this.renderer.dispose();
        this.renderer = null;
      }
      this.addedMaterialIds.clear();
      this.backdropCanvasForGL = null;
      this.backdropCanvasForGLCtx = null;

      this.materialsCanvas.width = newWidth;
      this.materialsCanvas.height = newHeight;
    }

    // Composite canvas should match the new size on next use
    this.compositeCanvas = null;
    this.compositeCanvasCtx = null;

    // Ask backdrop elements to refresh their cached bounds without triggering render storms
    this.registeredBackdropElements.forEach((el) => {
      el.updatePositionAndSize({ suppressReRender: true });
    });
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

    const dpr = window.devicePixelRatio || 1;
    const newWidth = Math.round(this.container.scrollWidth * dpr);
    const newHeight = Math.round(this.container.scrollHeight * dpr);

    // Check if canvas needs resizing
    this.resizeInternalCanvases(newWidth, newHeight);

    this.isRenderingBackdrop = true;
    this.updateFallbackMode();

    this.log('debug', 'Capturing backdrop for container');

    const ctx = this.backdropCanvas.getContext('2d');
    if (!ctx) {
      this.log('error', 'Failed to get 2D context for backdrop canvas');
      return;
    }

    ctx.clearRect(0, 0, this.backdropCanvas.width, this.backdropCanvas.height);

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
      bgDiv.style.width = `${this.content.scrollWidth}px`;
      bgDiv.style.height = `${this.content.scrollHeight}px`;
      bgDiv.style.backgroundColor = backgroundColor;
      bgDiv.style.backgroundImage = backgroundImage;
      bgDiv.style.backgroundSize = style.backgroundSize;
      bgDiv.style.backgroundPosition = style.backgroundPosition;
      bgDiv.style.backgroundRepeat = style.backgroundRepeat;

      // Add to body temporarily
      document.body.appendChild(bgDiv);

      await toCanvas(bgDiv).then((bgCanvas) => {
        ctx.drawImage(bgCanvas, 0, 0, this.content.scrollWidth, this.content.scrollHeight);
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
        width: size.width,
        height: size.height,
      };

      this.log('info', 'Material config for element:', {
        scroll: this.scroll,
        position,
        pPosition: this.position,
        size,
      });

      const materialPosition = {
        x: position.x + size.width / 2,
        y: position.y + size.height / 2,
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

      this.renderFullComposite();

      // If there was a pending request, trigger another render
      if (this.hasPendingMaterialsRenderRequest) {
        this.hasPendingMaterialsRenderRequest = false;
        this.renderMaterials();
      }
    });
  }

  public renderFullComposite() {
    const width = this.backdropCanvas.width || this.materialsCanvas.width;
    const height = this.backdropCanvas.height || this.materialsCanvas.height;

    if (width === 0 || height === 0) {
      this.log('warn', 'Skipping full composite render because canvas size is zero');
      return;
    }

    if (!this.compositeCanvas || this.compositeCanvas.width !== width || this.compositeCanvas.height !== height) {
      this.compositeCanvas = new OffscreenCanvas(width, height);
      this.compositeCanvasCtx = this.compositeCanvas.getContext('2d');
    }

    if (!this.compositeCanvasCtx || !this.compositeCanvas) {
      this.log('error', 'Failed to get 2D context for composite canvas rendering');
      return;
    }

    this.compositeCanvasCtx.clearRect(0, 0, width, height);

    // Draw backdrop then materials with normal alpha blending
    if (this.backdropCanvas.width && this.backdropCanvas.height) {
      this.compositeCanvasCtx.drawImage(this.backdropCanvas, 0, 0);
    }

    if (this.materialsCanvas.width && this.materialsCanvas.height) {
      this.compositeCanvasCtx.drawImage(this.materialsCanvas, 0, 0);
    }

    this.emit('fullCanvasRendered', {
      canvas: this.compositeCanvas,
      width: this.compositeCanvas.width,
      height: this.compositeCanvas.height,
    } as LiquidRendererFullCanvasRenderedEvent);
  }

  // Backward-compatible alias
  public renderFullCanvas() {
    this.renderFullComposite();
  }

  /**
   * Request backdrop capture from parent (for nested LiquidGlass)
   * This should only be called when DOM structure changes, NOT on material interactions
   */
  public requestBackdropCapture() {
    this.log('debug', 'Requesting backdrop capture due to structural change');
    this.isBackdropDirty = true;
    this.captureBackdrop();
  }

  public dispose() {
    // Stop RAF loop
    this.stopRAFLoop();
    
    // Clean up listeners
    this.cleanupListeners();
    
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
