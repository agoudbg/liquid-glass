import {
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';

import type {
  DiagnosticsSnapshot,
  GlassContext,
  GlassEventMap,
} from '../../src';
import type { DomCaptureResult } from '../../src/backdrop/dom-capture';
import { FakeCanvas } from '../fixtures/fake-webgl2';
import {
  addHarnessMaterial,
  FakeMaterialElement,
  mountMaterialContext,
} from '../fixtures/material-context';

describe('GlassContext diagnostics', () => {
  it('publishes isolated debug epochs and preserves a zero-resource terminal snapshot', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    let timestamp = 100;
    harness.runtime.now = () => {
      const current = timestamp;
      timestamp += 5;
      return current;
    };

    const initial = context.getDiagnostics();
    expect(initial).toMatchObject({
      schemaVersion: 1,
      debugEnabled: false,
      lifecycle: 'active',
      registrations: {
        materials: 0,
        backdrops: 1,
        canvasBackdrops: 1,
        readyBackdrops: 1,
      },
      resources: {
        ownedCanvases: 4,
        webgl: {
          programs: 1,
          buffers: 1,
          vertexArrays: 1,
          textures: 1,
        },
      },
      metrics: null,
    });

    const updates: DiagnosticsSnapshot[] = [];
    context.on('diagnosticsUpdated', (snapshot) => updates.push(snapshot));
    context.updateOptions({ debug: true });

    expect(context.getDiagnostics().metrics).toMatchObject({
      frameCount: 1,
      drawCalls: 0,
      lastFrameDurationMs: 5,
    });

    addHarnessMaterial(mounted, {
      x: 24,
      y: 20,
      width: 120,
      height: 56,
    });
    const active = context.getDiagnostics();
    expect(active.registrations).toMatchObject({
      materials: 1,
      materialsInViewport: 1,
    });
    expect(active.metrics).toMatchObject({
      frameCount: 2,
      drawCalls: 1,
    });
    expect(active.metrics?.framesPerSecond).toBeGreaterThan(0);

    const mutable = active as {
      resources: { webgl: { programs: number } };
    };
    mutable.resources.webgl.programs = 99;
    expect(context.getDiagnostics().resources.webgl.programs).toBe(1);

    context.updateOptions({ debug: false });
    expect(updates.at(-1)).toMatchObject({
      debugEnabled: false,
      metrics: null,
    });
    context.updateOptions({ debug: true });
    expect(context.getDiagnostics().metrics?.frameCount).toBe(1);

    const lifecycleEvents: string[] = [];
    context.on('diagnosticsUpdated', (snapshot) => {
      if (snapshot.lifecycle === 'destroyed') {
        lifecycleEvents.push('diagnostics');
      }
    });
    context.on('destroyed', () => {
      lifecycleEvents.push(`destroyed:${context.getDiagnostics().lifecycle}`);
    });
    context.destroy();

    expect(lifecycleEvents).toEqual([
      'diagnostics',
      'destroyed:destroyed',
    ]);
    expect(context.getDiagnostics()).toMatchObject({
      lifecycle: 'destroyed',
      registrations: {
        materials: 0,
        materialsInViewport: 0,
        backdrops: 0,
        dirtyBackdrops: 0,
        readyBackdrops: 0,
      },
      scheduling: {
        layoutFramePending: false,
        capture: {
          active: false,
          pendingFrame: false,
          running: false,
        },
        material: {
          pendingFrame: false,
          pendingTimer: false,
          activeMaterials: 0,
          pendingUpdates: 0,
          renderRequested: false,
        },
      },
      resources: {
        ownedCanvases: 0,
        trackedEventListeners: 0,
        resizeObservers: 0,
        mutationObservers: 0,
        intersectionObservers: 0,
        pendingAnimationFrames: 0,
        pendingTimers: 0,
        webgl: {
          shaders: 0,
          programs: 0,
          buffers: 0,
          vertexArrays: 0,
          textures: 0,
        },
      },
    });
  });

  it('measures accepted DOM captures without exposing captured canvases', async () => {
    const mounted = mountMaterialContext();
    const { context, container, harness } = mounted;
    let timestamp = 200;
    harness.runtime.now = () => {
      const current = timestamp;
      timestamp += 3;
      return current;
    };
    harness.runtime.captureDomElement = vi.fn(async () => ({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 320, height: 180 },
    }));
    context.updateOptions({ debug: true });

    const source = new FakeMaterialElement({
      x: 0,
      y: 0,
      width: 320,
      height: 180,
    });
    source.parentElement = container as unknown as HTMLElement;
    const sourceHandle = context.addBackdropSource({
      kind: 'dom',
      element: source as unknown as HTMLElement,
    });
    harness.flushFrame();

    await vi.waitFor(() => {
      const snapshot = context.getDiagnostics();
      expect(snapshot.metrics?.captureCount).toBe(1);
      expect(snapshot.metrics?.lastCaptureDurationMs).toBe(3);
      expect(snapshot.scheduling.capture.running).toBe(false);
    });
    expect(context.getDiagnostics()).toMatchObject({
      registrations: {
        backdrops: 2,
        domBackdrops: 1,
        canvasBackdrops: 1,
        dirtyBackdrops: 0,
        readyBackdrops: 2,
      },
      resources: {
        ownedCanvases: 5,
      },
    });
    expect('canvas' in context.getDiagnostics()).toBe(false);
    sourceHandle.refresh();
    expect(context.getDiagnostics().registrations).toMatchObject({
      dirtyBackdrops: 1,
      readyBackdrops: 2,
    });
    context.destroy();
  });

  it('invalidates texture readiness across WebGL context loss and restoration', () => {
    const { context, harness } = mountMaterialContext();
    context.updateOptions({ debug: true });
    const rendererCanvas = harness.canvases[0];
    if (!rendererCanvas) {
      throw new Error('The renderer canvas was not created.');
    }

    expect(context.getDiagnostics().presentation.backdropTextureReady).toBe(true);
    rendererCanvas.dispatch(
      'webglcontextlost',
      { preventDefault: vi.fn() } as unknown as Event,
    );

    expect(context.getDiagnostics()).toMatchObject({
      mode: {
        fallback: {
          contextLost: true,
          effective: true,
        },
      },
      presentation: {
        backdropTextureReady: false,
        rendererState: 'context-lost',
      },
      resources: {
        webgl: {
          textures: 0,
        },
      },
      metrics: {
        contextLossCount: 1,
      },
    });

    rendererCanvas.dispatch('webglcontextrestored', new Event('webglcontextrestored'));
    expect(context.getDiagnostics()).toMatchObject({
      mode: {
        fallback: {
          contextLost: false,
          effective: false,
        },
      },
      presentation: {
        backdropTextureReady: true,
        rendererState: 'ready',
      },
      resources: {
        webgl: {
          textures: 1,
        },
      },
      metrics: {
        contextRestoreCount: 1,
      },
    });
    context.destroy();
  });

  it('isolates diagnostics listener failures from completed core state changes', () => {
    const { context } = mountMaterialContext();
    const listenerFailure = new Error('diagnostics listener failed');
    const errors: Array<Parameters<GlassEventMap['error']>[0]> = [];
    context.updateOptions({ debug: true });
    context.on('error', (error) => errors.push(error));
    context.on('diagnosticsUpdated', () => {
      throw listenerFailure;
    });

    expect(() => context.refresh()).not.toThrow();
    expect(errors.at(-1)).toMatchObject({
      code: 'EVENT_LISTENER_FAILED',
      error: listenerFailure,
      phase: 'event',
    });
    expect(context.getDiagnostics().metrics?.errorCount).toBe(1);
    expect(() => context.setFallbackMode(true)).not.toThrow();
    expect(context.fallbackMode).toBe(true);
    context.destroy();
  });

  it('publishes error metrics before rethrowing a contextual render failure', () => {
    const { context, harness } = mountMaterialContext();
    const updates: DiagnosticsSnapshot[] = [];
    context.updateOptions({ debug: true });
    context.on('diagnosticsUpdated', (snapshot) => updates.push(snapshot));
    const rendererCanvas = harness.canvases[0];
    if (!rendererCanvas) {
      throw new Error('The renderer canvas was not created.');
    }
    rendererCanvas.gl.errorCode = 0x0500;

    expect(() => context.refresh()).toThrowError(
      expect.objectContaining({ code: 'RENDER_FAILED' }),
    );
    expect(updates.at(-1)?.metrics?.errorCount).toBe(1);
    context.destroy();
  });

  it('releases ownership of an in-flight capture task during destruction', async () => {
    const { context, container, harness } = mountMaterialContext();
    let resolveCapture: ((result: DomCaptureResult) => void) | undefined;
    const pendingCapture = new Promise<DomCaptureResult>((resolve) => {
      resolveCapture = resolve;
    });
    harness.runtime.captureDomElement = vi.fn(() => pendingCapture);
    context.updateOptions({ debug: true });
    const source = new FakeMaterialElement({
      x: 0,
      y: 0,
      width: 320,
      height: 180,
    });
    source.parentElement = container as unknown as HTMLElement;
    context.addBackdropSource({
      kind: 'dom',
      element: source as unknown as HTMLElement,
    });
    harness.flushFrame();

    await vi.waitFor(() => {
      expect(harness.runtime.captureDomElement).toHaveBeenCalledOnce();
      expect(context.getDiagnostics().resources.activeCaptureTasks).toBe(1);
    });
    context.destroy();
    expect(context.getDiagnostics()).toMatchObject({
      lifecycle: 'destroyed',
      resources: {
        activeCaptureTasks: 0,
      },
    });
    resolveCapture?.({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 320, height: 180 },
    });
    await pendingCapture;
    await Promise.resolve();
  });

  it('exports the diagnostics method and typed update event', () => {
    expectTypeOf<GlassContext['getDiagnostics']>()
      .returns.toEqualTypeOf<DiagnosticsSnapshot>();
    expectTypeOf<GlassEventMap['diagnosticsUpdated']>()
      .parameters.toEqualTypeOf<[snapshot: DiagnosticsSnapshot]>();
  });
});
