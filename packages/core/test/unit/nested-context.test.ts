import { describe, expect, it, vi } from 'vitest';

import { connectNestedGlassContexts } from '../../src/engine/nested-context';
import { GlassError } from '../../src/errors/GlassError';
import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  CanvasRenderPayload,
  GlassContext,
} from '../../src/types/context';
import type { GlassEventMap } from '../../src/types/events';

interface ContextHarness {
  readonly addBackdropSource: ReturnType<typeof vi.fn>;
  readonly backdrop: BackdropSourceHandle<CanvasBackdropSourceConfig>;
  readonly context: GlassContext;
  readonly emitDestroyed: () => void;
  readonly emitFullCanvas: (payload: CanvasRenderPayload) => void;
  readonly refresh: ReturnType<typeof vi.fn>;
  readonly unsubscribeDestroyed: ReturnType<typeof vi.fn>;
  readonly unsubscribeFullCanvas: ReturnType<typeof vi.fn>;
}

function createContextHarness(): ContextHarness {
  const destroyedListeners = new Set<GlassEventMap['destroyed']>();
  const fullCanvasListeners = new Set<GlassEventMap['fullCanvasRendered']>();
  const unsubscribeDestroyed = vi.fn();
  const unsubscribeFullCanvas = vi.fn();
  const backdropRefresh = vi.fn();
  let backdropDestroyed = false;
  let contextDestroyed = false;
  const backdropDestroy = vi.fn(() => {
    if (backdropDestroyed) return;
    backdropDestroyed = true;
  });

  const backdrop: BackdropSourceHandle<CanvasBackdropSourceConfig> = {
    id: 'backdrop-1',
    get destroyed() {
      return backdropDestroyed;
    },
    destroy: backdropDestroy,
    refresh: backdropRefresh,
    update: vi.fn(),
  };
  const addBackdropSource = vi.fn(() => backdrop);
  const refresh = vi.fn<GlassContext['refresh']>();
  const on = (<Event extends keyof GlassEventMap>(
    event: Event,
    listener: GlassEventMap[Event],
  ): (() => void) => {
    if (event === 'destroyed') {
      const destroyedListener = listener as GlassEventMap['destroyed'];
      destroyedListeners.add(destroyedListener);
      return () => {
        destroyedListeners.delete(destroyedListener);
        unsubscribeDestroyed();
      };
    }
    if (event === 'fullCanvasRendered') {
      const fullCanvasListener = listener as GlassEventMap['fullCanvasRendered'];
      fullCanvasListeners.add(fullCanvasListener);
      return () => {
        fullCanvasListeners.delete(fullCanvasListener);
        unsubscribeFullCanvas();
      };
    }
    return () => undefined;
  }) as GlassContext['on'];
  const context = {
    addBackdropSource,
    addMaterial: vi.fn(),
    canvas: {} as HTMLCanvasElement,
    createProxyInterface: vi.fn(),
    destroy: vi.fn(),
    get destroyed() {
      return contextDestroyed;
    },
    fallbackMode: false,
    getDiagnostics: vi.fn(),
    off: vi.fn(),
    on,
    refresh,
    setFallbackMode: vi.fn(),
    setViewportMode: vi.fn(),
    updateOptions: vi.fn(),
  } as unknown as GlassContext;

  return {
    addBackdropSource,
    backdrop,
    context,
    emitDestroyed: () => {
      contextDestroyed = true;
      for (const listener of [...destroyedListeners]) listener();
    },
    emitFullCanvas: (payload) => {
      for (const listener of [...fullCanvasListeners]) listener(payload);
    },
    refresh,
    unsubscribeDestroyed,
    unsubscribeFullCanvas,
  };
}

function createContainer(): HTMLElement {
  return {} as HTMLElement;
}

describe('connectNestedGlassContexts', () => {
  it('registers a positioned parent source and copies complete child frames', () => {
    const parent = createContextHarness();
    const child = createContextHarness();
    const childContainer = createContainer();
    const handle = connectNestedGlassContexts(
      parent.context,
      child.context,
      childContainer,
      { zIndex: 7 },
    );

    expect(handle.destroyed).toBe(false);
    expect(parent.addBackdropSource).toHaveBeenCalledTimes(1);
    const sourceConfig = parent.addBackdropSource.mock.calls[0]?.[0] as
      | CanvasBackdropSourceConfig
      | undefined;
    expect(sourceConfig).toMatchObject({
      boundsElement: childContainer,
      element: child.context.canvas,
      kind: 'canvas',
      mirrorToElement: false,
      watchPositionChanges: true,
      watchResize: true,
      zIndex: 7,
    });
    expect(child.refresh).toHaveBeenCalledWith('structural');

    const frameCanvas = {} as HTMLCanvasElement;
    child.emitFullCanvas({ canvas: frameCanvas, height: 90, width: 160 });
    expect(parent.backdrop.refresh).toHaveBeenCalledTimes(1);

    const drawImage = vi.fn();
    sourceConfig?.draw(
      { drawImage } as unknown as CanvasRenderingContext2D,
      320,
      180,
    );
    expect(drawImage).toHaveBeenCalledWith(
      frameCanvas,
      0,
      0,
      160,
      90,
      0,
      0,
      320,
      180,
    );
  });

  it('releases the source and subscriptions exactly once', () => {
    const parent = createContextHarness();
    const child = createContextHarness();
    const handle = connectNestedGlassContexts(
      parent.context,
      child.context,
      createContainer(),
    );

    handle.destroy();
    handle.destroy();

    expect(handle.destroyed).toBe(true);
    expect(parent.backdrop.destroy).toHaveBeenCalledTimes(1);
    expect(parent.unsubscribeDestroyed).toHaveBeenCalledTimes(1);
    expect(child.unsubscribeDestroyed).toHaveBeenCalledTimes(1);
    expect(child.unsubscribeFullCanvas).toHaveBeenCalledTimes(1);
    child.emitFullCanvas({
      canvas: {} as HTMLCanvasElement,
      height: 1,
      width: 1,
    });
    expect(parent.backdrop.refresh).not.toHaveBeenCalled();
  });

  it('automatically disconnects when either context is destroyed', () => {
    const parent = createContextHarness();
    const child = createContextHarness();
    const handle = connectNestedGlassContexts(
      parent.context,
      child.context,
      createContainer(),
    );

    child.emitDestroyed();

    expect(handle.destroyed).toBe(true);
    expect(parent.backdrop.destroy).toHaveBeenCalledTimes(1);
    parent.emitDestroyed();
    expect(parent.backdrop.destroy).toHaveBeenCalledTimes(1);
  });

  it('rolls back subscriptions and the source when initial refresh fails', () => {
    const parent = createContextHarness();
    const child = createContextHarness();
    const failure = new Error('refresh failed');
    child.refresh.mockImplementation(() => {
      throw failure;
    });

    expect(() => connectNestedGlassContexts(
      parent.context,
      child.context,
      createContainer(),
    )).toThrow(failure);
    expect(parent.backdrop.destroy).toHaveBeenCalledTimes(1);
    expect(parent.unsubscribeDestroyed).toHaveBeenCalledTimes(1);
    expect(child.unsubscribeDestroyed).toHaveBeenCalledTimes(1);
    expect(child.unsubscribeFullCanvas).toHaveBeenCalledTimes(1);
  });

  it('rejects self-connections and destroyed contexts', () => {
    const context = createContextHarness();
    const container = createContainer();

    expect(() => connectNestedGlassContexts(
      context.context,
      context.context,
      container,
    )).toThrowError(expect.objectContaining<Partial<GlassError>>({
      code: 'INVALID_CONFIG',
    }));

    const parent = createContextHarness();
    const child = createContextHarness();
    child.emitDestroyed();
    expect(() => connectNestedGlassContexts(
      parent.context,
      child.context,
      container,
    )).toThrowError(expect.objectContaining<Partial<GlassError>>({
      code: 'DESTROYED_CONTEXT',
    }));
  });
});
