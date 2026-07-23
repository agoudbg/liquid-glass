import { describe, expect, it, vi } from 'vitest';

import {
  addHarnessMaterial,
  mountMaterialContext,
} from '../fixtures/material-context';

function solidPixels(
  width: number,
  height: number,
  value: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return data;
}

describe('GlassContext automatic theme presentation', () => {
  it('publishes per-material samples through presentation and typed events', () => {
    const mounted = mountMaterialContext();
    const feedback = vi.fn();
    const rendered = vi.fn();
    mounted.context.on('materialFeedback', feedback);
    mounted.context.on('materialsRendered', rendered);

    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 120, height: 80 },
    );
    const presentationModes: string[] = [];
    handle.onPresentation(({ themeColorMode }) => {
      presentationModes.push(themeColorMode);
    });

    expect(handle.getPresentation().themeColorMode).toBe('ultra_dark');
    expect(feedback).toHaveBeenLastCalledWith(handle.id, {
      type: 'theme-changed',
      themeColorMode: 'ultra_dark',
      averageLuminance: 0,
    });
    expect(rendered).toHaveBeenLastCalledWith({
      canvas: mounted.context.canvas,
      themeColors: { [handle.id]: 'ultra_dark' },
    });

    const composite = mounted.harness.canvases[1];
    if (!composite) throw new Error('Missing composite canvas.');
    composite.context2d.pixelData = solidPixels(
      composite.width,
      composite.height,
      100,
    );
    mounted.context.refresh();

    expect(handle.getPresentation().themeColorMode).toBe('light');
    expect(feedback).toHaveBeenLastCalledWith(handle.id, {
      type: 'theme-changed',
      themeColorMode: 'light',
      averageLuminance: 100,
    });
    expect(rendered).toHaveBeenLastCalledWith({
      canvas: mounted.context.canvas,
      themeColors: { [handle.id]: 'light' },
    });

    mounted.context.updateOptions({
      themeColorThresholds: { darkMax: 120 },
    });

    expect(handle.getPresentation().themeColorMode).toBe('dark');
    expect(feedback).toHaveBeenLastCalledWith(handle.id, {
      type: 'theme-changed',
      themeColorMode: 'dark',
      averageLuminance: 100,
    });
    expect(presentationModes).toEqual(['ultra_dark', 'light', 'dark']);

    mounted.context.destroy();
  });

  it('preserves presentation during a tainted read and recovers on refresh', () => {
    const mounted = mountMaterialContext();
    const errors = vi.fn();
    const rendered = vi.fn();
    mounted.context.on('error', errors);
    mounted.context.on('materialsRendered', rendered);
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 120, height: 80 },
    );
    const composite = mounted.harness.canvases[1];
    if (!composite) throw new Error('Missing composite canvas.');

    composite.context2d.pixelData = solidPixels(
      composite.width,
      composite.height,
      100,
    );
    mounted.context.refresh();
    expect(handle.getPresentation().themeColorMode).toBe('light');
    errors.mockClear();
    rendered.mockClear();

    composite.context2d.pixelData = solidPixels(
      composite.width,
      composite.height,
      240,
    );
    composite.context2d.pixelReadError = new DOMException(
      'The canvas has been tainted.',
      'SecurityError',
    );
    expect(() => mounted.context.refresh()).not.toThrow();

    expect(handle.getPresentation().themeColorMode).toBe('light');
    expect(rendered).toHaveBeenLastCalledWith({
      canvas: mounted.context.canvas,
    });
    expect(errors).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({
      code: 'CAPTURE_FAILED',
      message: 'Failed to read backdrop pixels for automatic theme sampling.',
      phase: 'capture',
    }));

    composite.context2d.pixelReadError = null;
    mounted.context.refresh();

    expect(handle.getPresentation().themeColorMode).toBe('ultra_light');
    expect(rendered).toHaveBeenLastCalledWith({
      canvas: mounted.context.canvas,
      themeColors: { [handle.id]: 'ultra_light' },
    });
    expect(errors).toHaveBeenCalledOnce();

    mounted.context.destroy();
  });

  it('releases backdrop sampling caches during context teardown', () => {
    const mounted = mountMaterialContext();
    const coordinator = (
      mounted.context as unknown as {
        renderCoordinator: {
          backdropPixels: unknown;
          backdropTextureReady: boolean;
        };
      }
    ).renderCoordinator;

    expect(coordinator.backdropPixels).not.toBeNull();
    expect(coordinator.backdropTextureReady).toBe(true);

    mounted.context.destroy();

    expect(coordinator.backdropPixels).toBeNull();
    expect(coordinator.backdropTextureReady).toBe(false);
  });
});
