import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  GlassContext,
  GlassContextOptions,
  GlassEngine,
  MaterialHandle,
  MaterialPresentationListener,
  MaterialPresentationState,
} from '@agou/liquid-glass-core';
import { InteractionEngine } from '@agou/liquid-glass-core';
import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { vi } from 'vitest';

export function createPresentation(
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

export function createContextHarness(
  initialPresentation?: MaterialPresentationState,
) {
  const material = createMaterialHarness('material-1', initialPresentation);
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

export function dispatchPointer(
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

export function materialRect(): DOMRect {
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

export function createEngineHarness(context: GlassContext) {
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

export function mountSolid(view: () => JSX.Element): () => void {
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

export function cleanupSolidHarnesses(): void {
  while (disposers.length > 0) {
    disposers.pop()?.();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
}
