import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  CustomDrawCallback,
  GlassContext,
  GlassContextOptions,
  GlassEngine,
  MaterialHandle,
  MaterialPresentationListener,
  MaterialPresentationState,
} from '@agou/liquid-glass-core';
import { InteractionEngine } from '@agou/liquid-glass-core';
import type { JSX } from 'solid-js';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackdropCanvas } from '../src/BackdropCanvas';
import { LiquidGlass } from '../src/LiquidGlass';
import { LiquidGlassMaterial } from '../src/LiquidGlassMaterial';
import type {
  LiquidGlassHandle,
  LiquidGlassMaterialHandle,
} from '../src/types';

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

function createMaterialHarness(
  id = 'material-1',
  initialPresentation = createPresentation(),
) {
  let destroyed = false;
  let presentation = initialPresentation;
  const listeners = new Set<MaterialPresentationListener>();
  const destroy = vi.fn<MaterialHandle['destroy']>(() => {
    destroyed = true;
  });
  const unsubscribe = vi.fn();
  const setInteractionState = vi.fn<MaterialHandle['setInteractionState']>();
  const handle: MaterialHandle = {
    id,
    get destroyed() {
      return destroyed;
    },
    destroy,
    getPresentation: vi.fn<MaterialHandle['getPresentation']>(() => presentation),
    onPresentation: vi.fn<MaterialHandle['onPresentation']>((listener) => {
      listeners.add(listener);
      listener(presentation);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
        unsubscribe();
      };
    }),
    refreshLayout: vi.fn<MaterialHandle['refreshLayout']>(),
    setInteractionState,
    update: vi.fn<MaterialHandle['update']>(),
  };
  const emitPresentation = (next: MaterialPresentationState): void => {
    presentation = next;
    for (const listener of [...listeners]) listener(next);
  };
  return {
    destroy,
    emitPresentation,
    handle,
    listenerCount: () => listeners.size,
    setInteractionState,
    unsubscribe,
  };
}

function createBackdropHarness(id = 'backdrop-1') {
  let destroyed = false;
  const destroy = vi.fn<BackdropSourceHandle<CanvasBackdropSourceConfig>['destroy']>(() => {
    destroyed = true;
  });
  const refresh = vi.fn<BackdropSourceHandle<CanvasBackdropSourceConfig>['refresh']>();
  const update = vi.fn<BackdropSourceHandle<CanvasBackdropSourceConfig>['update']>();
  const handle: BackdropSourceHandle<CanvasBackdropSourceConfig> = {
    id,
    get destroyed() {
      return destroyed;
    },
    destroy,
    refresh,
    update,
  };
  return { destroy, handle, refresh, update };
}

function createContextHarness(initialPresentation?: MaterialPresentationState) {
  const material = createMaterialHarness('material-1', initialPresentation);
  const backdrop = createBackdropHarness();
  const addMaterial = vi.fn((_config: Parameters<GlassContext['addMaterial']>[0]) => material.handle);
  const addBackdropSource = vi.fn((_config: CanvasBackdropSourceConfig) => backdrop.handle);
  const destroy = vi.fn<GlassContext['destroy']>();
  const updateOptions = vi.fn<(options: GlassContextOptions) => void>();
  const context = {
    addBackdropSource,
    addMaterial,
    canvas: document.createElement('canvas'),
    createProxyInterface: vi.fn(),
    destroy,
    destroyed: false,
    off: vi.fn(),
    on: vi.fn(() => vi.fn()),
    refresh: vi.fn(),
    setFallbackMode: vi.fn(),
    setViewportMode: vi.fn(),
    updateOptions,
  } as unknown as GlassContext;
  return {
    addBackdropSource,
    addMaterial,
    backdrop,
    context,
    destroy,
    material,
    updateOptions,
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

function createEngineHarness(context: GlassContext) {
  const createContext = vi.fn((
    _container: HTMLElement,
    _options?: GlassContextOptions,
  ) => context);
  const destroy = vi.fn<GlassEngine['destroy']>();
  const engine = {
    createContext,
    destroy,
    destroyed: false,
  } as unknown as GlassEngine;
  return { createContext, destroy, engine };
}

const disposers: Array<() => void> = [];

function mountSolid(view: () => JSX.Element): () => void {
  const host = document.createElement('div');
  document.body.append(host);
  let disposed = false;
  const disposeRoot = render(view, host);
  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    disposeRoot();
    host.remove();
  };
  disposers.push(dispose);
  return dispose;
}

afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()?.();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Solid adapter lifecycle', () => {
  it('renders a direct scrollable content layer for core ownership', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    mountSolid(() => (
      <LiquidGlass
        engine={engineHarness.engine}
        options={{ scrollable: true }}
      >
        <span data-testid="content">Content</span>
      </LiquidGlass>
    ));
    await Promise.resolve();

    const container = document.querySelector('.liquid-glass-container');
    const content = container?.querySelector(
      ':scope > .liquid-glass-content.scrollable',
    );
    expect(content).not.toBeNull();
    expect(content?.querySelector('[data-testid="content"]')).not.toBeNull();
    expect(engineHarness.createContext.mock.calls[0]?.[0]).toBe(container);
  });

  it('preserves fallback blur defaults and explicit zero values', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    mountSolid(() => (
      <LiquidGlass engine={engineHarness.engine}>
        <LiquidGlassMaterial>Default blur</LiquidGlassMaterial>
        <LiquidGlassMaterial blur={0}>No blur</LiquidGlassMaterial>
        <LiquidGlassMaterial blur={12}>Capped blur</LiquidGlassMaterial>
      </LiquidGlass>
    ));
    await Promise.resolve();

    const materials = Array.from(
      document.querySelectorAll<HTMLElement>('.liquid-glass-material'),
    );
    expect(materials.map((material) => (
      material.style.getPropertyValue('--lg-fallback-blur')
    ))).toEqual(['6px', '0px', '6px']);
    expect(materials[0]?.querySelector(
      ':scope > .liquid-glass-content',
    )).toBeNull();
    expect(materials[0]?.textContent).toContain('Default blur');

    expect(contextHarness.addMaterial.mock.calls.map(([config]) => config.blur)).toEqual([
      undefined,
      0,
      12,
    ]);
    expect(contextHarness.material.handle.update).toHaveBeenCalledWith(
      expect.objectContaining({ blur: undefined }),
    );
    expect(contextHarness.material.handle.update).toHaveBeenCalledWith(
      expect.objectContaining({ blur: 0 }),
    );
  });

  it('updates options without replacing the context or material registration', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const materialApis: Array<LiquidGlassMaterialHandle | null> = [];
    let setOptions: ((options: GlassContextOptions) => void) | undefined;
    const dispose = mountSolid(() => {
      const [options, updateOptions] = createSignal<GlassContextOptions>({ renderPrecision: 1 });
      setOptions = (nextOptions) => updateOptions(nextOptions);
      return (
        <LiquidGlass engine={engineHarness.engine} options={options()}>
          <LiquidGlassMaterial
            apiRef={(handle) => materialApis.push(handle)}
            radius={20}
          >
            Glass content
          </LiquidGlassMaterial>
        </LiquidGlass>
      );
    });
    await Promise.resolve();

    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
    const materialApi = materialApis.find(
      (handle): handle is LiquidGlassMaterialHandle => handle !== null,
    );
    const initialRegistration = materialApi?.getHandle();
    expect(initialRegistration?.id).toBe('material-1');
    const initialOptionUpdates = contextHarness.updateOptions.mock.calls.length;
    if (!setOptions) {
      throw new Error('The Solid options setter was not initialized.');
    }

    setOptions({ renderPrecision: 0.5 });
    await Promise.resolve();

    expect(contextHarness.updateOptions).toHaveBeenCalledTimes(initialOptionUpdates + 1);
    expect(contextHarness.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ renderPrecision: 0.5 }),
    );
    expect(engineHarness.createContext).toHaveBeenCalledTimes(1);
    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
    expect(materialApi?.getHandle()).toBe(initialRegistration);
    expect(contextHarness.material.destroy).not.toHaveBeenCalled();

    dispose();

    expect(contextHarness.material.destroy).toHaveBeenCalledTimes(1);
    expect(contextHarness.destroy).toHaveBeenCalledTimes(1);
    expect(engineHarness.destroy).not.toHaveBeenCalled();
  });

  it('clears container and material apiRef callbacks during disposal', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const containerApis: Array<LiquidGlassHandle | null> = [];
    const materialApis: Array<LiquidGlassMaterialHandle | null> = [];
    const dispose = mountSolid(() => (
      <LiquidGlass
        apiRef={(handle) => containerApis.push(handle)}
        engine={engineHarness.engine}
      >
        <LiquidGlassMaterial apiRef={(handle) => materialApis.push(handle)} />
      </LiquidGlass>
    ));
    await Promise.resolve();

    expect(containerApis.some((handle) => handle !== null)).toBe(true);
    expect(materialApis.some((handle) => handle !== null)).toBe(true);

    dispose();

    expect(containerApis[containerApis.length - 1]).toBeNull();
    expect(materialApis[materialApis.length - 1]).toBeNull();
  });

  it('propagates onReady exceptions without reporting a context creation error', () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const failure = new Error('consumer onReady failure');
    const onError = vi.fn<(error: unknown) => void>();
    let thrown: unknown;

    try {
      mountSolid(() => (
        <LiquidGlass
          engine={engineHarness.engine}
          onError={onError}
          onReady={() => {
            throw failure;
          }}
        />
      ));
    } catch (error: unknown) {
      thrown = error;
    }

    expect(onError).not.toHaveBeenCalled();
    expect(thrown).toBe(failure);
  });

  it('updates a backdrop draw callback without an additional explicit refresh', async () => {
    const drawingContext = {
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawingContext);
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const firstDraw = vi.fn<CustomDrawCallback>();
    const nextDraw = vi.fn<CustomDrawCallback>();
    let setDraw: ((draw: CustomDrawCallback) => void) | undefined;
    mountSolid(() => {
      const [draw, updateDraw] = createSignal<CustomDrawCallback>(firstDraw);
      setDraw = (next) => updateDraw(() => next);
      return (
        <LiquidGlass engine={engineHarness.engine}>
          <BackdropCanvas draw={draw()} zIndex={3} />
        </LiquidGlass>
      );
    });
    await Promise.resolve();

    expect(contextHarness.addBackdropSource).toHaveBeenCalledTimes(1);
    contextHarness.backdrop.update.mockClear();
    contextHarness.backdrop.refresh.mockClear();
    if (!setDraw) {
      throw new Error('The Solid draw setter was not initialized.');
    }

    setDraw(nextDraw);
    await Promise.resolve();

    expect(contextHarness.backdrop.update).toHaveBeenCalledTimes(1);
    expect(contextHarness.backdrop.update).toHaveBeenLastCalledWith({
      draw: nextDraw,
      zIndex: 3,
    });
    expect(contextHarness.backdrop.refresh).not.toHaveBeenCalled();
  });

  it('forwards native pointers without replacing consumer handlers and syncs policy', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const consumerPointerDown = vi.fn();
    let setDisabled: ((disabled: boolean) => void) | undefined;
    mountSolid(() => {
      const [disabled, updateDisabled] = createSignal(false);
      setDisabled = updateDisabled;
      return (
        <LiquidGlass engine={engineHarness.engine}>
          <LiquidGlassMaterial
            disableInteractions={disabled()}
            isMoveable={disabled()}
            onPointerDown={consumerPointerDown}
            renderMode="dedicated"
          />
        </LiquidGlass>
      );
    });
    await Promise.resolve();
    const material = document.querySelector<HTMLElement>('.liquid-glass-material');
    if (!material || !setDisabled) throw new Error('Material did not mount.');
    material.getBoundingClientRect = materialRect;
    material.setPointerCapture = vi.fn();
    expect(material.getAttribute('disable-interactions')).toBe('false');
    expect(material.getAttribute('only-click-interactions')).toBe('false');
    expect(material.getAttribute('render-mode')).toBe('dedicated');
    expect(contextHarness.addMaterial).toHaveBeenCalledWith(expect.objectContaining({ isMoveable: false }));

    dispatchPointer(material, 'pointerdown');
    expect(consumerPointerDown).toHaveBeenCalledTimes(1);
    expect(contextHarness.material.setInteractionState).toHaveBeenCalledWith(
      expect.objectContaining({
        pointerState: expect.objectContaining({
          isActive: true,
          normalizedX: 0.5,
          normalizedY: 0.5,
        }),
      }),
    );
    setDisabled(true);
    await Promise.resolve();
    expect(material.getAttribute('disable-interactions')).toBe('true');
    dispatchPointer(material, 'pointerdown', { pointerId: 2 });
    expect(consumerPointerDown).toHaveBeenCalledTimes(2);
    expect(contextHarness.material.setInteractionState).toHaveBeenCalledTimes(1);
    expect(contextHarness.material.handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ isMoveable: true }));
    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
  });

  it('applies presentation frames directly and fully cleans up the subscription', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const childRender = vi.fn(() => <span>Stable child</span>);
    let setColor: ((color: string) => void) | undefined;
    const dispose = mountSolid(() => {
      const [color, updateColor] = createSignal('#123456');
      setColor = updateColor;
      return (
        <LiquidGlass engine={engineHarness.engine}>
          <LiquidGlassMaterial
            backgroundColor={color()}
            blur={12}
            children={childRender}
            radius={20}
            radiusTR={4}
            thickness={14}
            useCustomColor
          />
        </LiquidGlass>
      );
    });
    await Promise.resolve();
    const material = document.querySelector<HTMLElement>('.liquid-glass-material');
    const highlight = material?.querySelector<HTMLElement>('.liquid-glass-highlight');
    if (!material || !highlight || !setColor) throw new Error('Material did not mount.');
    expect(material.style.getPropertyValue('--lg-border-radius')).toBe('20px 4px 20px 20px');
    expect(material.style.getPropertyValue('--lg-fallback-blur')).toBe('6px');
    expect(material.style.getPropertyValue('--lg-background-tint')).toBe('#123456');

    const active = createPresentation();
    for (let frame = 1; frame <= 4; frame += 1) {
      contextHarness.material.emitPresentation({
        ...active,
        blurred: true,
        interactionOutput: {
          ...active.interactionOutput,
          highlightVisible: true,
          scaleX: 1.1,
          translateX: frame * 3,
        },
      });
    }
    expect(material.style.getPropertyValue('--lg-scale-x')).toBe('1.1');
    expect(material.style.getPropertyValue('--lg-translate-x')).toBe('12px');
    expect(material.getAttribute('is-blurred')).toBe('true');
    expect(highlight.classList.contains('visible')).toBe(true);
    expect(childRender).toHaveBeenCalledTimes(1);
    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);

    setColor('#abcdef');
    await Promise.resolve();
    expect(material.style.getPropertyValue('--lg-background-tint')).toBe('#abcdef');
    dispose();
    expect(contextHarness.material.unsubscribe).toHaveBeenCalledTimes(1);
    expect(contextHarness.material.listenerCount()).toBe(0);
    expect(contextHarness.material.destroy).toHaveBeenCalledTimes(1);
    expect(material.hasAttribute('is-blurred')).toBe(false);
    expect(highlight.classList.contains('visible')).toBe(false);
  });
});
