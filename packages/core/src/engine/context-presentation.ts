import type { GlassContextOptions } from '../types/context';

/** Own core-authored container markers and uniform canvas presentation styles. */
export class ContextPresentation {
  private readonly initialScrollableAttribute: string | null;

  /** Configure invariant styles and preserve consumer-owned container state. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    options: GlassContextOptions,
  ) {
    this.initialScrollableAttribute = container.getAttribute('data-lg-scrollable');
    canvas.className = 'liquid-glass-canvas';
    canvas.dataset.liquidGlassCanvas = 'uniform';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    this.update(options);
  }

  /** Apply mutable context options without replacing DOM nodes. */
  public update(options: GlassContextOptions): void {
    this.canvas.style.zIndex = String(options.canvasZIndex ?? 9_999);
    this.container.setAttribute(
      'data-lg-scrollable',
      options.scrollable ? 'true' : 'false',
    );
    this.syncScrollPosition(options.scrollable ?? false);
  }

  /** Keep the viewport-sized canvas stationary inside a scrolling container. */
  public syncScrollPosition(scrollable: boolean): void {
    this.canvas.style.transform = scrollable
      ? `translate3d(${this.container.scrollLeft}px, ${this.container.scrollTop}px, 0)`
      : '';
  }

  /** Restore the container marker that existed before context ownership. */
  public destroy(): void {
    if (this.initialScrollableAttribute === null) {
      this.container.removeAttribute('data-lg-scrollable');
    } else {
      this.container.setAttribute(
        'data-lg-scrollable',
        this.initialScrollableAttribute,
      );
    }
  }
}
