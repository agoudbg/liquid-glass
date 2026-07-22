import {
  captureDomElement,
  type DomCaptureRequest,
  type DomCaptureResult,
} from '../backdrop/dom-capture';
import { GlassError } from '../errors/GlassError';
import type { RectLike } from '../types/common';

/** Browser operations injected into `GlassEngine` for deterministic tests. */
export interface GlassEngineRuntime {
  /** Add one owned DOM event listener and return its cleanup function. */
  addEventListener?(
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  /** Cancel a context-owned animation frame. */
  cancelAnimationFrame?(handle: number): void;
  /** Capture a DOM source through the configured rasterization runtime. */
  captureDomElement?(request: DomCaptureRequest): Promise<DomCaptureResult>;
  /** Create a mutation observer when the host supports one. */
  createMutationObserver?(callback: MutationCallback): MutationObserver | null;
  /** Create a resize observer when the host supports one. */
  createResizeObserver?(callback: ResizeObserverCallback): ResizeObserver | null;
  /** Create a canvas without requiring module-evaluation DOM access. */
  createCanvas(): HTMLCanvasElement;
  /** Read the current device pixel ratio. */
  devicePixelRatio(): number;
  /** Read computed material styles. */
  getComputedStyle(element: Element): CSSStyleDeclaration;
  /** Resolve the current browser document without touching it during SSR import. */
  getDocument?(): Document | null;
  /** Read the current top-level viewport in client coordinates. */
  getViewportRect?(): RectLike;
  /** Resolve the current browser window without touching it during SSR import. */
  getWindow?(): Window | null;
  /** Schedule a context-owned animation frame. */
  requestAnimationFrame?(callback: FrameRequestCallback): number;
}

function requireDocument(): Document {
  if (typeof document === 'undefined') {
    throw new GlassError(
      'LIFECYCLE_FAILED',
      'A browser document is required to create a liquid-glass context.',
      { phase: 'lifecycle' },
    );
  }
  return document;
}

/** Default lazy browser runtime used when no deterministic seam is injected. */
export const DEFAULT_GLASS_ENGINE_RUNTIME: GlassEngineRuntime = {
  addEventListener: (target, type, listener, options) => {
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
  },
  cancelAnimationFrame: (handle) => globalThis.cancelAnimationFrame(handle),
  captureDomElement,
  createMutationObserver: (callback) => (
    typeof globalThis.MutationObserver === 'function'
      ? new globalThis.MutationObserver(callback)
      : null
  ),
  createResizeObserver: (callback) => (
    typeof globalThis.ResizeObserver === 'function'
      ? new globalThis.ResizeObserver(callback)
      : null
  ),
  createCanvas: () => requireDocument().createElement('canvas'),
  devicePixelRatio: () => (
    typeof globalThis.devicePixelRatio === 'number'
      ? globalThis.devicePixelRatio
      : 1
  ),
  getComputedStyle: (element) => {
    if (typeof globalThis.getComputedStyle !== 'function') {
      throw new GlassError(
        'LIFECYCLE_FAILED',
        'Computed styles are unavailable outside a browser layout context.',
        { phase: 'lifecycle' },
      );
    }
    return globalThis.getComputedStyle(element);
  },
  getDocument: () => (
    typeof globalThis.document === 'undefined' ? null : globalThis.document
  ),
  getViewportRect: () => ({
    x: 0,
    y: 0,
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }),
  getWindow: () => (
    typeof globalThis.window === 'undefined' ? null : globalThis.window
  ),
  requestAnimationFrame: (callback) => globalThis.requestAnimationFrame(callback),
};
