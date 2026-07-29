import { describe, expect, it, vi } from 'vitest';

import { GlassEngine } from '../../src/engine';
import type { GlassContext, RectLike } from '../../src/types';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';
import {
  createRuntimeHarness,
  domRect,
  FakeElement,
} from '../fixtures/glass-context-rendering';

function addBackdrop(context: GlassContext, rect: RectLike): void {
  const backdrop = new FakeCanvas();
  backdrop.setClientRect(domRect(rect));
  context.addBackdropSource({
    draw: () => undefined,
    element: backdrop as unknown as HTMLCanvasElement,
    kind: 'canvas',
  });
}

describe('GlassContext outgoing material delegation', () => {
  it('moves rendering and theme feedback between source and target contexts', () => {
    const harness = createRuntimeHarness();
    const engine = new GlassEngine(harness.runtime);
    const sourceRect = { x: 0, y: 0, width: 320, height: 200 };
    const targetRect = { x: 20, y: 20, width: 240, height: 160 };
    const sourceElement = new FakeElement(sourceRect);
    const source = engine.createContext(
      sourceElement as unknown as HTMLElement,
      { debug: true },
    );
    const sourceRenderer = harness.canvases[0];
    const targetRendererIndex = harness.canvases.length;
    const target = engine.createContext(
      new FakeElement(targetRect) as unknown as HTMLElement,
      { debug: true },
    );
    const targetRenderer = harness.canvases[targetRendererIndex];
    if (!sourceRenderer || !targetRenderer) {
      throw new Error('Missing source or target renderer canvas.');
    }
    addBackdrop(source, sourceRect);
    addBackdrop(target, targetRect);

    const material = new FakeElement({
      x: 60,
      y: 70,
      width: 100,
      height: 50,
    });
    (material as unknown as { parentElement: HTMLElement }).parentElement = (
      sourceElement as unknown as HTMLElement
    );
    const feedback = vi.fn();
    source.on('materialFeedback', feedback);
    const targetProxy = target.createProxyInterface();

    const handle = source.addMaterial({
      element: material as unknown as HTMLElement,
      proxyTarget: targetProxy,
      radius: 12,
    });

    expect(callsNamed(sourceRenderer.gl, 'drawArrays')).toHaveLength(0);
    expect(callsNamed(targetRenderer.gl, 'drawArrays')).toHaveLength(1);
    expect(source.getDiagnostics()).toMatchObject({
      registrations: { materials: 1 },
      scheduling: {
        delegation: {
          activeMaterials: 1,
          pendingFrame: true,
        },
      },
      resources: { pendingAnimationFrames: 1 },
    });
    expect(target.getDiagnostics().registrations).toMatchObject({
      materials: 1,
      materialsInViewport: 1,
    });
    expect(feedback).toHaveBeenCalledWith(handle.id, {
      type: 'theme-changed',
      themeColorMode: 'ultra_dark',
      averageLuminance: 0,
    });

    handle.update({ blur: 8 });
    harness.flushFrame();
    expect(callsNamed(sourceRenderer.gl, 'drawArrays')).toHaveLength(0);
    expect(callsNamed(targetRenderer.gl, 'drawArrays')).toHaveLength(2);

    handle.update({ proxyTarget: undefined });
    harness.flushFrame();
    expect(source.getDiagnostics().scheduling.delegation).toMatchObject({
      activeMaterials: 0,
      pendingFrame: false,
    });
    expect(target.getDiagnostics().registrations.materials).toBe(0);
    expect(callsNamed(sourceRenderer.gl, 'drawArrays')).toHaveLength(1);

    handle.update({ proxyTarget: targetProxy });
    expect(target.getDiagnostics().registrations.materials).toBe(1);
    handle.destroy();
    expect(target.getDiagnostics().registrations.materials).toBe(0);

    source.destroy();
    target.destroy();
    expect(source.getDiagnostics().resources.pendingAnimationFrames).toBe(0);
    expect(target.getDiagnostics().resources.pendingAnimationFrames).toBe(0);
  });
});
