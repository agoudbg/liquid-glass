import { describe, expect, it } from 'vitest';

import { ContextPresentation } from '../../src/engine/context-presentation';
import { FakeCanvas } from '../fixtures/fake-webgl2';

class ScrollContainer {
  scrollLeft = 0;
  scrollTop = 0;
  private readonly attributes = new Map<string, string>();

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('ContextPresentation', () => {
  it('counter-translates a uniform canvas inside a scrolling container', () => {
    const container = new ScrollContainer();
    const canvas = new FakeCanvas();
    const presentation = new ContextPresentation(
      container as unknown as HTMLElement,
      canvas as unknown as HTMLCanvasElement,
      { scrollable: true },
    );

    container.scrollLeft = 42;
    container.scrollTop = 75;
    presentation.syncScrollPosition(true);
    expect(canvas.style.transform).toBe('translate3d(42px, 75px, 0)');

    presentation.update({ scrollable: false });
    expect(canvas.style.transform).toBe('');
    presentation.destroy();
    expect(container.getAttribute('data-lg-scrollable')).toBeNull();
  });
});
