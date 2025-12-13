import { LiquidRendererBackdropCapturedEvent, LiquidRendererManagerOptions } from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';
import { LiquidRendererBackdropElement } from './LiquidRendererBackdropElement';

export class LiquidRendererManager extends EventEmitter {
  public debug = false;

  public container: HTMLElement;

  public backdropCanvas = new OffscreenCanvas(1, 1);

  public renderPrecision = 0; // 0=auto

  public registeredBackdropElements: LiquidRendererBackdropElement[] = [];

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
    this.captureBackdrop();
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

    this.log('debug', `Canvas resized to ${this.backdropCanvas.width}x${this.backdropCanvas.height}`);

    // Capture the backdrop after resizing
    this.captureBackdrop();
  }

  /**
   * Capture the backdrop of the container element with all registered elements
   */
  private captureBackdrop() {
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
