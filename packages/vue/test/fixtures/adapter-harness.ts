import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  GlassContext,
  GlassEngine,
  MaterialHandle,
  MaterialPresentationState,
} from '@agou/liquid-glass-core';
import { InteractionEngine } from '@agou/liquid-glass-core';
import { vi } from 'vitest';

interface ContextHarness {
  context: GlassContext;
  addBackdropSource: ReturnType<typeof vi.fn>;
  addMaterial: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  updateOptions: ReturnType<typeof vi.fn>;
}

interface TestMaterialHandle extends MaterialHandle {
  emitPresentation(presentation: MaterialPresentationState): void;
  presentationUnsubscribed: ReturnType<typeof vi.fn>;
}

export function createPresentation(
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

export function dispatchPointer(
  target: EventTarget,
  type: string,
  overrides: Partial<Pick<
    PointerEvent,
    'clientX' | 'clientY' | 'pointerId' | 'pointerType' | 'pressure'
  >> = {},
): void {
  const event = new Event(type, { bubbles: true, composed: true });
  const pointer = {
    clientX: 24,
    clientY: 18,
    pointerId: 7,
    pointerType: 'mouse',
    pressure: 0.5,
    ...overrides,
  };
  for (const [property, value] of Object.entries(pointer)) {
    Object.defineProperty(event, property, { configurable: true, value });
  }
  target.dispatchEvent(event);
}

export function createMaterialHandle(id = 'material-1'): TestMaterialHandle {
  let currentPresentation = createPresentation();
  const listeners = new Set<(presentation: MaterialPresentationState) => void>();
  const presentationUnsubscribed = vi.fn();
  const handle: TestMaterialHandle = {
    id,
    destroyed: false,
    destroy: vi.fn(),
    emitPresentation: (presentation) => {
      currentPresentation = presentation;
      for (const listener of [...listeners]) listener(presentation);
    },
    getPresentation: vi.fn(() => currentPresentation),
    onPresentation: vi.fn((listener) => {
      listeners.add(listener);
      try {
        listener(currentPresentation);
      } catch (error) {
        listeners.delete(listener);
        throw error;
      }
      return () => {
        listeners.delete(listener);
        presentationUnsubscribed();
      };
    }),
    presentationUnsubscribed,
    refreshLayout: vi.fn(),
    setInteractionState: vi.fn(),
    startLayoutUpdates: vi.fn(),
    stopLayoutUpdates: vi.fn(),
    update: vi.fn(),
  };
  return handle;
}

export function createBackdropHandle(
  id = 'backdrop-1',
): BackdropSourceHandle<CanvasBackdropSourceConfig> {
  return {
    id,
    destroyed: false,
    destroy: vi.fn(),
    refresh: vi.fn(),
    update: vi.fn(),
  };
}

export function createContextHarness(
  materialHandle = createMaterialHandle(),
  backdropHandle = createBackdropHandle(),
): ContextHarness {
  const addBackdropSource = vi.fn(() => backdropHandle);
  const addMaterial = vi.fn(() => materialHandle);
  const destroy = vi.fn();
  const refresh = vi.fn();
  const updateOptions = vi.fn();
  const context = {
    addBackdropSource,
    addMaterial,
    canvas: document.createElement('canvas'),
    createProxyInterface: vi.fn(() => null),
    destroy,
    off: vi.fn(),
    on: vi.fn(() => vi.fn()),
    refresh,
    setFallbackMode: vi.fn(),
    setViewportMode: vi.fn(),
    updateOptions,
  } as unknown as GlassContext;

  return {
    context,
    addBackdropSource,
    addMaterial,
    destroy,
    refresh,
    updateOptions,
  };
}

export function createEngine(context: GlassContext): {
  engine: GlassEngine;
  createContext: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
} {
  const createContext = vi.fn(() => context);
  const destroy = vi.fn();
  const engine = {
    createContext,
    destroy,
    destroyed: false,
  } as unknown as GlassEngine;

  return { engine, createContext, destroy };
}
