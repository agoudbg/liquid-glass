import { LiquidRendererManagerOptions } from '../types/LiquidGlass';
import { EventEmitter } from './EventEmitter';

export class LiquidRendererManager extends EventEmitter {
  public debug = false;

  public container: HTMLElement;

  public backdropCanvas = new OffscreenCanvas(1, 1);

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

  /**
   * Add resize listeners to handle container size changes
   */
  private addResizeListeners() {
    this.log('debug', 'Adding resize listeners');

    const resizeObserver = new ResizeObserver(() => {
      this.onContainerResize();
    });
    resizeObserver.observe(this.container);

    window.addEventListener('resize', () => {
      this.onContainerResize();
    });

    // Initial resize
    this.onContainerResize();
  }

  /**
   * Handle container resize events
   */
  private onContainerResize() {
    this.log('debug', 'Container resized');

    const rect = this.container.getBoundingClientRect();
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

    // Todo: Add logic to draw registered elements onto the backdrop canvas

    this.emit('backdropCaptured', this.backdropCanvas);

    this.log('debug', 'Backdrop capture complete');
  }

  /**
   * Log messages based on the debug flag
   */
  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: any[]) {
    if (level === 'debug' && !this.debug) return;

    switch (level) {
      case 'info':
        console.info(`[LiquidRendererManager]: ${message}`, ...args);
        break;
      case 'warn':
        console.warn(`[LiquidRendererManager]: ${message}`, ...args);
        break;
      case 'error':
        console.error(`[LiquidRendererManager]: ${message}`, ...args);
        break;
      case 'debug':
        console.debug(`[LiquidRendererManager]: ${message}`, ...args);
        break;
      default:
    }
  }
}
