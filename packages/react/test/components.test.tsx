import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  CustomDrawCallback,
  GlassContext,
  GlassContextOptions,
  GlassEngine,
  MaterialHandle,
  MaterialPresentationState,
} from '@agou/liquid-glass-core';
import { InteractionEngine } from '@agou/liquid-glass-core';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackdropCanvas } from '../src/BackdropCanvas';
import { LiquidGlass } from '../src/LiquidGlass';
import { LiquidGlassMaterial } from '../src/LiquidGlassMaterial';
import type { LiquidGlassMaterialHandle } from '../src/types';

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
) {
  let destroyed = false;
  const presentation = createPresentation();
  const destroy = vi.fn<MaterialHandle['destroy']>(() => {
    destroyed = true;
  });
  const handle: MaterialHandle = {
    id,
    get destroyed() {
      return destroyed;
    },
    destroy,
    getPresentation: vi.fn<MaterialHandle['getPresentation']>(() => presentation),
    onPresentation: vi.fn<MaterialHandle['onPresentation']>((listener) => {
      listener(presentation);
      return vi.fn();
    }),
    refreshLayout: vi.fn<MaterialHandle['refreshLayout']>(),
    setInteractionState: vi.fn<MaterialHandle['setInteractionState']>(),
    update: vi.fn<MaterialHandle['update']>(),
  };
  return { destroy, handle };
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

function createContextHarness() {
  const material = createMaterialHarness();
  const backdrop = createBackdropHarness();
  const addMaterial = vi.fn((_config: Parameters<GlassContext['addMaterial']>[0]) => material.handle);
  const addBackdropSource = vi.fn((_config: CanvasBackdropSourceConfig) => backdrop.handle);
  const destroy = vi.fn<GlassContext['destroy']>();
  const refresh = vi.fn<GlassContext['refresh']>();
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
    refresh,
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
    refresh,
    updateOptions,
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('React adapter lifecycle', () => {
  it('samples a nested context through the nearest parent lifecycle', async () => {
    const parentHarness = createContextHarness();
    const childHarness = createContextHarness();
    const parentEngine = createEngineHarness(parentHarness.context);
    const childEngine = createEngineHarness(childHarness.context);
    const mounted = render(
      <LiquidGlass engine={parentEngine.engine}>
        <LiquidGlass engine={childEngine.engine} />
      </LiquidGlass>,
    );

    await waitFor(() => {
      expect(parentHarness.addBackdropSource).toHaveBeenCalledTimes(1);
    });
    const containers = mounted.container.querySelectorAll(
      '.liquid-glass-container',
    );
    expect(parentHarness.addBackdropSource).toHaveBeenCalledWith(
      expect.objectContaining({
        boundsElement: containers[1],
        kind: 'canvas',
        watchPositionChanges: true,
        watchResize: true,
      }),
    );
    expect(childHarness.refresh).toHaveBeenCalledWith('structural');

    mounted.unmount();
    expect(parentHarness.backdrop.destroy).toHaveBeenCalledTimes(1);
  });

  it('renders a direct scrollable content layer for core ownership', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const mounted = render(
      <LiquidGlass
        engine={engineHarness.engine}
        options={{ scrollable: true }}
      >
        <span data-testid="content">Content</span>
      </LiquidGlass>,
    );

    await waitFor(() => {
      expect(engineHarness.createContext).toHaveBeenCalledOnce();
    });
    const container = mounted.container.querySelector(
      '.liquid-glass-container',
    );
    const content = container?.querySelector(
      ':scope > .liquid-glass-content.scrollable',
    );
    expect(content).not.toBeNull();
    expect(content?.querySelector('[data-testid="content"]')).not.toBeNull();
    expect(engineHarness.createContext.mock.calls[0]?.[0]).toBe(container);
  });

  it.each([
    { blur: undefined, expectedFallbackBlur: '6px' },
    { blur: 0, expectedFallbackBlur: '0px' },
    { blur: 12, expectedFallbackBlur: '6px' },
  ])(
    'preserves blur=$blur while exposing a $expectedFallbackBlur fallback blur',
    async ({ blur, expectedFallbackBlur }) => {
      const contextHarness = createContextHarness();
      const engineHarness = createEngineHarness(contextHarness.context);
      const materialProps = blur === undefined ? {} : { blur };
      const mounted = render(
        <LiquidGlass engine={engineHarness.engine}>
          <LiquidGlassMaterial {...materialProps}>Glass content</LiquidGlassMaterial>
        </LiquidGlass>,
      );

      await waitFor(() => {
        expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
      });
      const material = mounted.container.querySelector<HTMLElement>('.liquid-glass-material');
      expect(material?.style.getPropertyValue('--lg-fallback-blur')).toBe(expectedFallbackBlur);
      expect(material?.querySelector(
        ':scope > .liquid-glass-content',
      )).toBeNull();
      expect(material?.textContent).toContain('Glass content');
      expect(contextHarness.addMaterial.mock.calls[0]?.[0].blur).toBe(blur);
    },
  );

  it('preserves explicit zero and omitted blur in material changes', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const view = (materialProps: { blur?: number }) => (
      <LiquidGlass engine={engineHarness.engine}>
        <LiquidGlassMaterial {...materialProps}>Glass content</LiquidGlassMaterial>
      </LiquidGlass>
    );
    const mounted = render(view({ blur: 2 }));

    await waitFor(() => {
      expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
    });
    mounted.rerender(view({ blur: 0 }));
    await waitFor(() => {
      expect(contextHarness.material.handle.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ blur: 0 }),
      );
    });

    mounted.rerender(view({}));
    await waitFor(() => {
      expect(contextHarness.material.handle.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ blur: undefined }),
      );
    });
  });

  it('updates options without replacing the context or material registration', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const materialRef = createRef<LiquidGlassMaterialHandle>();
    const view = (options: GlassContextOptions) => (
      <LiquidGlass engine={engineHarness.engine} options={options}>
        <LiquidGlassMaterial ref={materialRef} radius={20}>
          Glass content
        </LiquidGlassMaterial>
      </LiquidGlass>
    );
    const mounted = render(view({ renderPrecision: 1 }));

    await waitFor(() => {
      expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
    });
    const initialRegistration = materialRef.current?.getHandle();
    expect(initialRegistration?.id).toBe('material-1');
    const initialOptionUpdates = contextHarness.updateOptions.mock.calls.length;

    mounted.rerender(view({ renderPrecision: 0.5 }));

    await waitFor(() => {
      expect(contextHarness.updateOptions).toHaveBeenCalledTimes(initialOptionUpdates + 1);
    });
    expect(contextHarness.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ renderPrecision: 0.5 }),
    );
    expect(engineHarness.createContext).toHaveBeenCalledTimes(1);
    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
    expect(materialRef.current?.getHandle()).toBe(initialRegistration);
    expect(contextHarness.material.destroy).not.toHaveBeenCalled();

    mounted.unmount();

    expect(contextHarness.material.destroy).toHaveBeenCalledTimes(1);
    expect(contextHarness.destroy).toHaveBeenCalledTimes(1);
    expect(engineHarness.destroy).not.toHaveBeenCalled();
  });

  it('propagates onReady exceptions without reporting a context creation error', () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const failure = new Error('consumer onReady failure');
    const onError = vi.fn<(error: unknown) => void>();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let thrown: unknown;

    try {
      render(
        <LiquidGlass
          engine={engineHarness.engine}
          onError={onError}
          onReady={() => {
            throw failure;
          }}
        />,
      );
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
    const view = (draw: CustomDrawCallback) => (
      <LiquidGlass engine={engineHarness.engine}>
        <BackdropCanvas draw={draw} zIndex={3} />
      </LiquidGlass>
    );
    const mounted = render(view(firstDraw));

    await waitFor(() => {
      expect(contextHarness.addBackdropSource).toHaveBeenCalledTimes(1);
    });
    contextHarness.backdrop.update.mockClear();
    contextHarness.backdrop.refresh.mockClear();

    mounted.rerender(view(nextDraw));

    await waitFor(() => {
      expect(contextHarness.backdrop.update).toHaveBeenCalledTimes(1);
    });
    expect(contextHarness.backdrop.update).toHaveBeenLastCalledWith({
      draw: nextDraw,
      zIndex: 3,
    });
    expect(contextHarness.backdrop.refresh).not.toHaveBeenCalled();
  });
});
