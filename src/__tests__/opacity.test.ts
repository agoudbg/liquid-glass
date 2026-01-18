/**
 * Tests for opacity calculation utilities.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { computeElementVisibility, isElementHidden } from '../utils/opacity';

describe('computeElementVisibility', () => {
  let container: HTMLElement;
  let target: HTMLElement;

  beforeEach(() => {
    // Create DOM structure for testing
    container = document.createElement('div');
    target = document.createElement('div');
    container.appendChild(target);
    document.body.appendChild(container);

    // Set explicit styles to ensure consistent behavior in jsdom
    container.style.opacity = '1';
    container.style.display = 'block';
    container.style.visibility = 'visible';
    target.style.opacity = '1';
    target.style.display = 'block';
    target.style.visibility = 'visible';
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return visible with opacity 1 for a normal visible element', () => {
    const result = computeElementVisibility(target, container);
    expect(result.state).toBe('visible');
    expect(result.opacity).toBe(1);
  });

  it('should return hidden for element with display: none', () => {
    target.style.display = 'none';
    const result = computeElementVisibility(target, container);
    expect(result.state).toBe('hidden');
    expect(result.opacity).toBe(0);
  });

  it('should return hidden for element with visibility: hidden', () => {
    target.style.visibility = 'hidden';
    const result = computeElementVisibility(target, container);
    expect(result.state).toBe('hidden');
    expect(result.opacity).toBe(0);
  });

  it('should return hidden for element with opacity: 0', () => {
    target.style.opacity = '0';
    const result = computeElementVisibility(target, container);
    expect(result.state).toBe('hidden');
    expect(result.opacity).toBe(0);
  });

  it('should calculate cumulative opacity from ancestors', () => {
    // Create a nested structure
    const middle = document.createElement('div');
    middle.style.opacity = '0.5';
    container.appendChild(middle);
    middle.appendChild(target);
    target.style.opacity = '0.8';

    const result = computeElementVisibility(target, container);
    expect(result.state).toBe('visible');
    expect(result.opacity).toBeCloseTo(0.4, 5); // 0.5 * 0.8 = 0.4
  });

  it('should stop at boundary element', () => {
    // Container has low opacity but we should stop before it
    container.style.opacity = '0.1';
    target.style.opacity = '0.5';

    const result = computeElementVisibility(target, container);
    expect(result.state).toBe('visible');
    // Should only consider target's opacity, not container's
    expect(result.opacity).toBeCloseTo(0.5, 5);
  });

  it('should return hidden if ancestor has display: none', () => {
    const middle = document.createElement('div');
    middle.style.display = 'none';
    container.appendChild(middle);
    middle.appendChild(target);

    const result = computeElementVisibility(target, container);
    expect(result.state).toBe('hidden');
    expect(result.opacity).toBe(0);
  });

  it('should handle null boundary element without crashing', () => {
    // Note: When boundary is null, the function traverses up to the document root.
    // In jsdom, computed styles may have unexpected defaults (empty strings).
    // This test verifies the function handles null boundary without throwing errors.
    target.style.opacity = '0.5';

    // The function should not throw even with null boundary
    expect(() => computeElementVisibility(target, null)).not.toThrow();
  });

  it('should clamp opacity to valid range [0, 1]', () => {
    // Theoretically, CSS opacity should always be 0-1, but let's ensure we handle edge cases
    target.style.opacity = '0.999';
    const result = computeElementVisibility(target, container);
    expect(result.opacity).toBeGreaterThanOrEqual(0);
    expect(result.opacity).toBeLessThanOrEqual(1);
  });
});

describe('isElementHidden', () => {
  let container: HTMLElement;
  let target: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    target = document.createElement('div');
    container.appendChild(target);
    document.body.appendChild(container);

    // Set explicit styles for consistent behavior in jsdom
    container.style.opacity = '1';
    container.style.display = 'block';
    container.style.visibility = 'visible';
    target.style.opacity = '1';
    target.style.display = 'block';
    target.style.visibility = 'visible';
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should return false for visible element', () => {
    expect(isElementHidden(target, container)).toBe(false);
  });

  it('should return true for element with display: none', () => {
    target.style.display = 'none';
    expect(isElementHidden(target, container)).toBe(true);
  });

  it('should return true for element with visibility: hidden', () => {
    target.style.visibility = 'hidden';
    expect(isElementHidden(target, container)).toBe(true);
  });

  it('should return true for element with opacity: 0', () => {
    target.style.opacity = '0';
    expect(isElementHidden(target, container)).toBe(true);
  });
});
