import { describe, expect, it, vi } from 'vitest';

import type { DomCaptureResult } from '../../src/backdrop/dom-capture';
import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';
import {
  createRuntime,
  deferred,
  FakeElement,
} from '../fixtures/glass-engine';

describe('GlassEngine DOM capture', () => {
  it('captures a bounded DOM source without recapturing it for material updates', async () => {
    const runtime = createRuntime(2);
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    runtime.requestAnimationFrame = (callback) => {
      const frameId = nextFrameId++;
      frames.set(frameId, callback);
      return frameId;
    };
    runtime.cancelAnimationFrame = (frameId) => {
      frames.delete(frameId);
    };
    runtime.getViewportRect = () => ({ x: 0, y: 0, width: 320, height: 180 });

    const capturedCanvas = new FakeCanvas();
    capturedCanvas.width = 640;
    capturedCanvas.height = 400;
    const capture = vi.fn(async (request: Parameters<
      NonNullable<GlassEngineRuntime['captureDomElement']>
    >[0]) => ({
      canvas: capturedCanvas as unknown as HTMLCanvasElement,
      viewportRect: request.captureRect ?? {
        x: 0,
        y: 0,
        width: request.element.scrollWidth,
        height: request.element.scrollHeight,
      },
    }));
    runtime.captureDomElement = capture;

    const flushFrame = (): void => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(16);
      }
    };

    const container = new FakeElement({ x: 0, y: 0, width: 320, height: 180 });
    const backdrop = new FakeElement({ x: 0, y: 0, width: 320, height: 1_000 });
    const material = new FakeElement({ x: 40, y: 50, width: 120, height: 48 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const captured = vi.fn();
    context.on('backdropCaptured', captured);

    const source = context.addBackdropSource({
      kind: 'dom',
      element: backdrop as unknown as HTMLElement,
      captureLibrary: 'html2canvas',
      viewportCapture: { enabled: true, bufferY: 20 },
    });
    expect(capture).not.toHaveBeenCalled();

    flushFrame();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({
      backdropId: source.id,
      captureRect: { x: 0, y: 0, width: 320, height: 200 },
      library: 'html2canvas',
      pixelRatio: 2,
    }));
    await vi.waitFor(() => {
      expect(captured).toHaveBeenCalledWith(expect.objectContaining({
        id: source.id,
        canvas: capturedCanvas,
      }));
    });
    await vi.waitFor(() => {
      expect(runtime.canvases[1].context2d.calls.some(
        (call) => call.name === 'drawImage',
      )).toBe(true);
    });
    const compositeDraw = runtime.canvases[1].context2d.calls.find(
      (call) => call.name === 'drawImage',
    );
    expect(compositeDraw?.args[0]).toBe(capturedCanvas);
    expect(compositeDraw?.args.slice(1)).toEqual([0, 0, 640, 400]);

    context.addMaterial({ element: material as unknown as HTMLElement });
    flushFrame();
    await vi.waitFor(() => {
      expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(1);
    });
    expect(capture).toHaveBeenCalledOnce();

    source.refresh();
    flushFrame();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
    source.destroy();
    context.destroy();
  });

  it('rejects a stale DOM capture when source options change during rasterization', async () => {
    const runtime = createRuntime();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    runtime.requestAnimationFrame = (callback) => {
      const frameId = nextFrameId++;
      frames.set(frameId, callback);
      return frameId;
    };
    runtime.cancelAnimationFrame = (frameId) => {
      frames.delete(frameId);
    };
    runtime.getViewportRect = () => ({ x: 0, y: 0, width: 200, height: 100 });
    const flushFrame = (): void => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(16);
      }
    };

    const oldCanvas = new FakeCanvas();
    const newCanvas = new FakeCanvas();
    const firstCapture = deferred<DomCaptureResult>();
    const capture = vi.fn<NonNullable<GlassEngineRuntime['captureDomElement']>>();
    capture
      .mockImplementationOnce(() => firstCapture.promise)
      .mockImplementationOnce(async (request) => ({
        canvas: newCanvas as unknown as HTMLCanvasElement,
        viewportRect: request.captureRect ?? { x: 0, y: 0, width: 200, height: 100 },
      }));
    runtime.captureDomElement = capture;

    const container = new FakeElement({ x: 0, y: 0, width: 200, height: 100 });
    const backdrop = new FakeElement({ x: 0, y: 0, width: 200, height: 100 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const source = context.addBackdropSource({
      kind: 'dom',
      element: backdrop as unknown as HTMLElement,
      backgroundColor: '#102030',
    });

    flushFrame();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    source.update({ backgroundColor: '#405060' });
    expect(capture.mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(frames.size).toBe(1);
    flushFrame();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));

    firstCapture.resolve({
      canvas: oldCanvas as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 200, height: 100 },
    });

    expect(capture.mock.calls[1]?.[0]).toMatchObject({
      backdropId: source.id,
      backgroundColor: '#405060',
    });
    await vi.waitFor(() => {
      const compositeDraws = runtime.canvases[1].context2d.calls.filter(
        (call) => call.name === 'drawImage',
      );
      expect(compositeDraws.at(-1)?.args[0]).toBe(newCanvas);
    });
    context.destroy();
  });
});
