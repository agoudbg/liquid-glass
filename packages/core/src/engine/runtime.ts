import { GlassError } from '../errors/GlassError';

/** Browser operations injected into `GlassEngine` for deterministic tests. */
export interface GlassEngineRuntime {
  /** Create a canvas without requiring module-evaluation DOM access. */
  createCanvas(): HTMLCanvasElement;
  /** Read the current device pixel ratio. */
  devicePixelRatio(): number;
  /** Read computed material styles. */
  getComputedStyle(element: Element): CSSStyleDeclaration;
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
};
