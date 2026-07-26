import type { GlassContextOptions } from '../types/context';

/** Own core-authored container markers and uniform canvas presentation styles. */
export class ContextPresentation {
  private readonly initialFallbackAttribute: string | null;
  private readonly initialScrollableAttribute: string | null;
  private readonly initialContentScrollableAttribute: string | null;
  private readonly initialContentScrollableClass: boolean;
  private scrollable = false;
  private viewportMode = false;

  /** Configure invariant styles and preserve consumer-owned container state. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly content: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    options: GlassContextOptions,
  ) {
    this.initialFallbackAttribute = container.getAttribute('data-lg-fallback');
    this.initialScrollableAttribute = container.getAttribute('data-lg-scrollable');
    this.initialContentScrollableAttribute = content.getAttribute(
      'data-lg-scrollable',
    );
    this.initialContentScrollableClass = content.classList?.contains(
      'scrollable',
    ) ?? false;
    canvas.className = 'liquid-glass-canvas';
    canvas.dataset.liquidGlassCanvas = 'uniform';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.opacity = '1';
    canvas.style.pointerEvents = 'none';
    canvas.style.transition = 'visibility 0.2s ease, opacity 0.2s ease';
    canvas.style.visibility = 'visible';
    this.setFallbackMode(false);
    this.update(options);
  }

  /** Apply mutable context options without replacing DOM nodes. */
  public update(options: GlassContextOptions): void {
    this.scrollable = options.scrollable ?? false;
    this.canvas.style.zIndex = String(options.canvasZIndex ?? 9_999);
    this.container.setAttribute(
      'data-lg-scrollable',
      String(this.scrollable),
    );
    this.content.setAttribute('data-lg-scrollable', String(this.scrollable));
    this.content.classList?.toggle('scrollable', this.scrollable);
    this.syncScrollPosition();
  }

  /** Switch between full-content presentation and viewport-limited presentation. */
  public setViewportMode(enabled: boolean): void {
    this.viewportMode = enabled;
    this.canvas.className = enabled
      ? 'liquid-glass-canvas viewport-mode'
      : 'liquid-glass-canvas';
    this.syncScrollPosition();
  }

  /** Match the canvas CSS box to the logical renderer dimensions. */
  public syncCanvasSize(width: number, height: number): void {
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  /** Keep only a viewport-limited canvas stationary inside scrolling content. */
  public syncScrollPosition(): void {
    this.canvas.style.transform = this.scrollable && this.viewportMode
      ? `translate3d(${this.content.scrollLeft}px, ${this.content.scrollTop}px, 0)`
      : '';
  }

  /** Switch between the rendered presentation canvas and CSS material fallback. */
  public setFallbackMode(enabled: boolean): void {
    this.container.setAttribute('data-lg-fallback', String(enabled));
    this.canvas.style.opacity = enabled ? '0' : '1';
    this.canvas.style.visibility = enabled ? 'hidden' : 'visible';
  }

  /** Restore the container marker that existed before context ownership. */
  public destroy(): void {
    if (this.initialFallbackAttribute === null) {
      this.container.removeAttribute('data-lg-fallback');
    } else {
      this.container.setAttribute(
        'data-lg-fallback',
        this.initialFallbackAttribute,
      );
    }
    if (this.initialScrollableAttribute === null) {
      this.container.removeAttribute('data-lg-scrollable');
    } else {
      this.container.setAttribute(
        'data-lg-scrollable',
        this.initialScrollableAttribute,
      );
    }
    if (this.initialContentScrollableAttribute === null) {
      this.content.removeAttribute('data-lg-scrollable');
    } else {
      this.content.setAttribute(
        'data-lg-scrollable',
        this.initialContentScrollableAttribute,
      );
    }
    this.content.classList?.toggle(
      'scrollable',
      this.initialContentScrollableClass,
    );
  }
}
