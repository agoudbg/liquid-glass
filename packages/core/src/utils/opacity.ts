import { GlassError } from '../errors/GlassError';

/**
 * Visibility state used by material culling.
 */
export type VisibilityState = 'visible' | 'hidden';

/**
 * Result of walking an element's ancestor opacity chain.
 */
export interface ComputedVisibility {
  /** Whether the material should participate in rendering. */
  state: VisibilityState;
  /** Product of element and ancestor opacities, clamped to 0-1. */
  opacity: number;
}

/**
 * Minimal computed style required by the visibility traversal.
 */
export interface VisibilityStyle {
  /** Computed CSS display value. */
  display: string;
  /** Computed CSS visibility value. */
  visibility: string;
  /** Computed CSS opacity value. */
  opacity: string;
}

/**
 * Injectable computed-style reader used by DOM-free unit tests.
 */
export type VisibilityStyleReader = (element: HTMLElement) => VisibilityStyle;

function browserStyleReader(element: HTMLElement): VisibilityStyle {
  if (typeof globalThis.getComputedStyle !== 'function') {
    throw new GlassError(
      'LIFECYCLE_FAILED',
      'Element visibility requires a browser computed-style implementation.',
      { phase: 'lifecycle' },
    );
  }

  return globalThis.getComputedStyle(element);
}

/**
 * Compute cumulative opacity from an element through its ancestors.
 *
 * The boundary is exclusive, matching the reference implementation: its own
 * display, visibility, and opacity do not affect the returned material value.
 *
 * @param element - Material element at which traversal starts.
 * @param boundaryElement - Exclusive ancestor boundary, or `null` for the root.
 * @param readStyle - Optional computed-style provider for tests or alternate DOMs.
 * @returns Visibility and cumulative opacity.
 */
export function computeElementVisibility(
  element: HTMLElement,
  boundaryElement: HTMLElement | null,
  readStyle: VisibilityStyleReader = browserStyleReader,
): ComputedVisibility {
  let currentElement: HTMLElement | null = element;
  let cumulativeOpacity = 1;

  while (currentElement) {
    if (boundaryElement && currentElement === boundaryElement) {
      break;
    }

    const style = readStyle(currentElement);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return { state: 'hidden', opacity: 0 };
    }

    const parsedOpacity = Number.parseFloat(style.opacity);
    const opacity = Number.isFinite(parsedOpacity) ? parsedOpacity : 1;
    if (opacity === 0) {
      return { state: 'hidden', opacity: 0 };
    }

    cumulativeOpacity *= opacity;
    currentElement = currentElement.parentElement;
  }

  cumulativeOpacity = Math.max(0, Math.min(1, cumulativeOpacity));
  return {
    state: cumulativeOpacity > 0 ? 'visible' : 'hidden',
    opacity: cumulativeOpacity,
  };
}

/**
 * Return only the cumulative opacity portion of `computeElementVisibility`.
 *
 * @param element - Material element at which traversal starts.
 * @param boundaryElement - Exclusive ancestor boundary, or `null` for the root.
 * @param readStyle - Optional computed-style provider.
 * @returns Cumulative opacity in the inclusive 0-1 range.
 */
export function computeCumulativeOpacity(
  element: HTMLElement,
  boundaryElement: HTMLElement | null,
  readStyle: VisibilityStyleReader = browserStyleReader,
): number {
  return computeElementVisibility(element, boundaryElement, readStyle).opacity;
}

/**
 * Determine whether a material should be skipped by the renderer.
 *
 * @param element - Material element at which traversal starts.
 * @param boundaryElement - Exclusive ancestor boundary, or `null` for the root.
 * @param readStyle - Optional computed-style provider.
 * @returns `true` when display, visibility, or opacity hides the element.
 */
export function isElementHidden(
  element: HTMLElement,
  boundaryElement: HTMLElement | null,
  readStyle: VisibilityStyleReader = browserStyleReader,
): boolean {
  return computeElementVisibility(element, boundaryElement, readStyle).state === 'hidden';
}
