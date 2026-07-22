import type { GlassEngineRuntime } from './runtime';

/** Callbacks invoked for coalesced browser lifecycle events. */
export interface ContextEventCallbacks {
  /** Invalidate DOM layout and recapture affected sources. */
  onLayout(): void;
  /** Recompose current geometry and conditionally refresh viewport captures. */
  onScroll(): void;
  /** Synchronize presentation position before the browser paints a scroll frame. */
  onScrollPosition(): void;
}

/**
 * Own context-level resize and scroll listeners with one-frame coalescing.
 *
 * Source observers live separately because their options and lifetimes differ.
 * This controller follows the context container for its entire lifetime.
 */
export class ContextEventController {
  private readonly cleanups: Array<() => void> = [];
  private frameHandle: number | null = null;
  private pendingReason: 'layout' | 'scroll' | null = null;
  private destroyed = false;

  /** Create and immediately attach context lifecycle observers. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly runtime: GlassEngineRuntime,
    private readonly callbacks: ContextEventCallbacks,
  ) {
    this.configure();
  }

  /** Rebind scroll targets after container layout or options change. */
  public refreshTargets(): void {
    if (this.destroyed) {
      return;
    }
    this.teardown();
    this.configure();
  }

  /** Release every observer, listener, and queued animation frame. */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.teardown();
  }

  private configure(): void {
    try {
      const resizeObserver = this.createResizeObserver(() => this.queue('layout'));
      if (resizeObserver) {
        resizeObserver.observe(this.container);
        this.cleanups.push(() => resizeObserver.disconnect());
      }

      const browserWindow = this.getWindow();
      if (browserWindow) {
        this.cleanups.push(this.listen(
          browserWindow,
          'resize',
          () => this.queue('layout'),
        ));
        this.cleanups.push(this.listen(
          browserWindow,
          'scroll',
          () => this.handleScroll(),
          { capture: true, passive: true },
        ));
      }
      this.cleanups.push(this.listen(
        this.container,
        'scroll',
        () => this.handleScroll(),
        { capture: true, passive: true },
      ));
      for (const ancestor of this.getScrollableAncestors()) {
        this.cleanups.push(this.listen(
          ancestor,
          'scroll',
          () => this.handleScroll(),
          { capture: true, passive: true },
        ));
      }
    } catch (error) {
      this.teardown();
      throw error;
    }
  }

  private queue(reason: 'layout' | 'scroll'): void {
    if (this.destroyed) {
      return;
    }
    if (reason === 'layout' || this.pendingReason === null) {
      this.pendingReason = reason;
    }
    if (this.frameHandle !== null) {
      return;
    }
    const requestFrame = this.runtime.requestAnimationFrame
      ?? (
        typeof globalThis.requestAnimationFrame === 'function'
          ? globalThis.requestAnimationFrame.bind(globalThis)
          : null
      );
    if (!requestFrame) {
      this.flush();
      return;
    }
    this.frameHandle = requestFrame(() => {
      this.frameHandle = null;
      this.flush();
    });
  }

  private handleScroll(): void {
    if (this.destroyed) {
      return;
    }
    this.callbacks.onScrollPosition();
    this.queue('scroll');
  }

  private flush(): void {
    const reason = this.pendingReason;
    this.pendingReason = null;
    if (this.destroyed || reason === null) {
      return;
    }
    if (reason === 'layout') {
      this.callbacks.onLayout();
    } else {
      this.callbacks.onScroll();
    }
  }

  private teardown(): void {
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
    if (this.frameHandle !== null) {
      const cancelFrame = this.runtime.cancelAnimationFrame
        ?? (
          typeof globalThis.cancelAnimationFrame === 'function'
            ? globalThis.cancelAnimationFrame.bind(globalThis)
            : null
        );
      cancelFrame?.(this.frameHandle);
      this.frameHandle = null;
    }
    this.pendingReason = null;
  }

  private createResizeObserver(
    callback: ResizeObserverCallback,
  ): ResizeObserver | null {
    if (this.runtime.createResizeObserver) {
      return this.runtime.createResizeObserver(callback);
    }
    return typeof globalThis.ResizeObserver === 'function'
      ? new globalThis.ResizeObserver(callback)
      : null;
  }

  private getWindow(): Window | null {
    if (this.runtime.getWindow) {
      return this.runtime.getWindow();
    }
    return typeof globalThis.window === 'undefined' ? null : globalThis.window;
  }

  private getScrollableAncestors(): HTMLElement[] {
    const ancestors: HTMLElement[] = [];
    let ancestor = this.container.parentElement;
    while (ancestor) {
      const style = this.runtime.getComputedStyle(ancestor);
      const overflow = [style.overflow, style.overflowX, style.overflowY].join(' ');
      if (/(auto|overlay|scroll)/u.test(overflow)) {
        ancestors.push(ancestor);
      }
      ancestor = ancestor.parentElement;
    }
    return ancestors;
  }

  private listen(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ): () => void {
    if (this.runtime.addEventListener) {
      return this.runtime.addEventListener(target, type, listener, options);
    }
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
  }
}
