import { describe, expect, it, vi } from 'vitest';

import {
  MaterialDomPresentationController,
} from '../../src/appearance';
import { InteractionEngine } from '../../src/interaction';
import type {
  MaterialHandle,
  MaterialPresentationListener,
  MaterialPresentationState,
} from '../../src/types';

function presentation(
  overrides: Partial<MaterialPresentationState> = {},
): MaterialPresentationState {
  const engine = new InteractionEngine('button');
  return {
    blurred: false,
    fallbackMode: false,
    interactionConfig: engine.getConfig(),
    interactionOutput: engine.getOutput(),
    themeColorMode: 'light',
    ...overrides,
  };
}

function harness(initial = presentation()) {
  const properties = new Map<string, string>();
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  let listener: MaterialPresentationListener | null = null;
  const unsubscribe = vi.fn();
  const element = {
    removeAttribute: (name: string) => attributes.delete(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
    },
  } as unknown as HTMLElement;
  const highlight = {
    classList: {
      remove: (name: string) => classes.delete(name),
      toggle: (name: string, force?: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
        return force ?? false;
      },
    },
  } as unknown as HTMLElement;
  const handle = {
    id: 'material-1',
    destroyed: false,
    destroy: vi.fn(),
    getPresentation: vi.fn(() => initial),
    onPresentation: vi.fn<MaterialHandle['onPresentation']>((nextListener) => {
      listener = nextListener;
      nextListener(initial);
      return unsubscribe;
    }),
    refreshLayout: vi.fn(),
    setInteractionState: vi.fn(),
    update: vi.fn(),
  } satisfies MaterialHandle;
  const emit = (next: MaterialPresentationState): void => {
    const activeListener: MaterialPresentationListener | null = listener;
    activeListener?.(next);
  };
  return {
    attributes,
    classes,
    element,
    emit,
    handle,
    highlight,
    properties,
    unsubscribe,
  };
}

describe('MaterialDomPresentationController', () => {
  it('applies the complete default token and state-marker contract', () => {
    const target = harness();
    const controller = new MaterialDomPresentationController(
      target.element,
      target.highlight,
      target.handle,
      { illuminationAngle: 90, illuminationIntensity: 0.8, thickness: 14 },
    );

    expect(target.properties.get('--lg-background-tint')).toBe('#ffffff99');
    expect(target.properties.get('--lg-inset-shadow-size')).toBe('14px');
    expect(target.properties.get('--lg-illumination-angle')).toBe('90deg');
    expect(target.properties.get('--lg-scale-x')).toBe('1');
    expect(target.properties.get('--lg-highlight-opacity')).toBe('0');
    expect(target.attributes.get('is-blurred')).toBe('false');
    expect(target.attributes.has('allowing-color-transition')).toBe(false);
    expect(target.classes.has('visible')).toBe(false);
    controller.destroy();
  });

  it('applies interaction output, highlight gating, fallback, and blur', () => {
    const target = harness();
    const controller = new MaterialDomPresentationController(
      target.element,
      target.highlight,
      target.handle,
    );
    const active = presentation({
      interactionOutput: {
        ...presentation().interactionOutput,
        backgroundColor: 'transparent',
        highlightVisible: true,
        highlightX: 0.2,
        highlightY: 0.7,
        opacity: 0.8,
        scaleX: 1.1,
        translateX: 12,
      },
    });
    target.emit(active);

    expect(target.properties.get('--lg-effective-background-tint')).toBe('transparent');
    expect(target.properties.get('--lg-scale-x')).toBe('1.1');
    expect(target.properties.get('--lg-translate-x')).toBe('12px');
    expect(target.properties.get('--lg-material-opacity')).toBe('0.8');
    expect(target.properties.get('--lg-highlight-left')).toBe('20%');
    expect(target.classes.has('visible')).toBe(true);

    target.emit({ ...active, blurred: true, fallbackMode: true });
    expect(target.properties.get('--lg-highlight-opacity')).toBe('0');
    expect(target.attributes.get('is-blurred')).toBe('true');
    expect(target.attributes.has('allowing-color-transition')).toBe(false);
    expect(target.classes.has('visible')).toBe(false);
    controller.destroy();
  });

  it('enables tint transitions only after two post-initial color changes', () => {
    const target = harness();
    const controller = new MaterialDomPresentationController(
      target.element,
      target.highlight,
      target.handle,
    );

    target.emit(presentation({ themeColorMode: 'dark' }));
    expect(target.attributes.get('allowing-color-transition')).toBe('false');
    target.emit(presentation({ themeColorMode: 'ultra_dark' }));
    expect(target.attributes.get('allowing-color-transition')).toBe('true');

    target.emit(presentation({ fallbackMode: true, themeColorMode: 'light' }));
    expect(target.attributes.get('allowing-color-transition')).toBe('false');
    controller.destroy();
  });

  it('updates static appearance and unsubscribes transient DOM state', () => {
    const target = harness(presentation({ blurred: true }));
    const controller = new MaterialDomPresentationController(
      target.element,
      target.highlight,
      target.handle,
    );
    controller.updateAppearance({
      backgroundColor: '#123456',
      illuminationIntensity: 0.2,
      thickness: 2,
      useCustomColor: true,
    });

    expect(target.properties.get('--lg-background-tint')).toBe('#123456');
    expect(target.properties.get('--lg-inset-shadow-color')).toBe('#12345633');
    expect(target.properties.get('--lg-inset-shadow-size')).toBe('5px');
    controller.destroy();
    expect(target.unsubscribe).toHaveBeenCalledTimes(1);
    expect(target.attributes.has('is-blurred')).toBe(false);
    expect(target.attributes.has('allowing-color-transition')).toBe(false);
    expect(target.classes.has('visible')).toBe(false);
  });
});
