import { toCanvas } from 'html-to-image';

import {
  AutomaticBackgroundColorMode, LiquidRendererBackdropCapturedEvent, LiquidRendererFullCanvasRenderedEvent, LiquidRendererManagerOptions, TextureDirtyReason, ThemeColorThresholds,
} from '../types/LiquidGlass';
import {
  clampCanvasDimensions, getSafeDevicePixelRatio, isMobileDevice, MAX_CANVAS_DIMENSION_MOBILE,
} from '../utils/featureDetect';
import { EventEmitter } from './EventEmitter';
import { createLiquidGlassRenderer, DEFAULT_THEME_COLOR_THRESHOLDS, LiquidGlassRenderer } from './liquidGlassRenderer';
import { LiquidRendererBackdropElement } from './LiquidRendererBackdropElement';
import { LiquidRendererMaterialElement } from './LiquidRendererMaterialElement';

/**
 * Central manager for the Liquid Glass rendering pipeline.
 *
 * Responsibilities:
 * - Manages the lifecycle of backdrop and material elements
 * - Coordinates backdrop capture and WebGL material rendering
 * - Handles scroll and resize events with debouncing/throttling
 * - Provides composite rendering for nested LiquidGlass components
 *
 * @emits backdropCaptured - When backdrop canvas is captured
 * @emits materialsRendered - When materials are rendered to canvas
 * @emits fullCanvasRendered - When composite canvas is ready (for nested components)
 * @emits fallbackModeChanged - When fallback mode status changes
 * @emits optionsChanged - When manager options are updated
 */
export class LiquidRendererManager extends EventEmitter {
  /** Enable debug logging */
  public debug = false;

  /** The container element for the LiquidGlass instance */
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

  /**
   * The actual CSS size for uniform canvas display.
   * When canvas dimensions are clamped on mobile, this reflects the clamped size
   * to ensure proper alignment between CSS layout and physical canvas pixels.
   */
  public actualCssSize = { width: 0, height: 0 };

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

  private isScrollDirty = false;

  private isTextureDirty = false;

  public lastTextureDirtyReason: TextureDirtyReason = 'unknown';

  private isRunning = false;

  private lastContainerScrollWidth = 0;

  private lastContainerScrollHeight = 0;

  private lastScrollX = 0;

  private lastScrollY = 0;

  // Scrollable mode
  public scrollable = false;

  // Viewport Mode (Mobile Optimization):
  // When enabled, Canvas is sized to viewport + buffer instead of full content.
  // This prevents Canvas size from exceeding mobile limits (2048px).
  // The canvas origin tracks scroll position, and all coordinates are viewport-relative.
  private viewportMode = false;

  // Buffer around viewport for viewport mode (in CSS pixels)
  private viewportBuffer = 200;

  // Current viewport origin in content coordinates (where the canvas starts)
  private viewportOrigin = { x: 0, y: 0 };

  // Track if we need to re-capture backdrop due to viewport shift
  private lastViewportOriginX = 0;

  private lastViewportOriginY = 0;

  // Theme color detection thresholds
  public themeColorThresholds: ThemeColorThresholds = { ...DEFAULT_THEME_COLOR_THRESHOLDS };

  // Throttling for full composite rendering (for nested LiquidGlass updates to parent)
  private fullCompositeThrottleMs = 300; // Minimum time between composite updates

  private compositeThrottleMsByReason: Record<TextureDirtyReason, number> = {
    material_interaction: 480,
    scroll: 180,
    layout: 160,
    structural: 140,
    external: 260,
    unknown: 300,
  };

  private lastFullCompositeTime = 0;

  private pendingFullComposite = false;

  private pendingCompositeReason: TextureDirtyReason | null = null;

  private fullCompositeTimeoutId: number | null = null;

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
    } else {
      // Fallback to document body if no container provided
      this.container = document.body;
      this.content = document.body;
      this.log('warn', 'No container provided for LiquidRendererManager; defaulting to document.body.');
    }

    this.addResizeListeners();

    this.renderPrecision = options.renderPrecision ?? 0;

    this.renderMode = options.renderMode ?? 'uniform';

    this.powerEfficientMode = options.powerEfficientMode ?? false;

    // Apply theme color thresholds if provided
    if (options.themeColorThresholds) {
      this.themeColorThresholds = {
        ...DEFAULT_THEME_COLOR_THRESHOLDS,
        ...options.themeColorThresholds,
      };
    }

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

      // Propagate scale change to renderer and trigger reflow so canvas sizes stay in sync
      if (this.renderer) {
        this.renderer.setRenderScale(this.getRenderPrecision());
      }
      this.markLayoutDirty();
      this.isBackdropDirty = true;
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

    if (options.themeColorThresholds !== undefined) {
      this.themeColorThresholds = {
        ...this.themeColorThresholds,
        ...options.themeColorThresholds,
      };
      this.log('debug', 'Theme color thresholds set to:', this.themeColorThresholds);
      // Update renderer thresholds if it exists
      if (this.renderer) {
        this.renderer.setThemeThresholds(this.themeColorThresholds);
      }
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

    // Use content.scrollWidth/scrollHeight to detect size changes
    // The content element is the actual scrollable area containing all backdrop content
    const currentScrollWidth = this.content?.scrollWidth ?? 0;
    const currentScrollHeight = this.content?.scrollHeight ?? 0;
    if (currentScrollWidth !== this.lastContainerScrollWidth
      || currentScrollHeight !== this.lastContainerScrollHeight) {
      this.log('debug', 'RAF: Content scroll size changed, marking layout dirty');
      this.markLayoutDirty();
      this.lastContainerScrollWidth = currentScrollWidth;
      this.lastContainerScrollHeight = currentScrollHeight;
    }

    // Handle layout changes (resize, DOM changes)
    if (this.isLayoutDirty) {
      this.log('debug', 'RAF: Layout dirty, recalculating positions');

      // Update container first - this updates this.size with the correct full content size
      this.updateContainerPositionAndSize();

      // Update viewport mode state (this may enable/disable viewport mode based on content size)
      this.updateViewportMode();

      // Recalculate all backdrop positions so their capture callbacks re-run when layout changes
      this.registeredBackdropElements.forEach((el) => {
        el.updatePositionAndSize();
      });

      // Recalculate all material positions
      this.registeredMaterialElements.forEach((el) => {
        el.updatePositionAndSize({ suppressReRender: true });
      });

      this.isLayoutDirty = false;
      this.isScrollDirty = false; // Layout update includes scroll update
      // Layout change requires backdrop recapture and material re-render
      this.hasPendingBackdropRenderRequest = true;
      this.markTextureDirty('layout'); // Layout change requires re-render
    }

    // Handle scroll changes (scroll position changed, but layout didn't)
    // This is a lighter update - we only need to update scroll values and material positions
    if (this.isScrollDirty) {
      this.log('debug', 'RAF: Scroll dirty, updating scroll position and materials');

      // Update scroll values only
      this.scroll.x = this.content.scrollLeft || 0;
      this.scroll.y = this.content.scrollTop || 0;

      // In viewport mode (sticky canvas), every scroll requires re-capture
      // because the visible content has changed
      if (this.viewportMode) {
        // Update viewport origin to match scroll position
        this.updateViewportMode();

        // Always re-capture backdrop in viewport mode since visible area changed
        this.hasPendingBackdropRenderRequest = true;
        this.isBackdropDirty = true;
        this.lastViewportOriginX = this.viewportOrigin.x;
        this.lastViewportOriginY = this.viewportOrigin.y;
      }

      // Only update material positions (they need scroll offset for correct rendering)
      this.registeredMaterialElements.forEach((el) => {
        el.updatePositionAndSize({ suppressReRender: true });
      });

      this.isScrollDirty = false;
      // Scroll change requires material re-render (to update positions)
      this.markTextureDirty('scroll');
    }

    // Ensure canvases stay in sync with the expected dimensions
    // In viewport mode, canvas is viewport-sized; otherwise full content size (clamped)
    const { width: expectedBackdropWidth, height: expectedBackdropHeight } = this.getCanvasDimensions();
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
   * Force a complete refresh of the rendering pipeline.
   * This will:
   * 1. Recalculate positions and sizes of all elements
   * 2. Recompute visibility/opacity for all elements
   * 3. Re-capture all backdrop elements
   * 4. Re-render all materials
   *
   * Use this method when you've made changes that affect visibility,
   * opacity, or layout that the manager can't automatically detect.
   */
  public refresh() {
    this.log('debug', 'Forcing complete refresh');
    this.markLayoutDirty();
    this.markTextureDirty('structural');
  }

  /**
   * Update visibility and opacity for all registered elements.
   * Call this when you've changed opacity/visibility CSS properties
   * and need to sync the glass rendering.
   */
  public refreshVisibility() {
    this.log('debug', 'Refreshing visibility for all elements');

    // Update visibility for all backdrop elements
    this.registeredBackdropElements.forEach((el) => {
      el.updatePositionAndSize({ suppressReRender: true });
    });

    // Update visibility for all material elements
    this.registeredMaterialElements.forEach((el) => {
      el.updatePositionAndSize({ suppressReRender: true });
    });

    // Mark texture dirty to trigger re-render with updated opacity values
    this.markTextureDirty('layout');
  }

  /**
   * Check if viewport mode should be enabled.
   * Viewport mode is auto-enabled when:
   * 1. Device is mobile AND
   * 2. Content size exceeds mobile canvas limits
   */
  private shouldUseViewportMode(): boolean {
    if (!isMobileDevice()) return false;

    const deviceScale = this.getDeviceScale();
    const contentWidth = this.size.width * deviceScale;
    const contentHeight = this.size.height * deviceScale;

    return contentWidth > MAX_CANVAS_DIMENSION_MOBILE || contentHeight > MAX_CANVAS_DIMENSION_MOBILE;
  }

  /**
   * Check if currently in viewport mode
   */
  public isInViewportMode(): boolean {
    return this.viewportMode;
  }

  /**
   * Get the current viewport origin (canvas origin in content coordinates)
   */
  public getViewportOrigin(): { x: number; y: number } {
    return { ...this.viewportOrigin };
  }

  /**
   * Update viewport mode state and calculate viewport origin.
   * Called during layout updates and scroll handling.
   */
  private updateViewportMode() {
    const wasViewportMode = this.viewportMode;
    this.viewportMode = this.shouldUseViewportMode();

    if (this.viewportMode !== wasViewportMode) {
      this.log('debug', `Viewport mode ${this.viewportMode ? 'enabled' : 'disabled'}`);
      // Mode changed - need full re-render
      this.hasPendingBackdropRenderRequest = true;
      this.isBackdropDirty = true;
    }

    if (this.viewportMode) {
      // STICKY CANVAS MODE: viewportOrigin equals scroll position
      // The canvas uses CSS sticky positioning to stay in the viewport.
      // All coordinates are relative to the current scroll position.
      this.viewportOrigin.x = this.scroll.x;
      this.viewportOrigin.y = this.scroll.y;
    } else {
      // Not in viewport mode - origin is always 0,0
      this.viewportOrigin.x = 0;
      this.viewportOrigin.y = 0;
    }
  }

  /**
   * Get the canvas dimensions for the current mode.
   * In viewport mode, this is viewport size (no buffer needed with sticky).
   * Otherwise full content size (with clamping).
   */
  private getCanvasDimensions(): { width: number; height: number } {
    const deviceScale = this.getDeviceScale();

    if (this.viewportMode) {
      // STICKY CANVAS MODE: canvas covers exactly the viewport
      // With sticky positioning, the canvas stays in view, so we only need viewport size
      const canvasWidth = this.viewportSize.width;
      const canvasHeight = this.viewportSize.height;

      return {
        width: Math.round(canvasWidth * deviceScale),
        height: Math.round(canvasHeight * deviceScale),
      };
    }

    // Non-viewport mode: full content size (with clamping)
    const rawWidth = Math.round(this.size.width * deviceScale);
    const rawHeight = Math.round(this.size.height * deviceScale);
    return clampCanvasDimensions(rawWidth, rawHeight);
  }

  /**
   * Mark scroll as dirty (scroll position changed, but layout didn't)
   * This is a lighter update than layout dirty - we only need to update material positions
   */
  public markScrollDirty() {
    this.isScrollDirty = true;
  }

  /**
   * Mark texture as dirty (need to re-render WebGL)
   */
  public markTextureDirty(reason: TextureDirtyReason = 'unknown') {
    this.isTextureDirty = true;
    this.lastTextureDirtyReason = reason;
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
    this.markTextureDirty('structural');
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

    // Parent/viewport scroll can shift the container without resizing it, so watch window scroll
    // and mark layout dirty using an RAF gate to avoid excessive work while scrolling.
    let windowScrollScheduled = false;
    const windowScrollHandler = () => {
      if (windowScrollScheduled) return;
      windowScrollScheduled = true;
      requestAnimationFrame(() => {
        windowScrollScheduled = false;
        this.markLayoutDirty();
      });
    };
    window.addEventListener('scroll', windowScrollHandler, { passive: true });
    this.cleanupFunctions.push(() => window.removeEventListener('scroll', windowScrollHandler));

    // Content scroll tracking - directly listen to the content element
    // This is important for scrollable mode to update material positions
    // Scroll only marks scroll dirty, not layout dirty - we don't need to recapture backdrops
    const contentScrollHandler = () => {
      this.markScrollDirty();
    };
    this.content.addEventListener('scroll', contentScrollHandler);
    this.cleanupFunctions.push(() => this.content.removeEventListener('scroll', contentScrollHandler));

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

    // Use content.scrollWidth/scrollHeight for full content size (important for scrollable mode)
    // The content element is the actual scrollable area that contains all the backdrop content
    this.size.width = this.content.scrollWidth;
    this.size.height = this.content.scrollHeight;

    this.viewportSize.width = rect.width;
    this.viewportSize.height = rect.height;

    return rect;
  }

  /**
   * Keep internal canvases sized to container scroll size (device-pixel aware).
   */
  private resizeInternalCanvases(newWidth: number, newHeight: number) {
    if (newWidth <= 0 || newHeight <= 0) return;

    // Always update actualCssSize to reflect the (potentially clamped) physical size back to CSS pixels
    // This ensures uniform canvas CSS dimensions match the actual rendered content
    const deviceScale = this.getDeviceScale();
    this.actualCssSize.width = newWidth / deviceScale;
    this.actualCssSize.height = newHeight / deviceScale;

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

    // Update scroll values first - this ensures backdrop elements get correct scroll offsets
    this.scroll.x = this.content.scrollLeft || 0;
    this.scroll.y = this.content.scrollTop || 0;

    // Update all backdrop element positions before capturing
    // This ensures positions are correct even when captureBackdrop is called directly
    // (e.g., from onBackdropElementChange) without going through RAF layout update
    this.registeredBackdropElements.forEach((el) => {
      el.updatePositionAndSize({ suppressReRender: true });
    });

    // MEMORY FIX: Use getSafeDevicePixelRatio() * renderPrecision and clampCanvasDimensions() to prevent OOM on mobile
    const deviceScale = this.getDeviceScale();

    // Use getCanvasDimensions which handles viewport mode appropriately
    const { width: newWidth, height: newHeight } = this.getCanvasDimensions();

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

    ctx.scale(deviceScale, deviceScale);

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

    this.log('debug', `Drawing ${sortedElements.length} backdrop elements, scroll: (${this.scroll.x}, ${this.scroll.y})`);

    sortedElements.forEach((element, index) => {
      const {
        position, size, canvas, visibility, viewportCaptureRect,
      } = element;

      // Skip rendering if element is hidden (opacity: 0, visibility: hidden, or display: none)
      if (visibility.state === 'hidden') {
        this.log('debug', `  [${index}] Skipping backdrop element - hidden`);
        return;
      }

      if (!canvas) {
        this.log('warn', 'Backdrop element has no canvas to draw:', element.element);
        return;
      }

      if (size.width > 0 && size.height > 0) {
        let drawX = Math.round(position.x);
        let drawY = Math.round(position.y);
        let drawW = Math.round(canvas.width / deviceScale);
        let drawH = Math.round(canvas.height / deviceScale);

        // If the backdrop element used viewport capture, adjust positions
        // The canvas only contains a portion of the element,
        // so we need to offset the draw position by the capture rect origin
        if (viewportCaptureRect) {
          drawX += viewportCaptureRect.x;
          drawY += viewportCaptureRect.y;
          drawW = viewportCaptureRect.width;
          drawH = viewportCaptureRect.height;
        }

        // VIEWPORT MODE: Offset by viewport origin
        // In viewport mode, the canvas represents only a portion of the content.
        // We need to subtract the viewport origin to get canvas-relative coordinates.
        if (this.viewportMode) {
          drawX -= this.viewportOrigin.x;
          drawY -= this.viewportOrigin.y;

          // Skip if element is completely outside the viewport canvas
          const canvasWidthCSS = this.backdropCanvas.width / deviceScale;
          const canvasHeightCSS = this.backdropCanvas.height / deviceScale;
          if (drawX + drawW < 0 || drawY + drawH < 0 || drawX > canvasWidthCSS || drawY > canvasHeightCSS) {
            this.log('debug', `  [${index}] Skipping backdrop element - outside viewport canvas`);
            return;
          }
        }

        const vpCaptureTag = viewportCaptureRect ? ' [viewport capture]' : '';
        const vpModeTag = this.viewportMode ? ' [viewport mode]' : '';
        this.log(
          'debug',
          `  [${index}] type=${element.type} pos=(${drawX}, ${drawY}) `
            + `size=(${drawW}x${drawH}) canvas=(${canvas.width}x${canvas.height}) `
            + `opacity=${visibility.opacity}${vpCaptureTag}${vpModeTag}`,
        );

        // Apply opacity if not fully opaque
        if (visibility.opacity < 1) {
          ctx.save();
          ctx.globalAlpha = visibility.opacity;
        }

        ctx.drawImage(
          canvas,
          drawX,
          drawY,
          drawW,
          drawH,
        );

        // Restore global alpha if modified
        if (visibility.opacity < 1) {
          ctx.restore();
        }
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
        themeThresholds: this.themeColorThresholds,
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
      // Skip materials that are delegating their rendering to a proxy target
      // These materials will be rendered by a child LiquidGlass instead
      if (element.isDelegatedToProxy) {
        this.log('debug', `Skipping material ${element.materialId} - delegated to proxy`);
        // If this material was previously added, remove it from the renderer
        if (this.addedMaterialIds.has(element.materialId)) {
          this.renderer!.removeMaterial(element.materialId);
          this.addedMaterialIds.delete(element.materialId);
        }
        return; // Skip to next material
      }

      const { glassAttributes, position, size } = element;
      const { transform, visibility } = element;

      // Skip rendering if visibility is not yet initialized or element is hidden
      if (!visibility || visibility.state === 'hidden') {
        this.log('debug', `Skipping material ${element.materialId} - element is hidden or not initialized`);
        // If this material was previously added, remove it from the renderer
        if (this.addedMaterialIds.has(element.materialId)) {
          this.renderer!.removeMaterial(element.materialId);
          this.addedMaterialIds.delete(element.materialId);
        }
        return; // Skip to next material
      }

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
        opacity: visibility.opacity,
      };

      // VIEWPORT MODE: Offset material position by viewport origin
      // In viewport mode, the canvas represents only a portion of the content.
      // Material positions need to be relative to the canvas origin (viewportOrigin).
      let materialPosX = position.x + size.width / 2;
      let materialPosY = position.y + size.height / 2;

      if (this.viewportMode) {
        materialPosX -= this.viewportOrigin.x;
        materialPosY -= this.viewportOrigin.y;

        // Skip materials that are completely outside the viewport canvas
        const canvasWidthCSS = this.backdropCanvas.width / this.getDeviceScale();
        const canvasHeightCSS = this.backdropCanvas.height / this.getDeviceScale();
        const halfW = size.width / 2;
        const halfH = size.height / 2;

        if (materialPosX + halfW < 0 || materialPosY + halfH < 0
            || materialPosX - halfW > canvasWidthCSS || materialPosY - halfH > canvasHeightCSS) {
          this.log('debug', `Skipping material ${element.materialId} - outside viewport canvas`);
          if (this.addedMaterialIds.has(element.materialId)) {
            this.renderer!.removeMaterial(element.materialId);
            this.addedMaterialIds.delete(element.materialId);
          }
          return;
        }
      }

      this.log('debug', 'Material config for element:', {
        scroll: this.scroll,
        position,
        pPosition: this.position,
        size,
        viewportMode: this.viewportMode,
        viewportOrigin: this.viewportOrigin,
        materialPosition: { x: materialPosX, y: materialPosY },
      });

      const materialPosition = {
        x: materialPosX,
        y: materialPosY,
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

      this.renderFullComposite(this.lastTextureDirtyReason);

      // If there was a pending request, trigger another render
      if (this.hasPendingMaterialsRenderRequest) {
        this.hasPendingMaterialsRenderRequest = false;
        this.renderMaterials();
      }
    });
  }

  private getCompositeThrottleMs(reason: TextureDirtyReason) {
    return this.compositeThrottleMsByReason[reason] ?? this.fullCompositeThrottleMs;
  }

  public renderFullComposite(reason: TextureDirtyReason = this.lastTextureDirtyReason) {
    const resolvedReason: TextureDirtyReason = reason ?? this.lastTextureDirtyReason ?? 'unknown';

    const now = performance.now();
    const throttleMs = this.getCompositeThrottleMs(resolvedReason);
    const timeSinceLastComposite = now - this.lastFullCompositeTime;

    // If a higher-priority event (non-interaction) arrives while an interaction render is pending,
    // flush immediately so structural/layout updates are not delayed by interaction throttling.
    const isInteractionPending = this.pendingCompositeReason === 'material_interaction';
    const isHighPriority = resolvedReason !== 'material_interaction';
    if (isHighPriority && this.pendingFullComposite && isInteractionPending) {
      if (this.fullCompositeTimeoutId !== null) {
        clearTimeout(this.fullCompositeTimeoutId);
        this.fullCompositeTimeoutId = null;
      }
      this.pendingFullComposite = false;
      this.pendingCompositeReason = null;
      this.doRenderFullComposite(resolvedReason);
      return;
    }

    // Throttle: if we've rendered recently, schedule for later
    if (timeSinceLastComposite < throttleMs) {
      this.pendingFullComposite = true;
      this.pendingCompositeReason = resolvedReason;

      // Clear any existing timeout to ensure trailing execution uses the latest request
      if (this.fullCompositeTimeoutId !== null) {
        clearTimeout(this.fullCompositeTimeoutId);
      }

      const remainingTime = throttleMs - timeSinceLastComposite;
      this.fullCompositeTimeoutId = window.setTimeout(() => {
        this.fullCompositeTimeoutId = null;
        this.pendingFullComposite = false;
        const reasonToUse = this.pendingCompositeReason ?? resolvedReason;
        this.pendingCompositeReason = null;
        this.doRenderFullComposite(reasonToUse);
      }, remainingTime) as unknown as number;
      return;
    }

    // Not throttled - render immediately
    this.pendingFullComposite = false;
    this.pendingCompositeReason = null;
    if (this.fullCompositeTimeoutId !== null) {
      clearTimeout(this.fullCompositeTimeoutId);
      this.fullCompositeTimeoutId = null;
    }
    this.doRenderFullComposite(resolvedReason);
  }

  /**
   * Internal method that actually performs the full composite render
   */
  private doRenderFullComposite(reason: TextureDirtyReason = 'unknown') {
    this.lastFullCompositeTime = performance.now();

    this.log('debug', `Rendering full composite (reason=${reason})`);

    // MEMORY FIX: Use getSafeDevicePixelRatio() * renderPrecision to prevent OOM on mobile
    const deviceScale = this.getDeviceScale();

    // For nested LiquidGlass, we need to pass only the viewport area to parent
    // This is crucial for scrollable mode - parent should see what's visible, not the entire content
    const fullCanvas = new OffscreenCanvas(
      this.viewportSize.width * deviceScale,
      this.viewportSize.height * deviceScale,
    );
    const fullCtx = fullCanvas.getContext('2d');
    if (!fullCtx) {
      this.log('error', 'Failed to get 2D context for full canvas rendering');
      return;
    }

    // Draw backdrop - extract only the currently visible portion based on scroll position
    if (this.backdropCanvas.width && this.backdropCanvas.height) {
      fullCtx.drawImage(
        this.backdropCanvas,
        this.scroll.x * deviceScale,
        this.scroll.y * deviceScale,
        this.viewportSize.width * deviceScale,
        this.viewportSize.height * deviceScale,
        0,
        0,
        this.viewportSize.width * deviceScale,
        this.viewportSize.height * deviceScale,
      );
    }

    // Draw materials - extract only the currently visible portion based on scroll position
    if (this.materialsCanvas.width && this.materialsCanvas.height) {
      fullCtx.drawImage(
        this.materialsCanvas,
        this.scroll.x * deviceScale,
        this.scroll.y * deviceScale,
        this.viewportSize.width * deviceScale,
        this.viewportSize.height * deviceScale,
        0,
        0,
        this.viewportSize.width * deviceScale,
        this.viewportSize.height * deviceScale,
      );
    }

    this.emit('fullCanvasRendered', {
      canvas: fullCanvas,
      width: fullCanvas.width,
      height: fullCanvas.height,
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

    // Clear any pending full composite timeout
    if (this.fullCompositeTimeoutId !== null) {
      clearTimeout(this.fullCompositeTimeoutId);
      this.fullCompositeTimeoutId = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    // MEMORY FIX: Set OffscreenCanvas dimensions to 0 to hint browser to free GPU memory
    // This is especially important on iOS where GPU memory is limited
    if (this.backdropCanvas) {
      this.backdropCanvas.width = 0;
      this.backdropCanvas.height = 0;
    }
    if (this.compositeCanvas) {
      this.compositeCanvas.width = 0;
      this.compositeCanvas.height = 0;
      this.compositeCanvas = null;
      this.compositeCanvasCtx = null;
    }

    // Clean up cached resources
    this.backdropCanvasForGL = null;
    this.backdropCanvasForGLCtx = null;
    this.addedMaterialIds.clear();
  }

  public getRenderPrecision() {
    return this.renderPrecision === 0 ? 1 : this.renderPrecision;
  }

  private getDeviceScale() {
    return getSafeDevicePixelRatio() * this.getRenderPrecision();
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
