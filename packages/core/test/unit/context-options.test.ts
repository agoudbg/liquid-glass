import { describe, expect, it, vi } from 'vitest';

import { GlassEngine } from '../../src/engine';
import {
  resolveContextPrecision,
  snapshotContextOptions,
} from '../../src/engine/context-options';
import type { GlassContextOptions, TextureDirtyReason } from '../../src/types';
import { createRuntime, FakeElement } from '../fixtures/glass-engine';

describe('context options', () => {
  it('creates a detached canonical snapshot while preserving precision semantics', () => {
    const themeColorThresholds = { darkMax: 100 };
    const snapshot = snapshotContextOptions({
      canvasZIndex: 12,
      debug: true,
      enableBlurredEffect: false,
      enableFallback: true,
      renderPrecision: Number.NaN,
      scrollable: false,
      themeColorThresholds,
    });
    themeColorThresholds.darkMax = 120;

    expect(snapshot).toEqual({
      canvasZIndex: 12,
      debug: true,
      enableBlurredEffect: false,
      enableFallback: true,
      renderMode: 'uniform',
      renderPrecision: Number.NaN,
      scrollable: false,
      themeColorThresholds: {
        darkMax: 100,
        ultraDarkMax: 25,
        ultraLightMin: 230,
      },
    });
    expect(resolveContextPrecision(snapshot)).toBe(1);
    expect(resolveContextPrecision({ renderPrecision: -1 })).toBe(0.05);
  });

  it.each([
    ['options', null],
    ['unknown field', { extra: true }],
    ['debug', { debug: 'false' }],
    ['enableBlurredEffect', { enableBlurredEffect: 1 }],
    ['enableFallback', { enableFallback: 'true' }],
    ['scrollable', { scrollable: 'false' }],
    ['canvasZIndex', { canvasZIndex: Number.POSITIVE_INFINITY }],
    ['renderPrecision', { renderPrecision: '1' }],
    ['renderMode', { renderMode: 'shared' }],
    ['theme thresholds', { themeColorThresholds: [] }],
    ['theme threshold field', { themeColorThresholds: { extra: 1 } }],
  ])('rejects invalid %s before returning a snapshot', (_name, value) => {
    expect(() => snapshotContextOptions(
      value as unknown as GlassContextOptions,
    )).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
  });

  it('rejects invalid creation before allocating or attaching canvases', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 120, height: 80 });

    expect(() => new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
      { debug: 'false' } as unknown as GlassContextOptions,
    )).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(runtime.canvases).toHaveLength(0);
    expect(container.children).toHaveLength(0);
  });

  it('rejects an invalid container before allocating rendering resources', () => {
    const runtime = createRuntime();

    expect(() => new GlassEngine(runtime).createContext(
      {} as HTMLElement,
    )).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(runtime.canvases).toHaveLength(0);
  });

  it('rejects invalid imperative inputs without changing context state', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 120, height: 80 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
    );
    const fallbackChanged = vi.fn();
    const viewportChanged = vi.fn();
    const compositeRequested = vi.fn();
    context.on('fallbackModeChanged', fallbackChanged);
    context.on('viewportModeChanged', viewportChanged);
    context.on('compositeRequested', compositeRequested);

    expect(() => context.setFallbackMode(
      'false' as unknown as boolean,
    )).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(() => context.setViewportMode(
      'false' as unknown as boolean,
    )).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(() => context.refresh(
      'animation' as unknown as TextureDirtyReason,
    )).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));

    expect(context.fallbackMode).toBe(false);
    expect(container.getAttribute('data-lg-fallback')).toBe('false');
    expect(context.canvas.className).toBe('liquid-glass-canvas');
    expect(fallbackChanged).not.toHaveBeenCalled();
    expect(viewportChanged).not.toHaveBeenCalled();
    expect(compositeRequested).not.toHaveBeenCalled();
    context.destroy();
  });

  it('leaves a live context unchanged after an invalid update', () => {
    const runtime = createRuntime();
    const container = new FakeElement({ x: 0, y: 0, width: 120, height: 80 });
    const context = new GlassEngine(runtime).createContext(
      container as unknown as HTMLElement,
      { canvasZIndex: 12, debug: false, scrollable: false },
    );
    const before = context.getDiagnostics();

    expect(() => context.updateOptions({
      scrollable: 'false',
    } as unknown as GlassContextOptions)).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    );
    expect(context.canvas.style.zIndex).toBe('12');
    expect(context.getDiagnostics()).toEqual(before);
    context.destroy();
  });
});
