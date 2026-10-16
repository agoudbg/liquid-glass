import { afterEach, describe, expect, it } from 'vitest';

import {
  createDefaultLabState,
  isLabEdgeStyle,
  updateLabEdgeStyle,
} from '../src/shared/lab-state';
import { resolveSceneMaterials } from '../src/shared/scene-materials';
import { bindLabControls } from '../src/shell/lab-controller';
import { PLAYGROUND_MARKUP } from '../src/shell/markup';
import {
  createInitialState,
  replacePlaygroundUrl,
  transitionPlaygroundScene,
  transitionPlaygroundState,
} from '../src/shell/state';
import { PlaygroundShellView } from '../src/shell/view';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

describe('Lab edge appearance', () => {
  it('preserves the original appearance for old URLs and validates edge styles', () => {
    const state = createInitialState(new URL('https://example.test/?scene=S001'));
    expect(state.lab.appearance.edgeStyle).toBe('illuminated');
    expect(resolveSceneMaterials(state)[0]?.options.edgeStyle).toBe('illuminated');
    expect(createInitialState(new URL(
      'https://example.test/?edgeStyle=unsupported',
    )).lab.appearance.edgeStyle).toBe('illuminated');
    expect(isLabEdgeStyle('dark')).toBe(true);
    expect(isLabEdgeStyle('illuminated')).toBe(true);
    expect(isLabEdgeStyle('unsupported')).toBe(false);
  });

  it('keeps the selected edge across URLs, framework changes, and scene changes', () => {
    const original = createDefaultLabState();
    const lab = updateLabEdgeStyle(original, 'dark');
    expect(original.appearance.edgeStyle).toBe('illuminated');
    expect(lab.appearance.edgeStyle).toBe('dark');

    const state = createInitialState(new URL(
      'https://example.test/?scene=S001&edgeStyle=dark&lightAngle=145',
    ));
    replacePlaygroundUrl(state);
    const copiedUrl = new URL(window.location.href);
    expect(copiedUrl.searchParams.get('edgeStyle')).toBe('dark');
    expect(createInitialState(copiedUrl).lab).toEqual(state.lab);

    for (const framework of ['vue', 'react', 'solid'] as const) {
      const switched = transitionPlaygroundState(state, { framework });
      expect(resolveSceneMaterials(switched)[0]?.options.edgeStyle).toBe('dark');
      const returned = transitionPlaygroundScene(
        transitionPlaygroundScene(switched, 'S004'),
        'S001',
      );
      expect(returned.lab.appearance.edgeStyle).toBe('dark');
      expect(returned.lab.appearance.illuminationAngle).toBe(145);
    }
  });

  it('switches the edge and disables only the directional angle until reset', () => {
    const root = document.createElement('div');
    root.innerHTML = PLAYGROUND_MARKUP;
    document.body.append(root);
    const view = new PlaygroundShellView(root);
    let state = createInitialState(new URL('https://example.test/?scene=S001'));
    const render = (): void => view.renderState(state, false);
    const dispose = bindLabControls({
      root,
      getState: () => state,
      updateLab: (lab) => {
        state = transitionPlaygroundState(state, { lab });
        render();
      },
      refreshBackdrop: () => undefined,
      setCopyStatus: (message, status) => view.setCopyStatus(message, status),
    });
    render();

    try {
      const select = requireElement<HTMLSelectElement>(root, '[data-lab-edge-style]');
      const angle = requireElement<HTMLInputElement>(
        root,
        '[data-lab-number="illuminationAngle"]',
      );
      const intensity = requireElement<HTMLInputElement>(
        root,
        '[data-lab-number="illuminationIntensity"]',
      );
      expect(select.value).toBe('illuminated');
      expect(angle.disabled).toBe(false);
      select.value = 'dark';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(state.lab.appearance.edgeStyle).toBe('dark');
      expect(angle.disabled).toBe(true);
      expect(intensity.disabled).toBe(false);

      select.value = 'illuminated';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      expect(angle.disabled).toBe(false);
      select.value = 'dark';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      requireElement<HTMLButtonElement>(root, '[data-action="reset-lab"]').click();
      expect(state.lab.appearance.edgeStyle).toBe('illuminated');
      expect(select.value).toBe('illuminated');
      expect(angle.disabled).toBe(false);
    } finally {
      dispose();
    }
  });
});

function requireElement<ElementType extends Element>(
  root: HTMLElement,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Missing edge-style test element: ${selector}`);
  return element;
}
