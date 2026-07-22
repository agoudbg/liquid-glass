import { describe, expect, it } from 'vitest';

import { FallbackController } from '../../src/engine/FallbackController';

describe('FallbackController', () => {
  it('enables automatic fallback by default for either renderer failure', () => {
    const controller = new FallbackController();

    expect(controller.setRendererUnavailable(true)).toBe(true);
    expect(controller.effective).toBe(true);
    expect(controller.setContextLost(true)).toBe(false);
    expect(controller.setRendererUnavailable(false)).toBe(false);
    expect(controller.effective).toBe(true);
    expect(controller.setContextLost(false)).toBe(true);
    expect(controller.effective).toBe(false);
  });

  it('suppresses automatic causes when fallback is disabled', () => {
    const controller = new FallbackController({ enableFallback: false });

    expect(controller.setRendererUnavailable(true)).toBe(false);
    expect(controller.setContextLost(true)).toBe(false);
    expect(controller.effective).toBe(false);
    expect(controller.getSnapshot()).toEqual({
      enabled: false,
      forced: false,
      rendererUnavailable: true,
      contextLost: true,
      effective: false,
    });
  });

  it('allows forced fallback to override an opt-out and release independently', () => {
    const controller = new FallbackController({ enableFallback: false });

    expect(controller.setForced(true)).toBe(true);
    expect(controller.effective).toBe(true);
    expect(controller.setRendererUnavailable(true)).toBe(false);
    expect(controller.setForced(false)).toBe(true);
    expect(controller.effective).toBe(false);
  });

  it('re-evaluates active automatic causes when options change', () => {
    const controller = new FallbackController({ enableFallback: false });
    controller.setContextLost(true);

    expect(controller.updateOptions({ enableFallback: true })).toBe(true);
    expect(controller.updateOptions({ enableFallback: true })).toBe(false);
    expect(controller.setEnabled(false)).toBe(true);
    expect(controller.setEnabled(undefined)).toBe(true);
    expect(controller.getSnapshot().enabled).toBe(true);
  });

  it('returns detached state snapshots', () => {
    const controller = new FallbackController();
    const snapshot = controller.getSnapshot();

    controller.setForced(true);

    expect(snapshot.effective).toBe(false);
    expect(controller.getSnapshot().effective).toBe(true);
  });
});
