import type { GlassEngineRuntime } from './runtime';

/** Callbacks invoked for coalesced browser lifecycle events. */
export interface ContextEventCallbacks {
  /** Invalidate DOM layout and recapture affected sources. */
  onLayout(): void;
  /** Recompose current geometry and conditionally refresh viewport captures. */
  onScroll(): void;
  /** Synchronize presentation position before the browser paints a scroll frame. */
  onScrollPosition(): void;
  /** Synchronize inactive-page presentation without requesting a render. */
  onBlurredChange(blurred: boolean): void;
}

/**
 * Own context-level layout, scroll, and inactive-page listeners.
 *
 * Layout events are coalesced to one frame. Inactive-page events publish only
 * presentation state, so they never enter the renderer scheduling path.
 */
export class ContextEventController {
  private readonly targetCleanups: Array<() => void> = [];
  private readonly inactivePageCleanups: Array<() => void> = [];
  private frameHandle: number | null = null;
  private pendingReason: 'layout' | 'scroll' | null = null;
  private blurredEffectEnabled = false;
  private documentHidden = false;
  private windowFocused = true;
  private blurred = false;
  private destroyed = false;

  /** Create and immediately attach context lifecycle observers. */
  public constructor(
    private readonly container: HTMLElement,
    private readonly runtime: GlassEngineRuntime,
    private readonly callbacks: ContextEventCallbacks,
    enableBlurredEffect = false,
    private readonly scrollTarget: HTMLElement = container,
  ) {
    try {
      this.configureTargets();
      this.setBlurredEffectEnabled(enableBlurredEffect);
    } catch (error) {
      this.teardown();
      throw error;
    }
  }

  /** Rebind scroll targets after container layout or options change. */
  public refreshTargets(): void {
    if (this.destroyed) {
      return;
    }
    this.teardownTargets();
    try {
      this.configureTargets();
    } catch (error) {
      this.teardownTargets();
      throw error;
    }
  }

  /** Enable or disable inactive-page observation without rebinding layout targets. */
  public setBlurredEffectEnabled(enabled: boolean): void {
    if (this.destroyed || this.blurredEffectEnabled === enabled) {
      return;
    }
    this.teardownInactivePage();
    this.blurredEffectEnabled = enabled;
    if (!enabled) {
      this.publishBlurred(false);
      return;
    }
    try {
      this.configureInactivePage();
    } catch (error) {
      this.teardownInactivePage();
      this.blurredEffectEnabled = false;
      this.publishBlurred(false);
      throw error;
    }
  }

  /** Release every observer, listener, and queued animation frame. */
  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.teardown();
  }

  private configureTargets(): void {
    const resizeObserver = this.createResizeObserver(() => this.queue('layout'));
    if (resizeObserver) {
      resizeObserver.observe(this.container);
      if (this.scrollTarget !== this.container) {
        resizeObserver.observe(this.scrollTarget);
      }
      this.targetCleanups.push(() => resizeObserver.disconnect());
    }

    const browserWindow = this.getWindow();
    if (browserWindow) {
      this.targetCleanups.push(this.listen(
        browserWindow,
        'resize',
        () => this.queue('layout'),
      ));
      this.targetCleanups.push(this.listen(
        browserWindow,
        'scroll',
        () => this.handleScroll(),
        { capture: true, passive: true },
      ));
    }
    this.targetCleanups.push(this.listen(
      this.scrollTarget,
      'scroll',
      () => this.handleScroll(),
      { capture: true, passive: true },
    ));
    for (const ancestor of this.getScrollableAncestors()) {
      this.targetCleanups.push(this.listen(
        ancestor,
        'scroll',
        () => this.handleScroll(),
        { capture: true, passive: true },
      ));
    }
  }

  private configureInactivePage(): void {
    const browserWindow = this.getWindow();
    const browserDocument = this.getDocument();
    this.documentHidden = browserDocument?.hidden ?? false;
    this.windowFocused = browserDocument ? this.readDocumentFocus(browserDocument) : true;

    if (browserWindow) {
      this.inactivePageCleanups.push(this.listen(
        browserWindow,
        'blur',
        () => {
          this.windowFocused = false;
          this.publishInactivePageState();
        },
      ));
      this.inactivePageCleanups.push(this.listen(
        browserWindow,
        'focus',
        () => {
          this.windowFocused = true;
          this.publishInactivePageState();
        },
      ));
    }
    if (browserDocument) {
      this.inactivePageCleanups.push(this.listen(
        browserDocument,
        'visibilitychange',
        () => {
          this.documentHidden = browserDocument.hidden;
          if (!this.documentHidden) {
            this.windowFocused = this.readDocumentFocus(browserDocument);
          }
          this.publishInactivePageState();
        },
      ));
    }
    this.publishInactivePageState();
  }

  private publishInactivePageState(): void {
    this.publishBlurred(this.documentHidden || !this.windowFocused);
  }

  private publishBlurred(blurred: boolean): void {
    if (this.blurred === blurred) return;
    this.blurred = blurred;
    this.callbacks.onBlurredChange(blurred);
  }

  private readDocumentFocus(browserDocument: Document): boolean {
    return typeof browserDocument.hasFocus === 'function'
      ? browserDocument.hasFocus()
      : true;
  }

  private getDocument(): Document | null {
    if (this.runtime.getDocument) {
      return this.runtime.getDocument();
    }
    return typeof globalThis.document === 'undefined' ? null : globalThis.document;
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
    this.teardownTargets();
    this.teardownInactivePage();
  }

  private teardownTargets(): void {
    for (const cleanup of this.targetCleanups.splice(0)) {
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

  private teardownInactivePage(): void {
    for (const cleanup of this.inactivePageCleanups.splice(0)) {
      cleanup();
    }
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
    let ancestor = this.scrollTarget.parentElement;
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
