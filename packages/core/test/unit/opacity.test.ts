import { describe, expect, it } from 'vitest';

import {
  computeCumulativeOpacity,
  computeElementVisibility,
  isElementHidden,
  type VisibilityStyle,
  type VisibilityStyleReader,
} from '../../src/utils/opacity';

interface FakeElement {
  parentElement: HTMLElement | null;
  style: VisibilityStyle;
}

function createElement(
  style: Partial<VisibilityStyle> = {},
  parentElement: HTMLElement | null = null,
): HTMLElement {
  return {
    parentElement,
    style: {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      ...style,
    },
  } as unknown as HTMLElement;
}

const readStyle: VisibilityStyleReader = (element) => (
  element as unknown as FakeElement
).style;

describe('opacity utilities', () => {
  it('multiplies ancestor opacity and excludes the boundary itself', () => {
    const boundary = createElement({ opacity: '0.1' });
    const parent = createElement({ opacity: '0.5' }, boundary);
    const material = createElement({ opacity: '0.8' }, parent);

    expect(computeElementVisibility(material, boundary, readStyle)).toEqual({
      state: 'visible',
      opacity: 0.4,
    });
    expect(computeCumulativeOpacity(material, boundary, readStyle)).toBe(0.4);
  });

  it.each([
    { display: 'none' },
    { visibility: 'hidden' },
    { opacity: '0' },
  ])('short-circuits hidden state for %o', (style) => {
    const material = createElement(style);
    expect(isElementHidden(material, null, readStyle)).toBe(true);
    expect(computeElementVisibility(material, null, readStyle).opacity).toBe(0);
  });

  it('treats an invalid computed opacity as the browser default', () => {
    const material = createElement({ opacity: '' });
    expect(computeElementVisibility(material, null, readStyle)).toEqual({
      state: 'visible',
      opacity: 1,
    });
  });

  it('clamps cumulative opacity to the renderer range', () => {
    const parent = createElement({ opacity: '2' });
    const material = createElement({ opacity: '2' }, parent);
    expect(computeCumulativeOpacity(material, null, readStyle)).toBe(1);
  });
});
