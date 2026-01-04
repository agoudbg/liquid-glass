/**
 * @fileoverview Opacity calculation utilities for Liquid Glass components.
 *
 * This module provides functions to calculate cumulative opacity by traversing
 * the DOM tree and checking visibility states.
 */

/**
 * Visibility state of an element.
 * - 'visible': Element is visible with some opacity
 * - 'hidden': Element is hidden (opacity: 0, visibility: hidden, or display: none)
 */
export type VisibilityState = 'visible' | 'hidden';

/**
 * Result of computing element visibility and opacity.
 */
export interface ComputedVisibility {
  /** Whether the element is visible */
  state: VisibilityState;
  /** The cumulative opacity (0-1), considering all ancestors up to the boundary */
  opacity: number;
}

/**
 * Calculate the cumulative opacity of an element by traversing up the DOM tree.
 * Stops at the specified boundary element (exclusive).
 *
 * @param element - The element to calculate opacity for
 * @param boundaryElement - The element to stop at (exclusive), typically the LiquidGlass container
 * @returns ComputedVisibility with state and cumulative opacity
 *
 * @example
 * const visibility = computeElementVisibility(materialEl, liquidGlassContainer);
 * if (visibility.state === 'hidden') {
 *   // Skip rendering this element
 * } else {
 *   // Use visibility.opacity for rendering
 * }
 */
export function computeElementVisibility(
  element: HTMLElement,
  boundaryElement: HTMLElement | null,
): ComputedVisibility {
  let currentElement: HTMLElement | null = element;
  let cumulativeOpacity = 1;

  while (currentElement) {
    // Stop if we've reached the boundary element
    if (boundaryElement && currentElement === boundaryElement) {
      break;
    }

    const style = window.getComputedStyle(currentElement);

    // Check for hidden states
    if (style.display === 'none') {
      return { state: 'hidden', opacity: 0 };
    }

    if (style.visibility === 'hidden') {
      return { state: 'hidden', opacity: 0 };
    }

    // Get opacity and multiply
    const opacity = parseFloat(style.opacity);
    if (opacity === 0) {
      return { state: 'hidden', opacity: 0 };
    }

    cumulativeOpacity *= opacity;

    // Move to parent
    currentElement = currentElement.parentElement;
  }

  // Clamp to valid range
  cumulativeOpacity = Math.max(0, Math.min(1, cumulativeOpacity));

  return {
    state: cumulativeOpacity > 0 ? 'visible' : 'hidden',
    opacity: cumulativeOpacity,
  };
}

/**
 * Check if an element is effectively hidden (should skip rendering).
 *
 * @param element - The element to check
 * @param boundaryElement - The element to stop at (exclusive)
 * @returns true if the element should be skipped for rendering
 */
export function isElementHidden(
  element: HTMLElement,
  boundaryElement: HTMLElement | null,
): boolean {
  return computeElementVisibility(element, boundaryElement).state === 'hidden';
}
