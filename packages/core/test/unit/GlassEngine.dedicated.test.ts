import { describe, expect, it, vi } from 'vitest';

import { GlassEngine } from '../../src/engine';
import type { RenderMode } from '../../src/types';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';
import {
  createRuntime,
  domRect,
  FakeElement,
} from '../fixtures/glass-engine';

function addBackdrop(
  context: ReturnType<GlassEngine['createContext']>,
  rect: { x: number; y: number; width: number; height: number },
): void {
  const backdrop = new FakeCanvas();
  backdrop.setClientRect(domRect(rect));
  context.addBackdropSource({
    kind: 'canvas',
    element: backdrop as unknown as HTMLCanvasElement,
    draw: vi.fn((drawingContext) => {
      drawingContext.fillRect(0, 0, rect.width, rect.height);
    }),
  });
}

describe('GlassEngine dedicated presentation', () => {
  it('rejects unknown context render modes before attaching canvases', () => {
    const runtime = createRuntime();
    const container = new FakeElement({
      x: 0,
      y: 0,
      width: 120,
      height: 80,
    });

    expect(() => new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
      { renderMode: 'unknown' as RenderMode },
    )).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(container.children).toHaveLength(0);
  });

  it('presents inherited dedicated materials and reports owned canvases', () => {
    const runtime = createRuntime(2);
    const rect = { x: 0, y: 0, width: 240, height: 140 };
    const container = new FakeElement(rect);
    const material = new FakeElement({
      x: 30,
      y: 20,
      width: 80,
      height: 40,
    });
    material.parentElement = container as unknown as HTMLElement;
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
      { renderMode: 'dedicated' },
    );
    addBackdrop(context, rect);
    const materialsRendered = vi.fn();
    const fullCanvasRendered = vi.fn();
    context.on('materialsRendered', materialsRendered);
    context.on('fullCanvasRendered', fullCanvasRendered);

    context.addMaterial({
      element: material as unknown as HTMLElement,
      radius: 12,
    });

    const dedicated = material.children[0];
    expect(dedicated).toMatchObject({
      className: 'liquid-glass-dedicated-canvas',
      width: 160,
      height: 80,
    });
    expect(dedicated?.getAttribute('data-liquid-glass-canvas')).toBe('dedicated');
    expect(dedicated?.context2d.calls.at(-1)).toEqual({
      name: 'drawImage',
      args: [
        runtime.canvases[0],
        60,
        40,
        160,
        80,
        0,
        0,
        160,
        80,
      ],
    });
    expect(context.getDiagnostics()).toMatchObject({
      mode: { renderMode: 'dedicated' },
      resources: { ownedCanvases: 7 },
    });
    expect(callsNamed(runtime.canvases[0].gl, 'drawArrays')).toHaveLength(1);
    expect(materialsRendered).toHaveBeenLastCalledWith({
      canvas: runtime.canvases[3],
      themeColors: expect.any(Object),
    });
    expect(runtime.canvases[3]?.context2d.calls.at(-1)).toEqual({
      name: 'drawImage',
      args: [runtime.canvases[0], 0, 0, 480, 280],
    });
    expect(fullCanvasRendered).toHaveBeenLastCalledWith({
      canvas: runtime.canvases[4],
      width: 480,
      height: 280,
    });
    expect(runtime.canvases[4]?.context2d.calls.slice(-2)).toEqual([
      {
        name: 'drawImage',
        args: [
          runtime.canvases[1],
          0,
          0,
          480,
          280,
          0,
          0,
          480,
          280,
        ],
      },
      {
        name: 'drawImage',
        args: [
          runtime.canvases[3],
          0,
          0,
          480,
          280,
          0,
          0,
          480,
          280,
        ],
      },
    ]);

    context.destroy();
    expect(material.children).toHaveLength(0);
    expect(dedicated).toMatchObject({ width: 0, height: 0 });
    expect(context.getDiagnostics().resources.ownedCanvases).toBe(0);
  });

  it('supports mixed overrides, fallback, and live context-mode switching', () => {
    const runtime = createRuntime();
    const rect = { x: 0, y: 0, width: 260, height: 160 };
    const container = new FakeElement(rect);
    const inherited = new FakeElement({
      x: 20,
      y: 20,
      width: 90,
      height: 44,
    });
    const uniform = new FakeElement({
      x: 130,
      y: 72,
      width: 90,
      height: 44,
    });
    inherited.parentElement = container as unknown as HTMLElement;
    uniform.parentElement = container as unknown as HTMLElement;
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
      { renderMode: 'dedicated', canvasZIndex: 14 },
    );
    addBackdrop(context, rect);
    const inheritedHandle = context.addMaterial({
      element: inherited as unknown as HTMLElement,
    });
    const drawsBeforeMixedFrame = callsNamed(
      runtime.canvases[0].gl,
      'drawArrays',
    ).length;
    context.addMaterial({
      element: uniform as unknown as HTMLElement,
      renderMode: 'uniform',
    });
    expect(
      callsNamed(runtime.canvases[0].gl, 'drawArrays').length
      - drawsBeforeMixedFrame,
    ).toBe(2);
    expect(runtime.canvases[2]?.context2d.calls.at(-1)).toEqual({
      name: 'clearRect',
      args: [20, 20, 90, 44],
    });

    const firstDedicated = inherited.children[0];
    expect(firstDedicated).toBeDefined();
    expect(uniform.children).toHaveLength(0);
    expect(context.canvas.style.zIndex).toBe('14');

    context.setFallbackMode(true);
    expect(firstDedicated?.style.visibility).toBe('hidden');
    expect(firstDedicated?.style.opacity).toBe('0');
    context.setFallbackMode(false);
    expect(firstDedicated?.style.visibility).toBe('inherit');
    expect(firstDedicated?.style.opacity).toBe('1');

    context.updateOptions({
      renderMode: 'uniform',
      canvasZIndex: 22,
    });
    expect(inherited.children).toHaveLength(0);
    expect(firstDedicated).toMatchObject({ width: 0, height: 0 });
    expect(context.canvas.style.zIndex).toBe('22');
    expect(context.getDiagnostics()).toMatchObject({
      mode: { renderMode: 'uniform' },
      resources: { ownedCanvases: 6 },
    });

    context.updateOptions({ renderMode: 'dedicated' });
    expect(inherited.children).toHaveLength(1);
    expect(inherited.children[0]).not.toBe(firstDedicated);
    expect(uniform.children).toHaveLength(0);
    expect(context.getDiagnostics().resources.ownedCanvases).toBe(7);

    inheritedHandle.destroy();
    expect(inherited.children).toHaveLength(0);
    context.destroy();
  });
});
