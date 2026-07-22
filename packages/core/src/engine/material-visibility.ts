import { computeElementVisibility } from '../utils/opacity';
import type { GlassEngineRuntime } from './runtime';

/** Why a material does or does not participate in the current composite. */
export type MaterialVisibilityReason =
  | 'disconnected'
  | 'empty'
  | 'outside-canvas'
  | 'hidden'
  | 'visible';

interface DisconnectedMaterialVisibility {
  /** The material is detached from its document. */
  reason: 'disconnected';
  /** Detached materials never participate in rendering. */
  visible: false;
}

interface EmptyMaterialVisibility {
  /** The transformed bounds are invalid or have no area. */
  reason: 'empty';
  /** Invalid or empty materials never participate in rendering. */
  visible: false;
}

interface OutsideCanvasMaterialVisibility {
  /** The transformed bounds have no positive-area canvas intersection. */
  reason: 'outside-canvas';
  /** Fully outside materials do not participate in rendering. */
  visible: false;
}

interface HiddenMaterialVisibility {
  /** CSS on the material or an in-context ancestor hides it. */
  reason: 'hidden';
  /** CSS-hidden materials never participate in rendering. */
  visible: false;
}

/** Measurements shared with material resolution after culling succeeds. */
export interface VisibleMaterialVisibility {
  /** Cumulative material and ancestor opacity, excluding the context. */
  opacity: number;
  /** The transformed viewport bounds returned by the browser. */
  rect: DOMRectReadOnly;
  /** The material's computed style, read exactly once for this evaluation. */
  style: CSSStyleDeclaration;
  /** The material passed every synchronous culling check. */
  reason: 'visible';
  /** Visible materials participate in rendering. */
  visible: true;
}

/** Result of one synchronous material visibility evaluation. */
export type MaterialVisibilityResult =
  | DisconnectedMaterialVisibility
  | EmptyMaterialVisibility
  | OutsideCanvasMaterialVisibility
  | HiddenMaterialVisibility
  | VisibleMaterialVisibility;

function hasFinitePositiveArea(rect: DOMRectReadOnly): boolean {
  return Number.isFinite(rect.left)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function intersectsWithPositiveArea(
  rect: DOMRectReadOnly,
  canvasRect: DOMRectReadOnly,
): boolean {
  const intersectionWidth = Math.min(
    rect.left + rect.width,
    canvasRect.left + canvasRect.width,
  ) - Math.max(rect.left, canvasRect.left);
  const intersectionHeight = Math.min(
    rect.top + rect.height,
    canvasRect.top + canvasRect.height,
  ) - Math.max(rect.top, canvasRect.top);

  return intersectionWidth > 0 && intersectionHeight > 0;
}

/**
 * Evaluate whether a material contributes pixels to the current context.
 *
 * Browser-transformed bounds are intentionally used directly for culling so
 * translation, scale, and rotation can move an otherwise outside material into
 * the context. Ancestor overflow clipping is outside this synchronous policy.
 *
 * @param element - Material DOM element to evaluate.
 * @param container - Exclusive boundary for ancestor visibility traversal.
 * @param canvasRect - Context bounds in viewport coordinates.
 * @param runtime - Injected computed-style runtime.
 * @returns A reasoned culling result with reusable visible measurements.
 */
export function resolveMaterialVisibility(
  element: HTMLElement,
  container: HTMLElement,
  canvasRect: DOMRectReadOnly,
  runtime: GlassEngineRuntime,
): MaterialVisibilityResult {
  if (element.isConnected === false) {
    return { reason: 'disconnected', visible: false };
  }

  const rect = element.getBoundingClientRect();
  if (!hasFinitePositiveArea(rect)) {
    return { reason: 'empty', visible: false };
  }

  if (!intersectsWithPositiveArea(rect, canvasRect)) {
    return { reason: 'outside-canvas', visible: false };
  }

  const style = runtime.getComputedStyle(element);
  const visibility = computeElementVisibility(
    element,
    container,
    (currentElement) => (
      currentElement === element
        ? style
        : runtime.getComputedStyle(currentElement)
    ),
  );
  if (visibility.state === 'hidden') {
    return { reason: 'hidden', visible: false };
  }

  return {
    opacity: visibility.opacity,
    rect,
    style,
    reason: 'visible',
    visible: true,
  };
}
