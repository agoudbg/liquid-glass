import { CustomDrawCallback, LiquidRendererBackdropElementOptions, LiquidRendererBackdropElementType } from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';
import { LiquidRendererManager } from './LiquidRendererManager';

export class LiquidRendererBackdropElement extends EventEmitter {
  public manager: LiquidRendererManager;

  public element: HTMLElement;

  public type: LiquidRendererBackdropElementType;

  public options?: LiquidRendererBackdropElementOptions;

  public canvas?: OffscreenCanvas;

  public isReCapturing = false;

  public hasPendingCaptureRequest = false;

  /** Whether the backdrop element has captured its content at least once */
  public hasContent = false;

  public position = { x: 0, y: 0 };

  public size = { width: 0, height: 0 };

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

  public setOptions(options: Partial<LiquidRendererBackdropElementOptions>) {
    this.options = { ...this.options, ...options };
    this.manager.requestBackdropRender();
  }

  /**
   * Add event listeners based on options
   */
  private addEventListeners() {
    // Add any event listeners needed for this backdrop element
    // Todo: add debounce
    if (this.options?.watchResize) {
      const resizeObserver = new ResizeObserver(() => {
        this.manager.log('debug', 'Backdrop element resized:', this.element);
        // Handle resize logic
        this.updatePositionAndSize();
      });
      resizeObserver.observe(this.element);
    }

    if (this.options?.watchNodeChanges) {
      const observer = new MutationObserver(() => {
        this.manager.log('debug', 'Backdrop element node changed:', this.element);
        // Handle node change logic
        this.updatePositionAndSize();
      });
      observer.observe(this.element, { childList: true, subtree: true });
    }

    if (this.options?.watchPositionChanges) {
      // Position change detection can be complex; this is a placeholder
      this.element.addEventListener('scroll', () => {
        this.manager.log('debug', 'Backdrop element position may have changed due to scroll:', this.element);
        // Handle position change logic
        this.updatePositionAndSize();
      });
    }
  }

  public updatePositionAndSize(options?: { suppressReRender?: boolean }) {
    const rect = this.element.getBoundingClientRect();
    const x = rect.left + window.scrollX;
    const y = rect.top + window.scrollY;

    // Position should be relative to the document
    this.position.x = x - this.manager.position.x;
    this.position.y = y - this.manager.position.y;

    this.size.width = rect.width * (window.devicePixelRatio || 1);
    this.size.height = rect.height * (window.devicePixelRatio || 1);

    // Since position or size may have changed, request a re-capture
    if (!options?.suppressReRender) {
      this.sendReCaptureRequest();
    }
  }

  /**
   * Send a request to the manager to re-run backdrop capture.
   * The backdrop element should listen for 'requestBackdropCapture' events from the manager
   * and respond with its own requestManagerBackdropCapture call.
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
   * Send a request to the manager to re-run backdrop capture
   */
  public requestManagerBackdropCapture(canvas: OffscreenCanvas) {
    this.manager.log('debug', 'Requesting backdrop capture for element:', this.element);

    // Save canvas and mark that content has been captured
    this.canvas = canvas;
    this.hasContent = true;

    this.isReCapturing = false;

    // If there was a pending request, trigger another capture
    if (this.hasPendingCaptureRequest) {
      this.hasPendingCaptureRequest = false;
      this.sendReCaptureRequest();
    } else {
      this.manager.onBackdropElementChange();
    }
  }

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

  /**
   * Destroy this backdrop element and clean up
   */
  public destroy() {
    // Unregister this element from the manager
    this.manager.unregisterBackdropElement(this);
    this.manager.log('debug', 'LiquidRendererBackdropElement destroyed for element:', this.element);
  }
}
