/**
 * @fileoverview Backdrop element wrapper for LiquidGlass rendering.
 *
 * This class manages a single backdrop element (HTML content or custom canvas)
 * that provides the background texture for the liquid glass refraction effect.
 *
 * Backdrop elements can be:
 * - **DOM elements**: Captured via html-to-image library
 * - **Custom Canvas**: Drawn via user-provided callback function
 *
 * Key Features:
 * - Position tracking relative to LiquidGlass container
 * - Visibility/opacity computation for transparent overlays
 * - Viewport-based capture for mobile memory optimization
 * - Event-driven recapture coordination with manager
 *
 * Usage:
 * Typically created by LgBackdropConverter or LgBackdropCanvas Vue components.
 *
 * @module LiquidRendererBackdropElement
 */

import {
  CustomDrawCallback,
  LiquidRendererBackdropElementOptions,
  LiquidRendererBackdropElementType,
  ViewportCaptureRect,
} from '../types/LiquidGlass';
import { getSafeDevicePixelRatio } from '../utils/featureDetect';
import { ComputedVisibility, computeElementVisibility } from '../utils/opacity';
import { EventEmitter } from './EventEmitter';
import { LiquidRendererManager } from './LiquidRendererManager';

/**
 * Represents a backdrop element registered with the LiquidRendererManager.
 *
 * This class wraps an HTML element or custom canvas that serves as the
 * background content for liquid glass refraction effects. It handles:
 *
 * 1. **Position Tracking**: Monitors element position relative to container
 * 2. **Canvas Management**: Stores the captured content as OffscreenCanvas
 * 3. **Recapture Coordination**: Manages pending capture requests
 * 4. **Visibility Computation**: Calculates cumulative opacity
 *
 * @emits requestBackdropCapture - When the element needs to be recaptured
 */
export class LiquidRendererBackdropElement extends EventEmitter {
  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================

  /** Reference to the parent manager */
  public manager: LiquidRendererManager;

  /** The DOM element this backdrop wraps */
  public element: HTMLElement;

  /** Type of backdrop: 'dom' (html-to-image) or 'canvas' (custom draw) */
  public type: LiquidRendererBackdropElementType;

  /** Configuration options for this backdrop element */
  public options?: LiquidRendererBackdropElementOptions;

  /** The captured content as an OffscreenCanvas */
  public canvas?: OffscreenCanvas;

  /** True while a capture operation is in progress */
  public isReCapturing = false;

  /** True if another capture was requested during an ongoing capture */
  public hasPendingCaptureRequest = false;

  /** Whether the backdrop element has captured its content at least once */
  public hasContent = false;

  /** Position relative to LiquidGlass container (includes scroll offset) */
  public position = { x: 0, y: 0 };

  /** Size in physical pixels (CSS size * device scale) */
  public size = { width: 0, height: 0 };

  /**
   * Cached computed visibility (opacity and hidden state).
   * Updated during position/size updates.
   * Hidden elements are skipped during backdrop composition.
   */
  public visibility: ComputedVisibility = { state: 'visible', opacity: 1 };

  /**
   * The currently captured viewport region (in CSS pixels, relative to element).
   *
   * When viewport capture is enabled (for mobile optimization), this defines
   * which portion of the element has been captured to the canvas. The manager
   * uses this to correctly position the partial capture in the full backdrop.
   *
   * If null, the entire element is captured (original behavior).
   */
  public viewportCaptureRect: ViewportCaptureRect | null = null;

  /**
   * Full size of the element in CSS pixels, regardless of viewport capture.
   * Used for coordinate mapping when viewport capture is enabled.
   */
  public fullSize = { width: 0, height: 0 };

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * Create a new backdrop element wrapper.
   *
   * @param manager - The parent LiquidRendererManager
   * @param element - The DOM element to wrap
   * @param options - Configuration options (type, zIndex, watchNodeChanges, etc.)
   */
  constructor(manager: LiquidRendererManager, element: HTMLElement, options?: LiquidRendererBackdropElementOptions) {
    super();
    this.manager = manager;
    this.element = element;
    this.options = options;

    this.canvas = new OffscreenCanvas(1, 1);

    this.type = options?.type;

    if (this.type === 'canvas') {
      // Draw user content to canvas
      // this.drawUserContentToCanvas(options?.userCanvasCallback);
    }

    // Register this element with the manager
    this.manager.registerBackdropElement(this);

    this.addEventListeners();

    this.updatePositionAndSize();

    this.manager.log('debug', 'LiquidRendererBackdropElement created for element:', element);
  }

  // ============================================================================
  // OPTIONS
  // ============================================================================

  /**
   * Update options for this backdrop element.
   *
   * @param options - Partial options to update
   */
  public setOptions(options: Partial<LiquidRendererBackdropElementOptions>) {
    if (options.type !== undefined) {
      this.type = options.type;
    }
    if (this.options) {
      Object.assign(this.options, options);
    } else {
      this.options = options as LiquidRendererBackdropElementOptions;
    }
    // Structural change - request re-capture
    this.sendReCaptureRequest();
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================

  /**
   * Add event listeners based on options.
   *
   * Currently only listens for DOM mutations if watchNodeChanges is enabled.
   * Position/size updates are handled by manager's RAF loop, not here.
   */
  private addEventListeners() {
    // Only listen to structural changes that require re-capture
    // Position/size updates are handled by manager's RAF loop

    if (this.options?.watchNodeChanges) {
      const observer = new MutationObserver(() => {
        this.manager.log('debug', 'Backdrop element DOM changed:', this.element);
        // DOM structure changed - need to re-capture
        this.sendReCaptureRequest();
      });
      observer.observe(this.element, { childList: true, subtree: true });
    }

    // Note: Resize and scroll are now handled by the manager's centralized RAF loop
    // This prevents child interactions from triggering expensive parent re-captures
  }

  // ============================================================================
  // POSITION AND SIZE
  // ============================================================================

  /**
   * Update the element's position and size from the DOM.
   *
   * This method:
   * 1. Reads the element's bounding rect
   * 2. Calculates position relative to LiquidGlass container
   * 3. Applies scroll offset for correct canvas placement
   * 4. Scales size by device pixel ratio
   * 5. Computes cumulative opacity for transparency
   *
   * @param options - Control whether to trigger recapture
   */
  public updatePositionAndSize(options?: { suppressReRender?: boolean }) {
    const rect = this.element.getBoundingClientRect();
    const containerRect = this.manager.container.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const elementLeftDocument = rect.left + scrollX;
    const elementTopDocument = rect.top + scrollY;
    const containerLeftDocument = containerRect.left + scrollX;
    const containerTopDocument = containerRect.top + scrollY;

    // Position relative to the manager's content area + its internal scroll.
    this.position.x = elementLeftDocument - containerLeftDocument + this.manager.scroll.x;
    this.position.y = elementTopDocument - containerTopDocument + this.manager.scroll.y;

    // MEMORY FIX: Use effective pixel scale (safe DPR * render precision) for consistent sizing
    const pixelScale = getSafeDevicePixelRatio() * this.manager.getRenderPrecision();
    this.size.width = rect.width * pixelScale;
    this.size.height = rect.height * pixelScale;

    // Store full size in CSS pixels for viewport capture coordinate mapping
    this.fullSize.width = rect.width;
    this.fullSize.height = rect.height;

    // Compute cumulative opacity from element up to LiquidGlass container
    this.visibility = computeElementVisibility(this.element, this.manager.container);

    // Since position or size may have changed, request a re-capture
    if (!options?.suppressReRender) {
      this.sendReCaptureRequest();
    }
  }

  // ============================================================================
  // CAPTURE COORDINATION
  // ============================================================================

  /**
   * Send a request to trigger backdrop recapture.
   *
   * This method implements a queuing mechanism:
   * - If already capturing, marks a pending request flag
   * - Only one capture runs at a time to avoid race conditions
   *
   * Emits 'requestBackdropCapture' which the parent component
   * (LgBackdropConverter or LgBackdropCanvas) listens to.
   */
  public sendReCaptureRequest() {
    if (this.isReCapturing) {
      this.hasPendingCaptureRequest = true;
      this.manager.log('debug', 'Backdrop element is already recapturing, marking pending request:', this.element);
      return;
    }

    this.isReCapturing = true;

    this.manager.log('debug', 'No pending. Sending re-capture request for backdrop element:', this.element);
    this.emit('requestBackdropCapture');
  }

  /**
   * Notify the manager that capture is complete.
   *
   * Called by the parent component after html-to-image or custom draw completes.
   * This stores the captured canvas and triggers manager's backdrop composition.
   *
   * @param canvas - The captured content as OffscreenCanvas
   * @param viewportRect - Optional viewport region that was captured (for mobile optimization)
   */
  public requestManagerBackdropCapture(canvas: OffscreenCanvas, viewportRect?: ViewportCaptureRect) {
    this.manager.log('debug', 'Requesting backdrop capture for element:', this.element);

    // Save canvas and mark that content has been captured
    this.canvas = canvas;
    this.hasContent = true;

    // Store viewport capture rect for coordinate mapping
    // If not provided, assume entire element was captured (null)
    this.viewportCaptureRect = viewportRect ?? null;

    this.isReCapturing = false;

    // If there was a pending request, trigger another capture
    if (this.hasPendingCaptureRequest) {
      this.hasPendingCaptureRequest = false;
      this.sendReCaptureRequest();
    } else {
      this.manager.onBackdropElementChange();
    }
  }

  /**
   * Set the viewport capture rectangle directly.
   *
   * @param rect - The captured viewport region, or null for full element capture
   */
  public setViewportCaptureRect(rect: ViewportCaptureRect | null) {
    this.viewportCaptureRect = rect;
  }

  // ============================================================================
  // CUSTOM CANVAS DRAWING
  // ============================================================================

  /**
   * Draw user-provided content to the canvas.
   *
   * Used when type is 'canvas' - calls the user's draw callback
   * to render custom content directly to an OffscreenCanvas.
   *
   * @param userCanvasCallback - Function to draw content
   * @returns The canvas with dimensions
   * @throws If type is not 'canvas' or callback is missing
   */
  public async drawUserContentToCanvas(userCanvasCallback?: CustomDrawCallback): Promise<{ canvas: OffscreenCanvas; width: number; height: number; }> {
    this.manager.log('debug', 'Drawing user content to canvas for backdrop element:', this.element);
    if (this.type !== 'canvas' || !this.canvas || !userCanvasCallback) throw new Error('Backdrop element is not of type canvas or missing userCanvasCallback');

    this.updatePositionAndSize({ suppressReRender: true });

    this.canvas.width = this.size.width;
    this.canvas.height = this.size.height;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context from OffscreenCanvas');

    // Clear the canvas
    ctx.clearRect(0, 0, this.size.width, this.size.height);

    // Call the user-provided callback to draw content
    userCanvasCallback(ctx, this.size.width, this.size.height);

    this.manager.log('debug', 'User content drawn to canvas for backdrop element:', this.element);

    // Mark that content has been captured
    this.requestManagerBackdropCapture(this.canvas);

    return {
      canvas: this.canvas,
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Destroy this backdrop element and clean up resources.
   *
   * This method:
   * 1. Unregisters from the manager
   * 2. Releases canvas memory (sets dimensions to 0)
   *
   * IMPORTANT: After calling destroy(), this element is no longer usable.
   */
  public destroy() {
    // Unregister this element from the manager
    this.manager.unregisterBackdropElement(this);

    // MEMORY FIX: Set OffscreenCanvas dimensions to 0 to hint browser to free GPU memory
    // This is especially important on iOS where GPU memory is limited
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }

    this.manager.log('debug', 'LiquidRendererBackdropElement destroyed for element:', this.element);
  }
}
