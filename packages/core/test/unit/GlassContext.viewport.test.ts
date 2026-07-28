import { describe, expect, it } from 'vitest';

import {
  GlassEngine,
  type GlassEngineRuntime,
} from '../../src/engine';
import type { CanvasRenderPayload } from '../../src/types';
import { FakeCanvas } from '../fixtures/fake-webgl2';
import {
  createRuntimeHarness,
  domRect,
  FakeContextElement,
  FakeElement,
  MissingWebGlCanvas,
} from '../fixtures/glass-context-rendering';

describe('GlassContext viewport presentation', () => {
  it('sizes the canvas from the client box while retaining border-box origins', () => {
    const harness = createRuntimeHarness(1.5);
    const container = new FakeElement(
      { x: 10, y: 20, width: 201, height: 99 },
      { width: 199, height: 97 },
    );
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 11, y: 21, width: 199, height: 97 }));
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );

    context.addBackdropSource({
      draw: () => undefined,
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });

    expect(context.canvas).toMatchObject({ width: 299, height: 146 });
    expect(harness.canvases[1]?.context2d.calls).toContainEqual({
      name: 'drawImage',
      args: [harness.canvases[5], 1.5, 1.5, 298.5, 145.5],
    });
    context.destroy();
  });

  it('retains transformed bounding dimensions for viewport-coordinate rendering', () => {
    const harness = createRuntimeHarness(1.5, 'matrix(2, 0, 0, 2, 0, 0)');
    const container = new FakeElement(
      { x: 10, y: 20, width: 402, height: 198 },
      { width: 199, height: 97 },
    );
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
    );

    context.refresh();

    expect(context.canvas).toMatchObject({ width: 603, height: 297 });
    context.destroy();
  });

  it('separates full-content scrolling from viewport-limited presentation', () => {
    const harness = createRuntimeHarness();
    const content = new FakeElement(
      { x: 43, y: 43, width: 1_354, height: 758 },
      { width: 1_354, height: 758 },
      { width: 1_354, height: 1_680 },
    );
    content.scrollTop = 360;
    const container = new FakeContextElement(
      { x: 42, y: 42, width: 1_356, height: 760 },
      { width: 1_354, height: 758 },
      content,
    );
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({
      x: 43,
      y: -317,
      width: 1_354,
      height: 1_680,
    }));
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
      { scrollable: true },
    );
    const fullFrames: CanvasRenderPayload[] = [];
    context.on('fullCanvasRendered', (payload) => fullFrames.push(payload));

    context.addBackdropSource({
      draw: () => undefined,
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });

    expect(content.children).toEqual([context.canvas]);
    expect(context.canvas).toMatchObject({ width: 1_354, height: 1_680 });
    expect((context.canvas as unknown as FakeCanvas).style).toMatchObject({
      height: '1680px',
      transform: '',
      width: '1354px',
    });
    expect(harness.canvases[1]?.context2d.calls).toContainEqual({
      name: 'drawImage',
      args: [harness.canvases[5], 1, 1, 1_354, 1_680],
    });
    expect(fullFrames.at(-1)).toEqual({
      canvas: harness.canvases[4],
      width: 1_354,
      height: 758,
    });
    expect(harness.canvases[4]?.context2d.calls.slice(-2)).toEqual([
      {
        name: 'drawImage',
        args: [
          harness.canvases[1],
          0,
          360,
          1_354,
          758,
          0,
          0,
          1_354,
          758,
        ],
      },
      {
        name: 'drawImage',
        args: [
          harness.canvases[3],
          0,
          360,
          1_354,
          758,
          0,
          0,
          1_354,
          758,
        ],
      },
    ]);

    content.setScrollSize({ width: 1_354, height: 1_200 });
    context.refresh();

    expect(context.canvas).toMatchObject({ width: 1_354, height: 1_200 });
    expect((context.canvas as unknown as FakeCanvas).style).toMatchObject({
      height: '1200px',
      transform: '',
      width: '1354px',
    });
    expect((context.canvas as unknown as FakeCanvas).style.display)
      .not.toBe('none');

    context.setViewportMode(true);

    expect(context.canvas).toMatchObject({ width: 1_354, height: 758 });
    expect((context.canvas as unknown as FakeCanvas).style).toMatchObject({
      height: '758px',
      transform: 'translate3d(0px, 360px, 0)',
      width: '1354px',
    });
    expect(fullFrames.at(-1)).toEqual({
      canvas: harness.canvases[4],
      width: 1_354,
      height: 758,
    });
    expect(harness.canvases[4]?.context2d.calls.slice(-2)).toEqual([
      {
        name: 'drawImage',
        args: [
          harness.canvases[1],
          0,
          0,
          1_354,
          758,
          0,
          0,
          1_354,
          758,
        ],
      },
      {
        name: 'drawImage',
        args: [
          harness.canvases[3],
          0,
          0,
          1_354,
          758,
          0,
          0,
          1_354,
          758,
        ],
      },
    ]);
    context.destroy();
  });

  it.each([false, true])(
    'clamps a zero-sized client box consistently (fallback: %s)',
    (fallback) => {
      const harness = createRuntimeHarness(2);
      const container = new FakeElement(
        { x: 10, y: 20, width: 2, height: 2 },
        { width: 0, height: 0 },
      );
      const context = new GlassEngine(harness.runtime).createContext(
        container as unknown as HTMLElement,
      );

      if (fallback) context.setFallbackMode(true);
      context.refresh();

      expect(context.canvas).toMatchObject({ width: 2, height: 2 });
      context.destroy();
    },
  );

  it.each([
    ['forced fallback', false],
    ['missing renderer', true],
  ])('resizes the %s canvas when DPR changes', (_label, missingRenderer) => {
    let devicePixelRatio = 1;
    let canvasIndex = 0;
    const container = new FakeElement({ x: 0, y: 0, width: 123, height: 45 });
    const runtime: GlassEngineRuntime = {
      createCanvas: () => {
        const canvas = missingRenderer && canvasIndex === 0
          ? new MissingWebGlCanvas()
          : new FakeCanvas();
        canvasIndex += 1;
        return canvas as unknown as HTMLCanvasElement;
      },
      devicePixelRatio: () => devicePixelRatio,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
    };
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    if (!missingRenderer) context.setFallbackMode(true);
    context.refresh();
    expect(context.canvas).toMatchObject({ width: 123, height: 45 });

    devicePixelRatio = 2.25;
    context.refresh();

    expect(context.canvas).toMatchObject({ width: 277, height: 101 });
    context.destroy();
  });
});
