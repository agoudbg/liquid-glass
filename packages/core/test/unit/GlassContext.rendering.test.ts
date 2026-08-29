import { describe, expect, it, vi } from 'vitest';

import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import type { CanvasLike, CustomDrawCallback } from '../../src/types';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';
import {
  createRuntimeHarness,
  domRect,
  FakeElement,
  Missing2DCanvas,
} from '../fixtures/glass-context-rendering';

describe('GlassContext render ownership', () => {
  it('defers off-screen frame copies until a render event is observed', () => {
    const harness = createRuntimeHarness();
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const presentationCanvas = harness.canvases[2];
    const materialsCanvas = harness.canvases[3];
    const fullCompositeCanvas = harness.canvases[4];
    if (!presentationCanvas || !materialsCanvas || !fullCompositeCanvas) {
      throw new Error('Missing context-owned canvas.');
    }

    context.refresh();

    expect(presentationCanvas.context2d.calls).toHaveLength(2);
    expect(materialsCanvas.context2d.calls).toEqual([]);
    expect(fullCompositeCanvas.context2d.calls).toEqual([]);

    const fullCanvasRendered = vi.fn();
    context.on('fullCanvasRendered', fullCanvasRendered);
    context.refresh();

    expect(materialsCanvas.context2d.calls).toHaveLength(2);
    expect(fullCompositeCanvas.context2d.calls).toHaveLength(2);
    expect(fullCanvasRendered).toHaveBeenCalledOnce();
    context.destroy();
  });

  it('copies cleared WebGL frames into the sole visible canvas before events', () => {
    const harness = createRuntimeHarness(1.5);
    const container = new FakeElement({ x: 10, y: 20, width: 201, height: 99 });
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const rendererCanvas = harness.canvases[0];
    const compositeCanvas = harness.canvases[1];
    const presentationCanvas = harness.canvases[2];
    const materialsCanvas = harness.canvases[3];
    const fullCompositeCanvas = harness.canvases[4];
    if (
      !rendererCanvas
      || !compositeCanvas
      || !presentationCanvas
      || !materialsCanvas
      || !fullCompositeCanvas
    ) {
      throw new Error('Missing context-owned canvas.');
    }

    expect(harness.canvases).toHaveLength(5);
    expect(context.canvas).toBe(presentationCanvas);
    expect(container.children).toEqual([presentationCanvas]);
    expect(rendererCanvas.parentNode).toBeNull();
    expect(compositeCanvas.parentNode).toBeNull();
    expect(materialsCanvas.parentNode).toBeNull();
    expect(fullCompositeCanvas.parentNode).toBeNull();

    const eventCanvases: CanvasLike[] = [];
    const copyCountsAtEvent: number[] = [];
    context.on('materialsRendered', ({ canvas }) => {
      eventCanvases.push(canvas);
      copyCountsAtEvent.push(presentationCanvas.context2d.calls.length);
    });
    context.on('fullCanvasRendered', ({ canvas }) => {
      eventCanvases.push(canvas);
      copyCountsAtEvent.push(presentationCanvas.context2d.calls.length);
    });

    context.refresh();

    expect(rendererCanvas).toMatchObject({ width: 302, height: 149 });
    expect(presentationCanvas).toMatchObject({ width: 302, height: 149 });
    expect(callsNamed(rendererCanvas.gl, 'clear')).toHaveLength(1);
    expect(presentationCanvas.context2d.calls).toEqual([
      { name: 'clearRect', args: [0, 0, 302, 149] },
      {
        name: 'drawImage',
        args: [rendererCanvas, 0, 0, 302, 149],
      },
    ]);
    expect(materialsCanvas.context2d.calls).toEqual([
      { name: 'clearRect', args: [0, 0, 302, 149] },
      {
        name: 'drawImage',
        args: [rendererCanvas, 0, 0, 302, 149],
      },
    ]);
    expect(fullCompositeCanvas.context2d.calls).toEqual([
      { name: 'clearRect', args: [0, 0, 302, 149] },
      {
        name: 'drawImage',
        args: [
          materialsCanvas,
          0,
          0,
          302,
          149,
          0,
          0,
          302,
          149,
        ],
      },
    ]);
    expect(eventCanvases).toEqual([materialsCanvas, fullCompositeCanvas]);
    expect(copyCountsAtEvent).toEqual([2, 2]);

    context.destroy();
    context.destroy();

    expect(container.children).toHaveLength(0);
    expect(harness.canvases).toEqual([
      expect.objectContaining({ width: 0, height: 0 }),
      expect.objectContaining({ width: 0, height: 0 }),
      expect.objectContaining({ width: 0, height: 0 }),
      expect.objectContaining({ width: 0, height: 0 }),
      expect.objectContaining({ width: 0, height: 0 }),
    ]);
    expect(context.canvas).toMatchObject({ width: 0, height: 0 });
    expect(callsNamed(rendererCanvas.gl, 'deleteProgram')).toHaveLength(1);
    const preventDefault = vi.fn();
    rendererCanvas.dispatch('webglcontextlost', {
      preventDefault,
    } as unknown as Event);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('emits composite and rendered events in pipeline order with physical dimensions', () => {
    const harness = createRuntimeHarness(1.5);
    const container = new FakeElement({ x: 10, y: 20, width: 201, height: 99 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 0, y: 0, width: 0, height: 0 }));
    const backdropBounds = new FakeElement({
      x: 10,
      y: 20,
      width: 201,
      height: 99,
    });
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const rendererCanvas = harness.canvases[0];
    const compositeCanvas = harness.canvases[1];
    const presentationCanvas = harness.canvases[2];
    const materialsCanvas = harness.canvases[3];
    const fullCompositeCanvas = harness.canvases[4];
    if (
      !rendererCanvas
      || !compositeCanvas
      || !presentationCanvas
      || !materialsCanvas
      || !fullCompositeCanvas
    ) {
      throw new Error('Missing context-owned canvas.');
    }
    const eventOrder: string[] = [];
    const fullCanvasRendered = vi.fn();
    context.on('compositeRequested', () => eventOrder.push('compositeRequested'));
    context.on('backdropCaptured', () => eventOrder.push('backdropCaptured'));
    context.on('materialsRendered', ({ canvas }) => {
      expect(canvas).toBe(materialsCanvas);
      expect(presentationCanvas.context2d.calls).toHaveLength(2);
      expect(fullCompositeCanvas.context2d.calls).toHaveLength(3);
      eventOrder.push('materialsRendered');
    });
    context.on('fullCanvasRendered', (payload) => {
      expect(payload.canvas).toBe(fullCompositeCanvas);
      expect(presentationCanvas.context2d.calls).toHaveLength(2);
      expect(fullCompositeCanvas.context2d.calls).toHaveLength(3);
      eventOrder.push('fullCanvasRendered');
      fullCanvasRendered(payload);
    });

    context.addBackdropSource({
      boundsElement: backdropBounds as unknown as HTMLElement,
      draw: () => undefined,
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });

    expect(backdrop).toMatchObject({ width: 302, height: 149 });
    expect(eventOrder).toEqual([
      'compositeRequested',
      'backdropCaptured',
      'materialsRendered',
      'fullCanvasRendered',
    ]);
    expect(fullCanvasRendered).toHaveBeenCalledWith({
      canvas: fullCompositeCanvas,
      width: 302,
      height: 149,
    });
    expect(presentationCanvas.context2d.calls).toEqual([
      { name: 'clearRect', args: [0, 0, 302, 149] },
      {
        name: 'drawImage',
        args: [rendererCanvas, 0, 0, 302, 149],
      },
    ]);
    expect(fullCompositeCanvas.context2d.calls).toEqual([
      { name: 'clearRect', args: [0, 0, 302, 149] },
      {
        name: 'drawImage',
        args: [
          compositeCanvas,
          0,
          0,
          302,
          149,
          0,
          0,
          302,
          149,
        ],
      },
      {
        name: 'drawImage',
        args: [
          materialsCanvas,
          0,
          0,
          302,
          149,
          0,
          0,
          302,
          149,
        ],
      },
    ]);
    context.destroy();
  });

  it('keeps non-presented canvas sources off their identity element', () => {
    const harness = createRuntimeHarness(2);
    const container = new FakeElement({ x: 0, y: 0, width: 120, height: 60 });
    const identityCanvas = new FakeCanvas();
    identityCanvas.setClientRect(domRect({
      x: 0,
      y: 0,
      width: 120,
      height: 60,
    }));
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );

    context.addBackdropSource({
      draw: () => undefined,
      element: identityCanvas as unknown as HTMLCanvasElement,
      kind: 'canvas',
      mirrorToElement: false,
    });

    const authoritativeCanvas = harness.canvases[5];
    expect(authoritativeCanvas).toMatchObject({ width: 240, height: 120 });
    expect(identityCanvas).toMatchObject({ width: 1, height: 1 });
    expect(identityCanvas.context2d.calls).toEqual([]);
    context.destroy();
  });

  it('does not present a canvas source destroyed by its draw callback', () => {
    const harness = createRuntimeHarness();
    const container = new FakeElement({ x: 0, y: 0, width: 120, height: 60 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 0, y: 0, width: 120, height: 60 }));
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const captured = vi.fn();
    let destroyOnDraw = false;
    context.on('backdropCaptured', captured);
    const handle = context.addBackdropSource({
      draw: () => {
        if (destroyOnDraw) handle.destroy();
      },
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });
    captured.mockClear();
    const presentation = harness.canvases[2];
    if (!presentation) throw new Error('Missing presentation canvas.');
    const copiesBeforeDestroy = presentation.context2d.calls.filter(
      ({ name }) => name === 'drawImage',
    ).length;

    destroyOnDraw = true;
    handle.refresh();

    expect(handle.destroyed).toBe(true);
    expect(context.getDiagnostics().registrations.backdrops).toBe(0);
    expect(captured).not.toHaveBeenCalled();
    expect(presentation.context2d.calls.filter(
      ({ name }) => name === 'drawImage',
    )).toHaveLength(copiesBeforeDestroy + 1);
    context.destroy();
  });

  it('redraws with the newest config after a reentrant draw update', () => {
    const harness = createRuntimeHarness();
    const container = new FakeElement({ x: 0, y: 0, width: 120, height: 60 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 0, y: 0, width: 120, height: 60 }));
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const captured = vi.fn();
    const latestDraw = vi.fn<CustomDrawCallback>((drawingContext) => {
      drawingContext.fillRect(2, 0, 10, 10);
    });
    let updateOnDraw = false;
    context.on('backdropCaptured', captured);
    const handle = context.addBackdropSource({
      draw: (drawingContext) => {
        if (updateOnDraw) handle.update({ draw: latestDraw });
        drawingContext.fillRect(1, 0, 10, 10);
      },
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });
    captured.mockClear();
    const presentation = harness.canvases[2];
    const authoritative = harness.canvases[5];
    if (!presentation || !authoritative) {
      throw new Error('Missing canvas backdrop pipeline.');
    }
    const copiesBeforeUpdate = presentation.context2d.calls.filter(
      ({ name }) => name === 'drawImage',
    ).length;

    updateOnDraw = true;
    handle.refresh();

    expect(latestDraw).toHaveBeenCalledOnce();
    expect(captured).toHaveBeenCalledOnce();
    expect(presentation.context2d.calls.filter(
      ({ name }) => name === 'drawImage',
    )).toHaveLength(copiesBeforeUpdate + 1);
    expect(authoritative.context2d.calls.filter(
      ({ name }) => name === 'fillRect',
    ).at(-1)).toEqual({ name: 'fillRect', args: [2, 0, 10, 10] });
    context.destroy();
  });

  it('emits and rethrows a missing presentation 2D context error', () => {
    const canvases: FakeCanvas[] = [];
    const runtime: GlassEngineRuntime = {
      createCanvas: () => {
        const canvas = canvases.length === 2
          ? new Missing2DCanvas()
          : new FakeCanvas();
        canvases.push(canvas);
        return canvas as unknown as HTMLCanvasElement;
      },
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };
    const container = new FakeElement({ x: 0, y: 0, width: 240, height: 120 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const errors = vi.fn();
    context.on('error', errors);

    expect(() => context.refresh()).toThrowError(expect.objectContaining({
      code: 'RENDER_FAILED',
      phase: 'render',
    }));
    expect(errors).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({
      code: 'RENDER_FAILED',
      message: 'Failed to acquire the liquid-glass presentation 2D context.',
      phase: 'render',
    }));
    context.destroy();
  });

  it.each([
    [3, 'materials'],
    [4, 'full-composite'],
  ])(
    'emits a typed error when the %s output context is missing',
    (missingIndex, label) => {
      const canvases: FakeCanvas[] = [];
      const runtime: GlassEngineRuntime = {
        createCanvas: () => {
          const canvas = canvases.length === missingIndex
            ? new Missing2DCanvas()
            : new FakeCanvas();
          canvases.push(canvas);
          return canvas as unknown as HTMLCanvasElement;
        },
        devicePixelRatio: () => 1,
        getComputedStyle: () => ({}) as CSSStyleDeclaration,
      };
      const container = new FakeElement({
        x: 0,
        y: 0,
        width: 240,
        height: 120,
      });
      const context = new GlassEngine(runtime).createContext(
        container as unknown as HTMLElement,
      );
      const errors = vi.fn();
      context.on('error', errors);
      if (missingIndex === 3) {
        context.on('materialsRendered', () => undefined);
      } else {
        context.on('fullCanvasRendered', () => undefined);
      }

      expect(() => context.refresh()).toThrowError(expect.objectContaining({
        code: 'RENDER_FAILED',
        phase: 'render',
      }));
      expect(errors).toHaveBeenCalledWith(expect.objectContaining({
        code: 'RENDER_FAILED',
        message: `Failed to acquire the liquid-glass ${label} 2D context.`,
        phase: 'render',
      }));
      context.destroy();
    },
  );

  it('emits one render error from an active DOM capture frame', async () => {
    const harness = createRuntimeHarness();
    const capturedCanvas = new FakeCanvas();
    capturedCanvas.width = 320;
    capturedCanvas.height = 180;
    harness.runtime.captureDomElement = vi.fn(async () => ({
      canvas: capturedCanvas as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 320, height: 180 },
    }));
    const container = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const backdrop = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );
    const errors = vi.fn();
    context.on('error', errors);
    context.addBackdropSource({
      element: backdrop as unknown as HTMLElement,
      kind: 'dom',
    });
    const rendererCanvas = harness.canvases[0];
    if (!rendererCanvas) throw new Error('Missing renderer canvas.');
    rendererCanvas.gl.errorCode = 0x0502;

    harness.flushFrame();

    await vi.waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(errors).toHaveBeenCalledWith({
      code: 'RENDER_FAILED',
      phase: 'render',
      message: 'WebGL reported an error after rendering liquid-glass materials.',
      error: expect.objectContaining({ code: 'RENDER_FAILED' }),
      materialId: undefined,
      backdropId: undefined,
      details: { glError: 0x0502, drawCalls: 0 },
    });
    context.destroy();
  });

});
