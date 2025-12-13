import { LiquidRendererBackdropElementOptions } from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';
import { LiquidRendererManager } from './LiquidRendererManager';

export class LiquidRendererBackdropElement extends EventEmitter {
  public manager: LiquidRendererManager;

  public element: HTMLElement;

  public options?: LiquidRendererBackdropElementOptions;

  public canvas?: OffscreenCanvas;

  public position = { x: 0, y: 0 };

  public size = { width: 0, height: 0 };

  constructor(manager: LiquidRendererManager, element: HTMLElement, options?: LiquidRendererBackdropElementOptions) {
    super();
    this.manager = manager;
    this.element = element;
    this.options = options;

    this.canvas = new OffscreenCanvas(1, 1);

    // Register this element with the manager
    this.manager.registerBackdropElement(this);

    this.addEventListeners();

    this.updatePositionAndSize();

    this.manager.log('debug', 'LiquidRendererBackdropElement created for element:', element);
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

  public updatePositionAndSize() {
    const rect = this.element.getBoundingClientRect();
    const x = rect.left + window.scrollX;
    const y = rect.top + window.scrollY;

    // Position should be relative to the document
    this.position.x = x - this.manager.position.x;
    this.position.y = y - this.manager.position.y;

    this.size.width = rect.width * (window.devicePixelRatio || 1);
    this.size.height = rect.height * (window.devicePixelRatio || 1);

    // Since position or size may have changed, request a re-capture
    this.sendReCaptureRequest();
  }

  /**
   * Send a request to the manager to re-run backdrop capture.
   * The backdrop element should listen for 'requestBackdropCapture' events from the manager
   * and respond with its own requestManagerBackdropCapture call.
   */
  public sendReCaptureRequest() {
    this.manager.log('debug', 'Sending re-capture request for backdrop element:', this.element);
    this.emit('requestBackdropCapture');
  }

  /**
   * Send a request to the manager to re-run backdrop capture
   */
  public requestManagerBackdropCapture(canvas: OffscreenCanvas) {
    this.manager.log('debug', 'Requesting backdrop capture for element:', this.element);

    // Save canvas
    this.canvas = canvas;

    this.manager.onBackdropElementChange();
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
