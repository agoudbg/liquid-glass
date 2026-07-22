import {
  captureDomElement,
  type DomCaptureRequest,
  type DomCaptureResult,
} from '../backdrop/dom-capture';
import { GlassError } from '../errors/GlassError';
import type { RectLike } from '../types/common';

/** Browser operations injected into `GlassEngine` for deterministic tests. */
export interface GlassEngineRuntime {
  /** Cancel a context-owned animation frame. */
  cancelAnimationFrame?(handle: number): void;
  /** Capture a DOM source through the configured rasterization runtime. */
  captureDomElement?(request: DomCaptureRequest): Promise<DomCaptureResult>;
  /** Create a canvas without requiring module-evaluation DOM access. */
  createCanvas(): HTMLCanvasElement;
  /** Read the current device pixel ratio. */
  devicePixelRatio(): number;
  /** Read computed material styles. */
  getComputedStyle(element: Element): CSSStyleDeclaration;
  /** Read the current top-level viewport in client coordinates. */
  getViewportRect?(): RectLike;
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
  cancelAnimationFrame: (handle) => globalThis.cancelAnimationFrame(handle),
  captureDomElement,
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
  getViewportRect: () => ({
    x: 0,
    y: 0,
    width: globalThis.innerWidth,
    height: globalThis.innerHeight,
  }),
  requestAnimationFrame: (callback) => globalThis.requestAnimationFrame(callback),
};
