/**
 * @fileoverview LiquidRendererManager - Central Orchestrator for Liquid Glass Rendering
 *
 * This module is the heart of the Liquid Glass rendering pipeline. It coordinates:
 *
 * 1. **Backdrop Capture Pipeline**:
 *    - Collects content from registered backdrop elements (DOM or Canvas)
 *    - Composites them into a unified background texture
 *    - Handles viewport-based capture on mobile devices
 *
 * 2. **Material Rendering Pipeline**:
 *    - Manages WebGL-based glass effect rendering
 *    - Applies refraction, blur, and dispersion effects
 *    - Handles theme color detection for adaptive UI
 *
 * 3. **Viewport Mode (Mobile Optimization)**:
 *    - Enables buffered viewport capture when content exceeds 2048px
 *    - Prevents iOS/Android Canvas memory limits from crashing the app
 *    - Automatically re-captures when scroll exceeds buffer threshold
 *
 * 4. **Event-Driven Updates**:
 *    - Uses RAF (requestAnimationFrame) loop for efficient updates
 *    - Separates layout-dirty and scroll-dirty states for performance
 *    - Throttles composite rendering to prevent excessive parent updates
 *
 * Architecture:
 * ```
 * [LiquidGlass Container]
 *         |
 *    [Manager] ─── RAF Loop ───> Dirty Flags Check
 *         |                            |
 *         ├── Backdrop Elements ──> captureBackdrop() ──> backdropCanvas
 *         |                                                    |
 *         └── Material Elements ──> renderMaterials() <───────┘
 *                                        |
 *                                   [WebGL Renderer]
 *                                        |
 *                                   materialsCanvas
 * ```
 *
 * @module LiquidRendererManager
 */

import { toCanvas } from 'html-to-image';

import {
  AutomaticBackgroundColorMode,
  LiquidRendererBackdropCapturedEvent,
  LiquidRendererFullCanvasRenderedEvent,
  LiquidRendererManagerOptions,
  TextureDirtyReason,
  ThemeColorThresholds,
} from '../types/LiquidGlass';
import {
  clampCanvasDimensions,
  getSafeDevicePixelRatio,
  isMobileDevice,
  MAX_CANVAS_DIMENSION_MOBILE,
} from '../utils/featureDetect';
import { EventEmitter } from './EventEmitter';
import {
  createLiquidGlassRenderer,
  DEFAULT_THEME_COLOR_THRESHOLDS,
  LiquidGlassRenderer,
} from './liquidGlassRenderer';
import { LiquidRendererBackdropElement } from './LiquidRendererBackdropElement';
import { LiquidRendererMaterialElement } from './LiquidRendererMaterialElement';

/**
 * Central manager for the Liquid Glass rendering pipeline.
 *
 * This class is the main coordinator for all Liquid Glass rendering operations.
 * Each `<LiquidGlass>` component creates one Manager instance that owns:
 * - A backdrop canvas (captures content behind glass materials)
 * - A materials canvas (WebGL output with glass effects)
 * - A WebGL renderer (performs actual refraction calculations)
 *
 * Key Responsibilities:
 * - Manages the lifecycle of backdrop and material elements
 * - Coordinates backdrop capture and WebGL material rendering
 * - Handles scroll and resize events with debouncing/throttling
 * - Provides composite rendering for nested LiquidGlass components
 * - Implements viewport mode for mobile memory optimization
 *
 * @emits backdropCaptured - When backdrop canvas is captured
 * @emits materialsRendered - When materials are rendered to canvas
 * @emits fullCanvasRendered - When composite canvas is ready (for nested components)
 * @emits fallbackModeChanged - When fallback mode status changes
 * @emits optionsChanged - When manager options are updated
 */
export class LiquidRendererManager extends EventEmitter {
  // ============================================================================
  // PUBLIC PROPERTIES - Configuration and State
  // ============================================================================

  /** Enable debug logging to console */
  public debug = false;

  /** The container element for the LiquidGlass instance */
  public container: HTMLElement;

  /** The scrollable content element inside the container */
  public content: HTMLElement;

  /**
   * OffscreenCanvas for compositing all backdrop elements.
   * This is the "background texture" that gets sampled by the glass shader.
   */
  public backdropCanvas = new OffscreenCanvas(1, 1);

  /**
   * HTMLCanvas for WebGL material rendering output.
   * Must be HTMLCanvasElement (not OffscreenCanvas) for WebGL context.
   */
  public materialsCanvas = document.createElement('canvas');

  // ============================================================================
  // PRIVATE PROPERTIES - Internal Rendering State
  // ============================================================================

  /**
   * Cached composite canvas for nested LiquidGlass support.
   * When this LiquidGlass is nested inside another, this canvas holds
   * the combined backdrop + materials for the parent to capture.
   */
  private compositeCanvas: OffscreenCanvas | null = null;

  private compositeCanvasCtx: OffscreenCanvasRenderingContext2D | null = null;

  /** The WebGL renderer instance (created lazily on first material render) */
  private renderer: LiquidGlassRenderer | null = null;

  /**
   * Render precision multiplier.
   * 0 = auto (use device pixel ratio), >0 = custom scale factor.
   */
  public renderPrecision = 0;

  /**
   * Render mode:
   * - 'uniform': All materials share one canvas (default, more efficient)
   * - 'dedicated': Each material gets its own canvas (not implemented yet)
   */
  public renderMode: 'uniform' | 'dedicated' = 'uniform';

  /** All registered backdrop source elements */
  public registeredBackdropElements: LiquidRendererBackdropElement[] = [];

  /** All registered glass material elements */
  public registeredMaterialElements: LiquidRendererMaterialElement[] = [];

  // ============================================================================
  // RENDERING STATE FLAGS - Prevent concurrent operations
  // ============================================================================

  /** True while backdrop is being captured (prevents overlapping captures) */
  public isRenderingBackdrop = false;

  /** True if a backdrop capture was requested during an ongoing capture */
  public hasPendingBackdropRenderRequest = false;

  /** True while materials are being rendered (prevents overlapping renders) */
  public isRenderingMaterials = false;

  /** True if a material render was requested during an ongoing render */
  public hasPendingMaterialsRenderRequest = false;

  // ============================================================================
  // FEATURE FLAGS - Fallback and Power Management
  // ============================================================================

  /** True if WebGL is not supported or failed to initialize */
  public glassNotSupported = false;

  /**
   * Enable blurred effect mode.
   * When enabled, border and shadow will be hidden when the page loses focus.
   */
  public enableBlurredEffect = false;

  /**
   * True when the page/window is blurred (lost focus).
   * Only tracked when enableBlurredEffect is true.
   */
  public isBlurred = false;

  /** True when using CSS backdrop-filter fallback instead of WebGL */
  public isFallbackMode = false;

  /** Whether the LiquidGlass component is currently visible */
  public visible: boolean = true;

  // ============================================================================
  // GEOMETRY STATE - Container position, scroll, and size
  // ============================================================================

  /** Container position relative to document (includes window scroll) */
  public position = { x: 0, y: 0 };

  /** Current scroll offset within the content element */
  public scroll = { x: 0, y: 0 };

  /** Full content size (scrollWidth/scrollHeight of content element) */
  public size = { width: 0, height: 0 };

  /** Visible viewport size (clientWidth/clientHeight of container) */
  public viewportSize = { width: 0, height: 0 };

  /** Size of scrollbars (difference between offset and client size) */
  public scrollBarSize = { width: 0, height: 0 };

  /**
   * The actual CSS size for uniform canvas display.
   * When canvas dimensions are clamped on mobile, this reflects the clamped size
   * to ensure proper alignment between CSS layout and physical canvas pixels.
   */
  public actualCssSize = { width: 0, height: 0 };

  // ============================================================================
  // PERFORMANCE OPTIMIZATION - Caches and Dirty Flags
  // ============================================================================

  /**
   * Persistent canvas for converting OffscreenCanvas to HTMLCanvas.
   * WebGL texImage2D requires HTMLCanvasElement on some browsers.
   * Reusing this canvas avoids GC pressure from creating new canvases.
   */
  private backdropCanvasForGL: HTMLCanvasElement | null = null;

  private backdropCanvasForGLCtx: CanvasRenderingContext2D | null = null;

  /** True when backdrop texture needs to be re-uploaded to GPU */
  private isBackdropDirty = true;

  /** Track which materials have been added to avoid remove+add on every frame */
  private addedMaterialIds = new Set<string>();

  // ============================================================================
  // RAF LOOP STATE - Centralized Update Mechanism
  // ============================================================================

  /** ID of the current requestAnimationFrame callback */
  private rafId: number | null = null;

  /** True if positions/sizes need recalculation (resize, DOM changes) */
  private isLayoutDirty = false;

  /** True if only scroll position changed (lighter update) */
  private isScrollDirty = false;

  /** True if WebGL needs to re-render (material positions/attributes changed) */
  private isTextureDirty = false;

  /** Reason for last texture dirty (for throttling decisions) */
  public lastTextureDirtyReason: TextureDirtyReason = 'unknown';

  /** True if RAF loop is running */
  private isRunning = false;

  /** Cached content scroll dimensions for change detection */
  private lastContainerScrollWidth = 0;

  private lastContainerScrollHeight = 0;

  /** Cached scroll position for change detection */
  private lastScrollX = 0;

  private lastScrollY = 0;

  /** True if content is scrollable (affects size calculation) */
  public scrollable = false;

  // ============================================================================
  // VIEWPORT MODE - Mobile Canvas Memory Optimization
  // ============================================================================

  /**
   * Viewport Mode (Mobile Optimization):
   *
   * Mobile browsers limit Canvas size to prevent memory issues:
   * - iOS Safari: ~2048x2048 or 16MB texture memory
   * - Android Chrome: Similar limits
   *
   * When content exceeds these limits, viewport mode is enabled:
   * - Canvas is sized to viewport + buffer instead of full content
   * - The canvas "window" follows scroll position
   * - Re-capture is triggered when scroll exceeds buffer threshold
   *
   * This allows long scrollable pages to work on mobile without crashing.
   */
  private viewportMode = false;

  /**
   * Buffer size in screen heights.
   * Total canvas height = (1 + 2 * bufferScreens) * viewportHeight
   * With bufferScreens=1, we capture 1 screen above and 1 below (3 total).
   */
  private viewportBufferScreens = 1;

  /**
   * Current viewport origin in content coordinates.
   * This is where the canvas content starts (top-left corner).
   * Elements at position (x, y) are drawn at (x - origin.x, y - origin.y).
   */
  private viewportOrigin = { x: 0, y: 0 };

  /**
   * Origin at the time of last backdrop capture.
   * Used to determine when scroll has moved far enough to need re-capture.
   */
  private lastCaptureOrigin = { x: 0, y: 0 };

  // Legacy tracking (may be removed in future)
  private lastViewportOriginX = 0;

  private lastViewportOriginY = 0;

  // ============================================================================
  // THEME COLOR DETECTION - Adaptive Background Coloring
  // ============================================================================

  /**
   * Thresholds for determining light/dark theme based on backdrop luminance.
   * Used by materials to automatically adjust their text/icon colors.
   */
  public themeColorThresholds: ThemeColorThresholds = { ...DEFAULT_THEME_COLOR_THRESHOLDS };

  // ============================================================================
  // COMPOSITE THROTTLING - For Nested LiquidGlass Performance
  // ============================================================================

  /** Default minimum time (ms) between composite updates */
  private fullCompositeThrottleMs = 300;

  /**
   * Throttle times per dirty reason.
   * Interactions (like ripples) are throttled more aggressively than structural changes.
   */
  private compositeThrottleMsByReason: Record<TextureDirtyReason, number> = {
    material_interaction: 480, // User interaction - can be delayed
    scroll: 180, // Scroll - medium priority
    layout: 160, // Layout change - higher priority
    structural: 140, // DOM structure change - high priority
    external: 260, // External trigger - medium priority
    unknown: 300, // Default fallback
  };

  /** Timestamp of last composite render (for throttling) */
  private lastFullCompositeTime = 0;

  /** True if a throttled composite is pending */
  private pendingFullComposite = false;

  /** The reason for the pending composite (for priority decisions) */
  private pendingCompositeReason: TextureDirtyReason | null = null;

  /** Timeout ID for delayed composite (cleared on higher-priority requests) */
  private fullCompositeTimeoutId: number | null = null;

  // ============================================================================
  // CLEANUP - Event Listener Management
  // ============================================================================

  /** Array of cleanup functions to call on dispose */
  private cleanupFunctions: Array<() => void> = [];

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * Create a new LiquidRendererManager instance.
   *
   * @param options - Configuration options for the manager
   * @param options.container - The container element for the LiquidGlass instance
   * @param options.debug - Enable debug logging
   * @param options.scrollable - Whether the container is scrollable
   * @param options.renderPrecision - Custom render scale (0 = auto)
   * @param options.renderMode - 'uniform' (shared canvas) or 'dedicated' (per-material)
   * @param options.enableBlurredEffect - Hide border/shadow when page loses focus
   * @param options.themeColorThresholds - Custom thresholds for theme detection
   */
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

    this.enableBlurredEffect = options.enableBlurredEffect ?? false;

    // Apply theme color thresholds if provided
    if (options.themeColorThresholds) {
      this.themeColorThresholds = {
        ...DEFAULT_THEME_COLOR_THRESHOLDS,
        ...options.themeColorThresholds,
      };
    }

    this.log('debug', 'LiquidRendererManager initialized');
  }

  // ============================================================================
  // PUBLIC API - Options and Configuration
  // ============================================================================

  /**
   * Update manager options at runtime.
   *
   * This method allows changing configuration after initialization.
   * Changes to container will trigger a full re-layout of all elements.
   *
   * @param options - Partial options to update (only specified keys are changed)
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

    if (options.enableBlurredEffect !== undefined) {
      this.enableBlurredEffect = options.enableBlurredEffect;
      this.log('debug', `Blurred effect mode set to: ${this.enableBlurredEffect}`);
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

  // ============================================================================
  // RAF LOOP - Centralized Update Mechanism
  // ============================================================================

  /**
   * Start the RAF (requestAnimationFrame) loop for centralized update handling.
   *
   * The RAF loop is the heart of the update system. It:
   * 1. Checks for content size changes (detects DOM mutations)
   * 2. Handles layout-dirty state (full position/size recalculation)
   * 3. Handles scroll-dirty state (lighter scroll-only update)
   * 4. Ensures canvases are correctly sized
   * 5. Triggers material rendering when texture is dirty
   * 6. Triggers backdrop capture when pending
   *
   * This approach batches updates to a single frame, avoiding
   * multiple reflows and improving performance.
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
   * RAF loop: The main update cycle.
   *
   * This method runs once per animation frame and handles all pending updates.
   * Updates are categorized by priority:
   *
   * 1. **Content Size Change Detection**: Monitors scrollWidth/scrollHeight
   *    to detect DOM mutations that change content size.
   *
   * 2. **Layout Dirty**: Full recalculation of container and all elements.
   *    Triggered by resize, container change, or content size change.
   *
   * 3. **Scroll Dirty**: Lighter update for scroll-only changes.
   *    Only updates material positions and checks viewport buffer.
   *
   * 4. **Canvas Size Sync**: Ensures canvas dimensions match expected size.
   *
   * 5. **Texture Dirty**: Triggers WebGL material rendering.
   *
   * 6. **Pending Backdrop**: Captures backdrop if requested.
   *
   * The separation of layout-dirty vs scroll-dirty is crucial for performance.
   * Scroll events fire rapidly but usually only need position updates, not
   * full layout recalculation.
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

      // In viewport mode, check if we need to re-capture based on scroll distance
      if (this.viewportMode) {
        // Only re-capture if scrolled past the buffer threshold
        if (this.needsBackdropRecapture()) {
          this.log('debug', 'RAF: Scroll exceeded buffer threshold, re-capturing backdrop');

          // Recalculate viewport origin for new capture
          this.recalculateViewportOrigin();

          this.hasPendingBackdropRenderRequest = true;
          this.isBackdropDirty = true;

          // Update last capture origin after triggering re-capture
          this.lastCaptureOrigin.x = this.viewportOrigin.x;
          this.lastCaptureOrigin.y = this.viewportOrigin.y;
        }
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

    // If we already know we must render materials, but a backdrop capture is queued,
    // prioritize the backdrop first to avoid a frame of misalignment.
    const shouldCaptureBackdrop = this.hasPendingBackdropRenderRequest && !this.isRenderingBackdrop;
    if (shouldCaptureBackdrop) {
      this.hasPendingBackdropRenderRequest = false;
      this.captureBackdrop();
    }

    // Avoid rendering materials while a backdrop capture is pending/in progress.
    // Rendering with a stale backdrop can cause a visible “jump” before the
    // updated backdrop arrives.
    const canRenderMaterials = !this.isRenderingBackdrop && !this.hasPendingBackdropRenderRequest;
    if (this.isTextureDirty && !this.isRenderingMaterials && canRenderMaterials) {
      this.log('debug', 'RAF: Texture dirty, rendering materials');
      this.renderMaterials();
      this.isTextureDirty = false;
    }

    // Schedule next frame
    this.rafId = requestAnimationFrame(() => this.rafLoop());
  }

  // ============================================================================
  // DIRTY FLAGS - Update State Management
  // ============================================================================

  /**
   * Mark layout as dirty (positions/sizes need recalculation).
   *
   * This triggers a full layout update on the next RAF frame:
   * - Container position and size are recalculated
   * - Viewport mode is re-evaluated
   * - All backdrop and material element positions are updated
   * - Backdrop capture is triggered
   *
   * Use this when: container resizes, DOM structure changes, or
   * anything that might affect element positions.
   */
  public markLayoutDirty() {
    this.isLayoutDirty = true;
  }

  /**
   * Force a complete refresh of the rendering pipeline.
   *
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

  // ============================================================================
  // VIEWPORT MODE - Mobile Canvas Memory Optimization
  // ============================================================================

  /**
   * Check if viewport mode should be enabled.
   *
   * Viewport mode is auto-enabled when:
   * 1. Device is mobile (iOS/Android) AND
   * 2. Content size exceeds mobile canvas limits (2048px)
   *
   * On desktop browsers, canvas size limits are much higher (8192-16384px),
   * so viewport mode is not needed.
   *
   * @returns True if viewport mode should be used
   */
  private shouldUseViewportMode(): boolean {
    if (!isMobileDevice()) return false;

    const deviceScale = this.getDeviceScale();
    const contentWidth = this.size.width * deviceScale;
    const contentHeight = this.size.height * deviceScale;

    return contentWidth > MAX_CANVAS_DIMENSION_MOBILE || contentHeight > MAX_CANVAS_DIMENSION_MOBILE;
  }

  /**
   * Check if currently in viewport mode.
   *
   * @returns True if viewport mode is active
   */
  public isInViewportMode(): boolean {
    return this.viewportMode;
  }

  /**
   * Get the current viewport origin (canvas origin in content coordinates).
   *
   * The viewport origin is where the canvas content starts in the overall
   * content coordinate system. Elements at position (x, y) are drawn at
   * (x - origin.x, y - origin.y) on the canvas.
   *
   * @returns Copy of the viewport origin coordinates
   */
  public getViewportOrigin(): { x: number; y: number } {
    return { ...this.viewportOrigin };
  }

  /**
   * Update viewport mode state.
   *
   * Called during layout updates to check if viewport mode should be
   * enabled/disabled based on current content size.
   *
   * Note: viewportOrigin is only updated when re-capture is triggered,
   * not on every scroll. This is handled by recalculateViewportOrigin().
   */
  private updateViewportMode() {
    const wasViewportMode = this.viewportMode;
    this.viewportMode = this.shouldUseViewportMode();

    if (this.viewportMode !== wasViewportMode) {
      this.log('debug', `Viewport mode ${this.viewportMode ? 'enabled' : 'disabled'}`);
      // Mode changed - need full re-render and recalculate origin
      this.recalculateViewportOrigin();
      this.hasPendingBackdropRenderRequest = true;
      this.isBackdropDirty = true;
      // Reset capture origin when mode changes
      this.lastCaptureOrigin = { ...this.viewportOrigin };
    }

    if (!this.viewportMode) {
      // Not in viewport mode - origin is always 0,0
      this.viewportOrigin.x = 0;
      this.viewportOrigin.y = 0;
    }
  }

  /**
   * Recalculate viewport origin based on current scroll position.
   *
   * The viewport origin determines where the canvas "window" is positioned
   * over the full content. We use a buffered approach:
   *
   * - Capture N screens above the current viewport
   * - Capture the current viewport
   * - Capture N screens below the current viewport
   *
   * This means the origin is: scroll.y - (bufferScreens * viewportHeight)
   *
   * Called when:
   * - Viewport mode is first enabled
   * - Scroll exceeds buffer threshold (needs re-capture)
   */
  private recalculateViewportOrigin() {
    if (!this.viewportMode) {
      this.viewportOrigin.x = 0;
      this.viewportOrigin.y = 0;
      return;
    }

    // BUFFERED VIEWPORT MODE:
    // Capture N screens above the current viewport.
    // viewportOrigin is where the canvas content starts (scroll - buffer).
    const bufferHeight = this.viewportSize.height * this.viewportBufferScreens;

    // Origin is scroll position minus buffer, clamped to 0
    this.viewportOrigin.x = 0; // Horizontal scrolling not typically an issue
    this.viewportOrigin.y = Math.max(0, this.scroll.y - bufferHeight);

    this.log('debug', `Recalculated viewport origin: (${this.viewportOrigin.x}, ${this.viewportOrigin.y})`);
  }

  /**
   * Check if we need to re-capture the backdrop based on scroll position.
   *
   * We use a threshold-based approach to avoid re-capturing on every scroll:
   * - Safe zone: buffer above and below the current viewport
   * - Trigger threshold: 50% of buffer distance
   *
   * Re-capture is triggered when the current scroll position has moved
   * more than 50% of the buffer away from where we last captured.
   *
   * This means with bufferScreens=1:
   * - We capture 3 screens total (1 above + current + 1 below)
   * - We re-capture when scroll moves 0.5 screens from capture center
   *
   * @returns True if backdrop needs to be re-captured
   */
  private needsBackdropRecapture(): boolean {
    if (!this.viewportMode) return false;

    const bufferHeight = this.viewportSize.height * this.viewportBufferScreens;

    // Safe zone: we have buffer above and below the viewport
    // We should re-capture when scroll gets close to the edge of the captured region
    // Trigger re-capture when we've scrolled through 50% of the buffer
    const triggerThreshold = bufferHeight * 0.5;

    // If scroll.y is more than threshold away from last capture center, recapture
    const lastCaptureCenterY = this.lastCaptureOrigin.y + bufferHeight;
    const currentCenterY = this.scroll.y;
    const distanceFromCenter = Math.abs(currentCenterY - lastCaptureCenterY);

    return distanceFromCenter > triggerThreshold;
  }

  /**
   * Get the canvas dimensions for the current mode.
   *
   * In viewport mode:
   * - Canvas height = (1 + 2 * bufferScreens) * viewportHeight
   * - This gives us buffer above and below the visible area
   * - Never exceeds actual content size
   *
   * In normal mode:
   * - Full content size with clamping for mobile limits
   *
   * @returns Canvas dimensions in physical pixels (includes device scale)
   */
  private getCanvasDimensions(): { width: number; height: number } {
    const deviceScale = this.getDeviceScale();

    if (this.viewportMode) {
      // BUFFERED VIEWPORT MODE:
      // Canvas covers viewport + N screens above + N screens below
      // Total = (1 + 2*bufferScreens) * viewportHeight
      const totalScreens = 1 + 2 * this.viewportBufferScreens;
      const canvasWidth = this.viewportSize.width;
      const canvasHeight = Math.min(
        this.viewportSize.height * totalScreens,
        this.size.height, // Don't exceed content size
      );

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
   * Mark scroll as dirty (scroll position changed, but layout didn't).
   *
   * This triggers a lighter update than markLayoutDirty():
   * - Only scroll values are updated
   * - Material positions are recalculated (they need scroll offset)
   * - In viewport mode, checks if buffer threshold exceeded
   *
   * Does NOT trigger full layout recalculation or backdrop capture
   * (unless scroll exceeds viewport buffer threshold).
   */
  public markScrollDirty() {
    this.isScrollDirty = true;
  }

  /**
   * Mark texture as dirty (need to re-render WebGL).
   *
   * This triggers WebGL material rendering on the next RAF frame.
   * The reason parameter affects throttling for nested LiquidGlass
   * composite updates.
   *
   * @param reason - Why the texture is dirty (affects throttling)
   */
  public markTextureDirty(reason: TextureDirtyReason = 'unknown') {
    this.isTextureDirty = true;
    this.lastTextureDirtyReason = reason;
  }

  // ============================================================================
  // ELEMENT REGISTRATION - Backdrop and Material Management
  // ============================================================================

  /**
   * Register a backdrop element with the manager.
   *
   * Backdrop elements are sources of content that appear behind glass materials.
   * They can be DOM elements (captured via html-to-image) or Canvas elements.
   *
   * @param element - The backdrop element to register
   */
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

  /**
   * Called when backdrop elements are added, removed, or updated.
   *
   * This method:
   * 1. Emits 'backdropElementChanged' event
   * 2. Checks if any backdrops are still capturing
   * 3. If all backdrops ready, triggers backdrop capture
   *
   * The pending request check prevents capturing while html-to-image
   * is still processing an element, which would give incomplete results.
   */
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

  /**
   * Register a material element with the manager.
   *
   * Material elements are the glass panels that show refraction effects.
   * They sample from the backdrop canvas and apply WebGL shaders.
   *
   * @param element - The material element to register
   */
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

  /**
   * Called when material elements are added, removed, or updated.
   *
   * This method emits 'materialElementChanged' event and marks
   * texture dirty with 'structural' reason (high priority).
   */
  public onMaterialElementChange() {
    this.emit('materialElementChanged', this.registeredMaterialElements);

    // Re-render materials when elements change
    this.markTextureDirty('structural');
  }

  /**
   * Check if any registered material element uses uniform render mode.
   *
   * This is used by LiquidGlass.vue to determine if the uniform canvas
   * should be rendered, even when the manager itself is in 'dedicated' mode.
   *
   * @returns True if any material has effective render mode 'uniform'
   */
  public hasUniformMaterials(): boolean {
    return this.registeredMaterialElements.some((el) => {
      // External materials don't have getEffectiveRenderMode, treat as uniform
      if (typeof (el as any).getEffectiveRenderMode !== 'function') {
        return true;
      }
      return (el as any).getEffectiveRenderMode() === 'uniform';
    });
  }

  // ============================================================================
  // EVENT LISTENERS - Resize and Scroll Handling
  // ============================================================================

  /**
   * Add resize listeners to handle container size changes.
   *
   * Sets up:
   * - ResizeObserver on container (handles container resize)
   * - Window resize listener (handles viewport resize)
   * - Window scroll listener (handles parent scroll)
   * - Content scroll listener (handles internal scrolling)
   *
   * All listeners use RAF gating to avoid excessive updates during
   * rapid resize/scroll events.
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
   * Clean up all event listeners.
   * Called on dispose and before adding new listeners (to prevent duplicates).
   */
  private cleanupListeners() {
    this.cleanupFunctions.forEach((cleanup) => cleanup());
    this.cleanupFunctions = [];
  }

  // ============================================================================
  // GEOMETRY CALCULATIONS - Position and Size Updates
  // ============================================================================

  /**
   * Update container position and size from the DOM.
   *
   * This method reads:
   * - Container bounding rect (position relative to viewport)
   * - Window scroll (to get position relative to document)
   * - Content scroll (internal scroll position)
   * - Content scrollWidth/scrollHeight (full content size)
   * - Container clientWidth/clientHeight (visible viewport size)
   * - Scrollbar sizes (offset - client dimensions)
   *
   * @returns The container's bounding rect
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
   * Resize internal canvases to match expected dimensions.
   *
   * This method:
   * 1. Updates actualCssSize for proper CSS layout alignment
   * 2. Resizes backdropCanvas (OffscreenCanvas)
   * 3. Resizes materialsCanvas (HTMLCanvas for WebGL)
   * 4. Disposes and recreates renderer if size changed
   * 5. Clears composite canvas cache
   * 6. Updates all element positions
   *
   * Canvas resize is expensive because it clears content and may
   * require WebGL context recreation. We avoid unnecessary resizes
   * by checking if dimensions actually changed.
   *
   * @param newWidth - New width in physical pixels
   * @param newHeight - New height in physical pixels
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

  // ============================================================================
  // BACKDROP CAPTURE - Compositing Background Content
  // ============================================================================

  /**
   * Capture the backdrop of the container element with all registered elements.
   *
   * This is the main backdrop compositing method. It:
   *
   * 1. **Validates state**: Checks if capture is already in progress,
   *    if container size is valid, etc.
   *
   * 2. **Prepares canvas**: Resizes canvas if needed, clears previous content.
   *
   * 3. **Draws container background**: Fills with backgroundColor and/or
   *    captures backgroundImage using html-to-image.
   *
   * 4. **Draws backdrop elements**: Sorts by zIndex and draws each element's
   *    canvas at its correct position. Handles:
   *    - Visibility (skips hidden elements)
   *    - Opacity (applies globalAlpha)
   *    - Viewport mode offset (subtracts viewportOrigin)
   *    - Viewport capture rect (for partial element captures)
   *
   * 5. **Emits event**: 'backdropCaptured' with the completed canvas.
   *
   * 6. **Triggers material render**: After backdrop is ready, materials
   *    need to re-render to pick up the new texture.
   *
   * Performance note: This method is async due to html-to-image calls
   * for background images. The isRenderingBackdrop flag prevents
   * concurrent captures.
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

  // ============================================================================
  // MATERIAL RENDERING - WebGL Glass Effect Pipeline
  // ============================================================================

  /**
   * Render all registered material elements using WebGL.
   *
   * This method orchestrates the WebGL rendering pipeline:
   *
   * 1. **Validates state**: Checks for concurrent rendering, container readiness,
   *    and backdrop element readiness.
   *
   * 2. **Creates/updates renderer**: Lazily creates LiquidGlassRenderer on first
   *    call, disposes and recreates if canvas size changed.
   *
   * 3. **Uploads backdrop texture**: Only when isBackdropDirty is true.
   *    Uses persistent backdropCanvasForGL to avoid GC pressure.
   *
   * 4. **Updates materials**: For each registered material:
   *    - Skips delegated materials (rendered by child LiquidGlass)
   *    - Skips hidden materials (visibility check)
   *    - Calculates position (with viewport mode offset)
   *    - Updates or adds material to renderer
   *
   * 5. **Removes stale materials**: Materials no longer registered are removed.
   *
   * 6. **Renders**: Calls renderer.render() with theme collection enabled.
   *
   * 7. **Applies themes**: Sets automatic background color mode on each material
   *    based on detected backdrop luminance.
   *
   * 8. **Emits event**: 'materialsRendered' with theme colors.
   *
   * 9. **Triggers composite**: For nested LiquidGlass support.
   */
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

    // Ensure geometry state is synced with the latest scroll/viewport movement
    // before computing material positions. This guards against cases where
    // window scroll happens between RAF ticks and interaction-driven renders.
    this.updateContainerPositionAndSize();
    this.registeredBackdropElements.forEach((el) => {
      el.updatePositionAndSize({ suppressReRender: true });
    });
    this.registeredMaterialElements.forEach((el) => {
      el.updatePositionAndSize({ suppressReRender: true });
    });

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

    // Sort materials by renderOrder for proper layering
    // Layering follows DOM stacking rules:
    // 1. If renderOrder is explicitly set, use it directly
    // 2. Otherwise, calculate from DOM: higher CSS z-index = higher priority
    // 3. If z-index is equal, later DOM position = higher priority
    // Note: External materials (no DOM element) use registration order as fallback
    const sortedMaterials = [...this.registeredMaterialElements].sort((a, b) => {
      // If both have explicit renderOrder, compare directly
      if (a.renderOrder !== undefined && b.renderOrder !== undefined) {
        return a.renderOrder - b.renderOrder;
      }
      // If only one has explicit renderOrder, it takes precedence over auto-calculated
      if (a.renderOrder !== undefined) return 1; // a comes after (on top)
      if (b.renderOrder !== undefined) return -1; // b comes after (on top)

      // Check if both have DOM elements (not external materials)
      const aElement = (a as any).element as HTMLElement | undefined;
      const bElement = (b as any).element as HTMLElement | undefined;

      // If either lacks a DOM element, fall back to registration order
      if (!aElement || !bElement) {
        return this.registeredMaterialElements.indexOf(a) - this.registeredMaterialElements.indexOf(b);
      }

      // Both use auto-calculation based on DOM stacking rules
      const styleA = window.getComputedStyle(aElement);
      const styleB = window.getComputedStyle(bElement);

      // Parse z-index (auto = 0 for comparison purposes)
      const zIndexA = styleA.zIndex === 'auto' ? 0 : parseInt(styleA.zIndex, 10) || 0;
      const zIndexB = styleB.zIndex === 'auto' ? 0 : parseInt(styleB.zIndex, 10) || 0;

      // Higher z-index = rendered later (on top)
      if (zIndexA !== zIndexB) {
        return zIndexA - zIndexB;
      }

      // Same z-index: use DOM order (later in DOM = rendered later = on top)
      // compareDocumentPosition returns bitmask, DOCUMENT_POSITION_FOLLOWING means b comes after a
      const position = aElement.compareDocumentPosition(bElement);
      // eslint-disable-next-line no-bitwise
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1; // b is after a, so a should render first
      }
      // eslint-disable-next-line no-bitwise
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1; // a is after b, so b should render first
      }
      return 0; // Same element or not comparable
    });

    // PERFORMANCE OPTIMIZATION: Update existing materials instead of remove+add
    const currentMaterialIds = new Set<string>();
    sortedMaterials.forEach((element) => {
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
    // This ensures the materialsCanvas actually contains the rendered content
    // before we emit the event and trigger composite rendering.
    requestAnimationFrame(() => {
      this.emit('materialsRendered', themeColors);

      this.isRenderingMaterials = false;

      // Render full composite for nested LiquidGlass support
      this.renderFullComposite(this.lastTextureDirtyReason);

      // If there was a pending request, trigger another render
      if (this.hasPendingMaterialsRenderRequest) {
        this.hasPendingMaterialsRenderRequest = false;
        this.renderMaterials();
      }
    });
  }

  // ============================================================================
  // COMPOSITE RENDERING - For Nested LiquidGlass Support
  // ============================================================================

  /**
   * Get throttle time for composite rendering based on dirty reason.
   *
   * Different events have different priority levels:
   * - structural/layout: High priority, shorter throttle
   * - scroll: Medium priority
   * - material_interaction: Low priority (ripples), longer throttle
   *
   * @param reason - The reason for the composite request
   * @returns Throttle time in milliseconds
   */
  private getCompositeThrottleMs(reason: TextureDirtyReason) {
    return this.compositeThrottleMsByReason[reason] ?? this.fullCompositeThrottleMs;
  }

  /**
   * Render full composite canvas (backdrop + materials).
   *
   * This method is used for nested LiquidGlass support. When a LiquidGlass
   * is nested inside another, the parent needs to capture the child's
   * rendered output (backdrop + materials) as part of its own backdrop.
   *
   * The composite canvas represents the currently visible viewport area,
   * not the full scrollable content. This is important because the parent
   * only needs to see what's currently visible.
   *
   * Throttling:
   * - Composite rendering is throttled to avoid excessive updates
   * - High-priority events (structural, layout) can flush pending low-priority events
   * - This prevents ripple animations from blocking important updates
   *
   * @param reason - The reason for the composite (affects throttling)
   */
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
   * Internal method that actually performs the full composite render.
   *
   * Creates a viewport-sized canvas containing:
   * 1. The currently visible portion of the backdrop canvas
   * 2. The currently visible portion of the materials canvas
   *
   * The result is emitted as 'fullCanvasRendered' for the parent
   * LiquidGlass to capture as part of its backdrop.
   *
   * @param reason - The reason for the composite (for logging)
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

  /**
   * Backward-compatible alias for renderFullComposite.
   * @deprecated Use renderFullComposite instead.
   */
  public renderFullCanvas() {
    this.renderFullComposite();
  }

  /**
   * Request backdrop capture from parent (for nested LiquidGlass).
   *
   * This should only be called when DOM structure changes, NOT on material
   * interactions. Material interactions (like ripples) don't change the
   * backdrop content, so they shouldn't trigger re-capture.
   */
  public requestBackdropCapture() {
    this.log('debug', 'Requesting backdrop capture due to structural change');
    this.isBackdropDirty = true;
    this.captureBackdrop();
  }

  // ============================================================================
  // LIFECYCLE - Disposal and Cleanup
  // ============================================================================

  /**
   * Dispose of the manager and release all resources.
   *
   * This method:
   * 1. Stops the RAF loop
   * 2. Cleans up event listeners
   * 3. Clears pending timeouts
   * 4. Disposes WebGL renderer
   * 5. Releases canvas memory (sets dimensions to 0)
   * 6. Clears cached resources
   *
   * IMPORTANT: After calling dispose(), the manager is no longer usable.
   * Create a new instance if you need to use it again.
   *
   * Memory note: Setting canvas dimensions to 0 hints the browser to
   * release GPU memory. This is especially important on iOS where GPU
   * memory is limited.
   */
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

  // ============================================================================
  // UTILITY METHODS - Helpers and Accessors
  // ============================================================================

  /**
   * Get the effective render precision.
   *
   * @returns 1 if auto (0), otherwise the configured value
   */
  public getRenderPrecision() {
    return this.renderPrecision === 0 ? 1 : this.renderPrecision;
  }

  /**
   * Get the combined device scale factor.
   *
   * This is the device pixel ratio multiplied by render precision.
   * Used to convert CSS pixels to physical canvas pixels.
   *
   * @returns Combined scale factor
   */
  public getDeviceScale() {
    return getSafeDevicePixelRatio() * this.getRenderPrecision();
  }

  /**
   * Update the fallback mode state based on current conditions.
   *
   * Fallback mode uses CSS backdrop-filter instead of WebGL rendering.
   * It's enabled ONLY when:
   * - WebGL is not supported (glassNotSupported)
   * - Component is not visible
   *
   * Note: When enableBlurredEffect is true and page is blurred, we use
   * the 'blurredChanged' event instead to hide border/shadow without
   * switching to backdrop-filter.
   *
   * Emits 'fallbackModeChanged' when the mode changes.
   */
  public updateFallbackMode() {
    this.log('debug', 'Updating fallback mode. Glass supported:', !this.glassNotSupported, 'Visible:', this.visible);

    const shouldFallback = this.glassNotSupported || !this.visible;

    if (shouldFallback !== this.isFallbackMode) {
      this.isFallbackMode = shouldFallback;
      this.log('debug', 'Fallback mode set to:', this.isFallbackMode);
      this.emit('fallbackModeChanged', this.isFallbackMode);
    }
  }

  /**
   * Set the blurred state (page lost focus).
   *
   * When enableBlurredEffect is true and isBlurred becomes true,
   * materials should hide their border and shadow but keep the glass canvas as-is.
   *
   * @param blurred - Whether the page is blurred (lost focus)
   */
  public setBlurred(blurred: boolean) {
    if (this.isBlurred !== blurred) {
      this.isBlurred = blurred;
      this.log('debug', `Blurred state set to: ${this.isBlurred}`);
      this.emit('blurredChanged', this.isBlurred);
    }
  }

  /**
   * Set the visibility state of the LiquidGlass component.
   *
   * When not visible, fallback mode is enabled to save resources.
   *
   * @param visible - Whether the component is visible
   */
  public setVisibility(visible: boolean) {
    this.visible = visible;
    this.updateFallbackMode();
  }

  // ============================================================================
  // LOGGING - Debug Output
  // ============================================================================

  /**
   * Log messages based on the debug flag.
   *
   * - 'debug' level only logs when this.debug is true
   * - Other levels always log
   *
   * @param level - Log level ('info', 'warn', 'error', 'debug')
   * @param message - The message to log
   * @param args - Additional arguments to log
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
