import { describe, expect, it, vi } from 'vitest';

import { GlassEngine } from '../../src/engine';
import { GlassError } from '../../src/errors/GlassError';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';
import {
  createRuntime,
  domRect,
  FakeElement,
} from '../fixtures/glass-engine';

describe('GlassEngine', () => {
  it('owns the uniform canvas and draws a custom backdrop through one material', () => {
    const runtime = createRuntime(2);
    const container = new FakeElement({ x: 10, y: 20, width: 320, height: 180 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 10, y: 20, width: 320, height: 180 }));
    const material = new FakeElement({ x: 50, y: 60, width: 120, height: 48 });
    const engine = new GlassEngine(runtime);
    const context = engine.createContext(
      container as unknown as HTMLElement,
      { renderPrecision: 1, canvasZIndex: 12 },
    );

    expect(container.children).toHaveLength(1);
    expect(context.canvas).toBe(container.children[0]);
    expect(context.canvas.className).toContain('liquid-glass-canvas');
    expect(context.canvas.getAttribute('aria-hidden')).toBe('true');
    expect(context.canvas.style.pointerEvents).toBe('none');
    expect(context.canvas.style.zIndex).toBe('12');

    const draw = vi.fn((
      drawingContext:
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D,
      width: number,
      height: number,
    ) => {
      drawingContext.fillRect(0, 0, width, height);
    });
    const rendered = vi.fn();
    context.on('materialsRendered', rendered);
    const source = context.addBackdropSource({
      kind: 'canvas',
      element: backdrop as unknown as HTMLCanvasElement,
      draw,
    });
    const handle = context.addMaterial({
      element: material as unknown as HTMLElement,
      radius: 12,
      thickness: 0.3,
      refractIndex: 1.2,
      refractIntensity: 0.8,
      blur: 0.03,
      dispersion: 0.02,
    });

    expect(draw).toHaveBeenLastCalledWith(expect.anything(), 640, 360);
    expect(runtime.canvases[5]).toMatchObject({ width: 640, height: 360 });
    expect(runtime.canvases[5].context2d.calls.filter(
      (call) => call.name === 'setTransform',
    ).every((call) => call.args.join(',') === '1,0,0,1,0,0')).toBe(true);
    expect(runtime.canvases[5].context2d.calls).toContainEqual({
      name: 'fillRect',
      args: [0, 0, 640, 360],
    });
    expect(backdrop).toMatchObject({ width: 640, height: 360 });
    expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(1);
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({
      canvas: runtime.canvases[3],
    }));

    const clearCountBeforeRemoval = callsNamed(runtime.canvases[0].gl, 'clear').length;
    handle.destroy();
    handle.destroy();
    expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(1);
    expect(callsNamed(runtime.canvases[0].gl, 'clear')).toHaveLength(
      clearCountBeforeRemoval + 1,
    );
    source.destroy();
    expect(callsNamed(runtime.canvases[0].gl, 'clear')).toHaveLength(
      clearCountBeforeRemoval + 2,
    );
    context.destroy();
    context.destroy();
    expect(container.children).toHaveLength(0);
    expect(callsNamed(runtime.canvases[0].gl, 'deleteProgram')).toHaveLength(1);
  });

  it('draws once into the owned canvas and mirrors that canvas to both consumers', () => {
    const runtime = createRuntime(2);
    const container = new FakeElement({ x: 10, y: 20, width: 200, height: 100 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 10, y: 20, width: 200, height: 100 }));
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const draw = vi.fn((
      drawingContext:
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D,
      width: number,
      height: number,
    ) => {
      drawingContext.fillRect(0, 0, width, height);
    });

    const source = context.addBackdropSource({
      kind: 'canvas',
      element: backdrop as unknown as HTMLCanvasElement,
      draw,
    });
    const ownedSource = runtime.canvases[5];

    expect(draw).toHaveBeenCalledOnce();
    expect(draw).toHaveBeenLastCalledWith(ownedSource.context2d, 400, 200);
    expect(backdrop.context2d.calls.filter((call) => call.name === 'fillRect'))
      .toHaveLength(0);
    expect(backdrop.context2d.calls.filter((call) => call.name === 'drawImage'))
      .toEqual([{ name: 'drawImage', args: [ownedSource, 0, 0] }]);
    expect(runtime.canvases[1].context2d.calls.filter((call) => call.name === 'drawImage'))
      .toEqual([{
        name: 'drawImage',
        args: [ownedSource, 0, 0, 400, 200],
      }]);

    source.refresh();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(backdrop.context2d.calls.filter((call) => call.name === 'drawImage'))
      .toHaveLength(2);
    context.refresh('scroll');
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it('uses source scale as resolution without changing composite layout', () => {
    const runtime = createRuntime(2);
    const container = new FakeElement({ x: 10, y: 20, width: 200, height: 100 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 10, y: 20, width: 200, height: 100 }));
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const draw = vi.fn();

    context.addBackdropSource({
      kind: 'canvas',
      element: backdrop as unknown as HTMLCanvasElement,
      draw,
      scale: 1.5,
    });
    const ownedSource = runtime.canvases[5];

    expect(ownedSource).toMatchObject({ width: 600, height: 300 });
    expect(backdrop).toMatchObject({ width: 600, height: 300 });
    expect(draw).toHaveBeenLastCalledWith(ownedSource.context2d, 600, 300);
    expect(runtime.canvases[1].context2d.calls.filter(
      (call) => call.name === 'drawImage',
    )).toEqual([{
      name: 'drawImage',
      args: [ownedSource, 0, 0, 400, 200],
    }]);

    context.destroy();
  });

  it('replaces options in place while preserving context and registration handles', () => {
    const runtime = createRuntime(2);
    const container = new FakeElement({ x: 0, y: 0, width: 200, height: 100 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 0, y: 0, width: 200, height: 100 }));
    const material = new FakeElement({ x: 20, y: 20, width: 80, height: 40 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
      { renderPrecision: 1, canvasZIndex: 12 },
    );
    const contextIdentity = context;
    const draw = vi.fn();
    const source = context.addBackdropSource({
      kind: 'canvas',
      element: backdrop as unknown as HTMLCanvasElement,
      draw,
    });
    const materialHandle = context.addMaterial({
      element: material as unknown as HTMLElement,
    });
    const sourceId = source.id;
    const materialId = materialHandle.id;
    const drawCount = draw.mock.calls.length;

    context.updateOptions({ renderPrecision: 0.5, canvasZIndex: 24 });

    expect(context).toBe(contextIdentity);
    expect(source).toMatchObject({ id: sourceId, destroyed: false });
    expect(materialHandle).toMatchObject({ id: materialId, destroyed: false });
    expect(context.canvas.style.zIndex).toBe('24');
    expect(context.canvas).toMatchObject({ width: 200, height: 100 });
    expect(runtime.canvases[0]).toMatchObject({ width: 200, height: 100 });
    expect(runtime.canvases[1]).toMatchObject({ width: 200, height: 100 });
    expect(runtime.canvases[5]).toMatchObject({ width: 200, height: 100 });
    expect(backdrop).toMatchObject({ width: 200, height: 100 });
    expect(draw).toHaveBeenCalledTimes(drawCount + 1);
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), 200, 100);

    context.updateOptions({});
    expect(context.canvas.style.zIndex).toBe('9999');
    expect(context.canvas).toMatchObject({ width: 400, height: 200 });
    expect(runtime.canvases[0]).toMatchObject({ width: 400, height: 200 });
    expect(runtime.canvases[5]).toMatchObject({ width: 400, height: 200 });
    expect(draw).toHaveBeenLastCalledWith(expect.anything(), 400, 200);
    expect(source).toMatchObject({ id: sourceId, destroyed: false });
    expect(materialHandle).toMatchObject({ id: materialId, destroyed: false });
  });

  it('cascades engine destruction and rejects work on destroyed contexts', () => {
    const runtime = createRuntime();
    const firstContainer = new FakeElement({ x: 0, y: 0, width: 100, height: 50 });
    const secondContainer = new FakeElement({ x: 0, y: 0, width: 100, height: 50 });
    const engine = new GlassEngine(runtime);
    const first = engine.createContext(firstContainer as unknown as HTMLElement);
    engine.createContext(secondContainer as unknown as HTMLElement);

    expect(first.canvas.style.zIndex).toBe('9999');

    engine.destroy();
    engine.destroy();
    expect(engine.destroyed).toBe(true);
    expect(first.destroyed).toBe(true);
    expect(firstContainer.children).toHaveLength(0);
    expect(secondContainer.children).toHaveLength(0);
    expect(() => first.refresh()).toThrowError(GlassError);
  });
});
