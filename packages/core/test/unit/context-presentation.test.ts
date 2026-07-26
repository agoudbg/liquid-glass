import { describe, expect, it } from 'vitest';

import { ContextPresentation } from '../../src/engine/context-presentation';
import { FakeCanvas } from '../fixtures/fake-webgl2';

class ScrollContainer {
  readonly classList = {
    contains: (name: string): boolean => this.classes.has(name),
    toggle: (name: string, enabled: boolean): void => {
      if (enabled) {
        this.classes.add(name);
      } else {
        this.classes.delete(name);
      }
    },
  };
  scrollLeft = 0;
  scrollTop = 0;
  private readonly attributes = new Map<string, string>();
  private readonly classes = new Set<string>();

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
  it('uses full-content placement until viewport mode is enabled', () => {
    const container = new ScrollContainer();
    const content = new ScrollContainer();
    const canvas = new FakeCanvas();
    const presentation = new ContextPresentation(
      container as unknown as HTMLElement,
      content as unknown as HTMLElement,
      canvas as unknown as HTMLCanvasElement,
      { scrollable: true },
    );

    content.scrollLeft = 42;
    content.scrollTop = 75;
    presentation.syncScrollPosition();
    expect(canvas.style.transform).toBe('');
    presentation.syncCanvasSize(640, 1_200);
    expect(canvas.style.width).toBe('640px');
    expect(canvas.style.height).toBe('1200px');

    presentation.setViewportMode(true);
    expect(canvas.style.transform).toBe('translate3d(42px, 75px, 0)');
    expect(canvas.className).toBe('liquid-glass-canvas viewport-mode');

    presentation.update({ scrollable: false });
    expect(canvas.style.transform).toBe('');
    presentation.destroy();
    expect(container.getAttribute('data-lg-scrollable')).toBeNull();
    expect(content.getAttribute('data-lg-scrollable')).toBeNull();
    expect(content.classList.contains('scrollable')).toBe(false);
  });

  it('hides the WebGL canvas in fallback mode and restores consumer markers', () => {
    const container = new ScrollContainer();
    container.setAttribute('data-lg-fallback', 'consumer');
    const canvas = new FakeCanvas();
    const presentation = new ContextPresentation(
      container as unknown as HTMLElement,
      container as unknown as HTMLElement,
      canvas as unknown as HTMLCanvasElement,
      {},
    );

    expect(container.getAttribute('data-lg-fallback')).toBe('false');
    presentation.setFallbackMode(true);
    expect(container.getAttribute('data-lg-fallback')).toBe('true');
    expect(canvas.style.visibility).toBe('hidden');
    expect(canvas.style.opacity).toBe('0');

    presentation.setFallbackMode(false);
    expect(canvas.style.visibility).toBe('visible');
    expect(canvas.style.opacity).toBe('1');
    presentation.destroy();
    expect(container.getAttribute('data-lg-fallback')).toBe('consumer');
  });
});
