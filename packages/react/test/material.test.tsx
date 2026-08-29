import type {
  GlassContext,
  GlassEngine,
  MaterialHandle,
  MaterialPresentationListener,
  MaterialPresentationState,
  ProxyTargetInterface,
} from '@agou/liquid-glass-core';
import { InteractionEngine } from '@agou/liquid-glass-core';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LiquidGlass } from '../src/LiquidGlass';
import { LiquidGlassMaterial } from '../src/LiquidGlassMaterial';

function createPresentation(
  overrides: Partial<MaterialPresentationState> = {},
): MaterialPresentationState {
  const interaction = new InteractionEngine('button');
  return {
    blurred: false,
    fallbackMode: false,
    interactionConfig: interaction.getConfig(),
    interactionOutput: interaction.getOutput(),
    themeColorMode: 'light',
    ...overrides,
  };
}

function createHarness(initialPresentation = createPresentation()) {
  let destroyed = false;
  let presentation = initialPresentation;
  let listener: MaterialPresentationListener | null = null;
  const unsubscribe = vi.fn(() => {
    listener = null;
  });
  const setInteractionState = vi.fn<MaterialHandle['setInteractionState']>();
  const material: MaterialHandle = {
    id: 'material-1',
    get destroyed() {
      return destroyed;
    },
    destroy: vi.fn(() => {
      destroyed = true;
    }),
    getPresentation: vi.fn(() => presentation),
    onPresentation: vi.fn((nextListener) => {
      listener = nextListener;
      nextListener(presentation);
      return unsubscribe;
    }),
    refreshLayout: vi.fn(),
    setInteractionState,
    startLayoutUpdates: vi.fn(),
    stopLayoutUpdates: vi.fn(),
    update: vi.fn(),
  };
  const context = {
    addMaterial: vi.fn(() => material),
    canvas: document.createElement('canvas'),
    createProxyInterface: vi.fn(),
    destroy: vi.fn(),
    destroyed: false,
    off: vi.fn(),
    on: vi.fn(() => vi.fn()),
    refresh: vi.fn(),
    setFallbackMode: vi.fn(),
    setViewportMode: vi.fn(),
    updateOptions: vi.fn(),
  } as unknown as GlassContext;
  const engine = {
    createContext: vi.fn(() => context),
    destroy: vi.fn(),
    destroyed: false,
  } as unknown as GlassEngine;
  return {
    context,
    emitPresentation(nextPresentation: MaterialPresentationState): void {
      presentation = nextPresentation;
      const activeListener = listener;
      activeListener?.(nextPresentation);
    },
    engine,
    material,
    setInteractionState,
    unsubscribe,
  };
}

function dispatchPointer(
  element: HTMLElement,
  type: string,
  overrides: Partial<PointerEvent> = {},
): void {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  }) as PointerEvent;
  const values: Partial<PointerEvent> = {
    clientX: 60,
    clientY: 45,
    pointerId: 1,
    pointerType: 'mouse',
    pressure: 0.5,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  element.dispatchEvent(event);
}

function materialRect(): DOMRect {
  return {
    bottom: 70,
    height: 50,
    left: 10,
    right: 110,
    top: 20,
    width: 100,
    x: 10,
    y: 20,
    toJSON: () => ({ height: 50, width: 100, x: 10, y: 20 }),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('React material presentation', () => {
  it('updates moveable behavior without replacing the material registration', async () => {
    const harness = createHarness();
    const view = (isMoveable: boolean) => (
      <LiquidGlass engine={harness.engine}>
        <LiquidGlassMaterial isMoveable={isMoveable}>Glass content</LiquidGlassMaterial>
      </LiquidGlass>
    );
    const mounted = render(view(true));
    await waitFor(() => {
      expect(harness.context.addMaterial).toHaveBeenCalledWith(expect.objectContaining({
        isMoveable: true,
      }));
    });

    mounted.rerender(view(false));
    await waitFor(() => {
      expect(harness.material.update).toHaveBeenLastCalledWith(expect.objectContaining({
        isMoveable: false,
      }));
    });

    expect(harness.context.addMaterial).toHaveBeenCalledTimes(1);
    expect(harness.material.destroy).not.toHaveBeenCalled();
  });

  it('preserves proxy target identity across rerenders and clears it in place', async () => {
    const firstTarget: ProxyTargetInterface = {
      getContainerRect: () => null,
      getScrollPosition: () => ({ x: 0, y: 0 }),
      registerExternalMaterial: () => {
        throw new Error('The adapter harness must not register proxy materials.');
      },
    };
    const secondTarget: ProxyTargetInterface = {
      ...firstTarget,
      getScrollPosition: () => ({ x: 4, y: 8 }),
    };
    const harness = createHarness();
    const view = (proxyTarget?: ProxyTargetInterface) => (
      <LiquidGlass engine={harness.engine}>
        <LiquidGlassMaterial proxyTarget={proxyTarget}>
          Glass content
        </LiquidGlassMaterial>
      </LiquidGlass>
    );
    const mounted = render(view(firstTarget));
    await waitFor(() => {
      expect(harness.context.addMaterial).toHaveBeenCalledWith(
        expect.objectContaining({ proxyTarget: firstTarget }),
      );
    });

    mounted.rerender(view(secondTarget));
    await waitFor(() => {
      expect(harness.material.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ proxyTarget: secondTarget }),
      );
    });

    mounted.rerender(view());
    await waitFor(() => {
      expect(harness.material.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ proxyTarget: undefined }),
      );
    });
    expect(harness.context.addMaterial).toHaveBeenCalledTimes(1);
  });

  it('forwards native pointer input without replacing consumer handlers', async () => {
    const harness = createHarness();
    const onPointerDown = vi.fn();
    const view = (disableInteractions = false, onlyClickInteractions = false) => (
      <LiquidGlass engine={harness.engine}>
        <LiquidGlassMaterial
          disableInteractions={disableInteractions}
          onlyClickInteractions={onlyClickInteractions}
          onPointerDown={onPointerDown}
          renderMode="dedicated"
        >
          Glass content
        </LiquidGlassMaterial>
      </LiquidGlass>
    );
    const mounted = render(view());
    await waitFor(() => {
      expect(harness.material.onPresentation).toHaveBeenCalledTimes(1);
    });
    const material = mounted.container.querySelector<HTMLElement>('.liquid-glass-material');
    expect(material).not.toBeNull();
    vi.spyOn(material as HTMLElement, 'getBoundingClientRect').mockReturnValue(materialRect());

    dispatchPointer(material as HTMLElement, 'pointerdown');
    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(harness.setInteractionState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pointerState: expect.objectContaining({
          isActive: true,
          isHovering: true,
          normalizedX: 0.5,
          normalizedY: 0.5,
          pointerId: 1,
        }),
      }),
    );
    expect(material?.getAttribute('disable-interactions')).toBe('false');
    expect(material?.getAttribute('only-click-interactions')).toBe('false');
    expect(material?.getAttribute('render-mode')).toBe('dedicated');

    mounted.rerender(view(true));
    await waitFor(() => {
      expect(material?.getAttribute('disable-interactions')).toBe('true');
    });
    harness.setInteractionState.mockClear();
    dispatchPointer(material as HTMLElement, 'pointerdown', { pointerId: 2 });
    expect(onPointerDown).toHaveBeenCalledTimes(2);
    expect(harness.setInteractionState).not.toHaveBeenCalled();

    mounted.rerender(view(false, true));
    await waitFor(() => {
      expect(material?.getAttribute('only-click-interactions')).toBe('true');
    });
    dispatchPointer(material as HTMLElement, 'pointerenter', { pointerId: 3 });
    expect(harness.setInteractionState).not.toHaveBeenCalled();
    dispatchPointer(material as HTMLElement, 'pointerdown', { pointerId: 3 });
    expect(harness.setInteractionState).toHaveBeenCalledTimes(1);
    expect(harness.context.addMaterial).toHaveBeenCalledTimes(1);
  });

  it('applies presentation tokens and updates static appearance in place', async () => {
    const harness = createHarness();
    const view = (backgroundColor: string, thickness: number) => (
      <LiquidGlass engine={harness.engine}>
        <LiquidGlassMaterial
          backgroundColor={backgroundColor}
          blur={12}
          illuminationAngle={90}
          illuminationIntensity={0.8}
          radius={18}
          thickness={thickness}
          useCustomColor
        >
          Glass content
        </LiquidGlassMaterial>
      </LiquidGlass>
    );
    const mounted = render(view('#123456', 14));
    await waitFor(() => {
      expect(harness.material.onPresentation).toHaveBeenCalledTimes(1);
    });
    const material = mounted.container.querySelector<HTMLElement>('.liquid-glass-material');
    const highlight = mounted.container.querySelector<HTMLElement>('.liquid-glass-highlight');
    expect(material?.style.getPropertyValue('--lg-border-radius')).toBe(
      '18px 18px 18px 18px',
    );
    expect(material?.style.getPropertyValue('--lg-fallback-blur')).toBe('6px');
    expect(material?.style.getPropertyValue('--lg-background-tint')).toBe('#123456');
    expect(material?.style.getPropertyValue('--lg-inset-shadow-size')).toBe('14px');
    expect(material?.style.getPropertyValue('--lg-illumination-angle')).toBe('90deg');

    const active = createPresentation({
      blurred: true,
      interactionOutput: {
        ...createPresentation().interactionOutput,
        highlightVisible: true,
        highlightX: 0.2,
        opacity: 0.8,
        scaleX: 1.1,
        translateX: 12,
      },
    });
    harness.emitPresentation(active);
    expect(material?.style.getPropertyValue('--lg-scale-x')).toBe('1.1');
    expect(material?.style.getPropertyValue('--lg-translate-x')).toBe('12px');
    expect(material?.style.getPropertyValue('--lg-material-opacity')).toBe('0.8');
    expect(material?.style.getPropertyValue('--lg-highlight-left')).toBe('20%');
    expect(material?.getAttribute('is-blurred')).toBe('true');
    expect(highlight?.classList.contains('visible')).toBe(true);

    harness.emitPresentation({ ...active, fallbackMode: true });
    expect(material?.style.getPropertyValue('--lg-highlight-opacity')).toBe('0');
    expect(highlight?.classList.contains('visible')).toBe(false);

    mounted.rerender(view('#abcdef', 2));
    await waitFor(() => {
      expect(material?.style.getPropertyValue('--lg-background-tint')).toBe('#abcdef');
    });
    expect(material?.style.getPropertyValue('--lg-inset-shadow-color')).toBe('#abcdef33');
    expect(material?.style.getPropertyValue('--lg-inset-shadow-size')).toBe('5px');
    expect(harness.context.addMaterial).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes presentation and removes native pointer bindings on cleanup', async () => {
    const harness = createHarness(createPresentation({ blurred: true }));
    const mounted = render(
      <LiquidGlass engine={harness.engine}>
        <LiquidGlassMaterial>Glass content</LiquidGlassMaterial>
      </LiquidGlass>,
    );
    await waitFor(() => {
      expect(harness.material.onPresentation).toHaveBeenCalledTimes(1);
    });
    const material = mounted.container.querySelector<HTMLElement>('.liquid-glass-material');
    const highlight = mounted.container.querySelector<HTMLElement>('.liquid-glass-highlight');
    expect(material?.getAttribute('is-blurred')).toBe('true');
    const pointerCalls = harness.setInteractionState.mock.calls.length;

    mounted.unmount();

    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.material.destroy).toHaveBeenCalledTimes(1);
    expect(material?.hasAttribute('is-blurred')).toBe(false);
    expect(material?.hasAttribute('allowing-color-transition')).toBe(false);
    expect(highlight?.classList.contains('visible')).toBe(false);
    dispatchPointer(material as HTMLElement, 'pointerdown');
    expect(harness.setInteractionState).toHaveBeenCalledTimes(pointerCalls);
  });

  it('does not re-render function children for continuous presentation updates', async () => {
    const harness = createHarness();
    const renderChild = vi.fn(() => <span>Glass content</span>);
    const mounted = render(
      <LiquidGlass engine={harness.engine}>
        <LiquidGlassMaterial>{renderChild}</LiquidGlassMaterial>
      </LiquidGlass>,
    );
    await waitFor(() => {
      expect(harness.material.onPresentation).toHaveBeenCalledTimes(1);
    });
    const renderCount = renderChild.mock.calls.length;
    for (let index = 0; index < 20; index += 1) {
      harness.emitPresentation(createPresentation({
        interactionOutput: {
          ...createPresentation().interactionOutput,
          translateX: index,
        },
      }));
    }

    expect(renderChild).toHaveBeenCalledTimes(renderCount);
    expect(
      mounted.container.querySelector<HTMLElement>('.liquid-glass-material')
        ?.style.getPropertyValue('--lg-translate-x'),
    ).toBe('19px');
  });
});
