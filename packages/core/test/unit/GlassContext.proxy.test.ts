import { describe, expect, it, vi } from 'vitest';

import { GlassEngine } from '../../src/engine';
import { externalMaterialConfig } from '../fixtures/external-material';
import { callsNamed, FakeCanvas } from '../fixtures/fake-webgl2';
import {
  createRuntimeHarness,
  domRect,
  FakeElement,
} from '../fixtures/glass-context-rendering';

describe('GlassContext external proxy target', () => {
  it('renders, samples, updates, and removes target-owned external materials', () => {
    const harness = createRuntimeHarness();
    const container = new FakeElement({ x: 10, y: 20, width: 240, height: 140 });
    const backdrop = new FakeCanvas();
    backdrop.setClientRect(domRect({ x: 10, y: 20, width: 240, height: 140 }));
    const context = new GlassEngine(harness.runtime).createContext(
      container as unknown as HTMLElement,
      { debug: true },
    );
    context.addBackdropSource({
      draw: () => undefined,
      element: backdrop as unknown as HTMLCanvasElement,
      kind: 'canvas',
    });
    const proxy = context.createProxyInterface();
    expect(context.createProxyInterface()).toBe(proxy);

    const handle = proxy.registerExternalMaterial(externalMaterialConfig({
      clientRect: { x: 30, y: 40, width: 100, height: 50 },
    }));
    const rendererCanvas = harness.canvases[0];
    if (!rendererCanvas) throw new Error('Missing renderer canvas.');
    expect(callsNamed(rendererCanvas.gl, 'drawArrays')).toHaveLength(1);
    expect(context.getDiagnostics().registrations).toMatchObject({
      materials: 1,
      materialsInViewport: 1,
    });

    const feedback = vi.fn();
    handle.onFeedback(feedback);
    expect(feedback).toHaveBeenCalledWith(expect.objectContaining({
      averageLuminance: 0,
      themeColorMode: expect.any(String),
    }));

    handle.update({ blur: 8 });
    expect(harness.frames.size).toBe(1);
    harness.flushFrame();
    expect(callsNamed(rendererCanvas.gl, 'drawArrays')).toHaveLength(2);

    handle.destroy();
    expect(context.getDiagnostics().registrations.materials).toBe(0);
    context.destroy();
    expect(context.getDiagnostics().resources.pendingAnimationFrames).toBe(0);
  });
});
