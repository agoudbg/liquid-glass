import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  CustomDrawCallback,
  GlassContext,
  GlassContextOptions,
  GlassEngine,
  MaterialHandle,
} from '@agou/liquid-glass-core';
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

function createMaterialHarness(id = 'material-1') {
  let destroyed = false;
  const destroy = vi.fn<MaterialHandle['destroy']>(() => {
    destroyed = true;
  });
  const handle: MaterialHandle = {
    id,
    get destroyed() {
      return destroyed;
    },
    destroy,
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
});
