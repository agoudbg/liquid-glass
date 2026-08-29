import { afterEach, describe, expect, it, vi } from 'vitest';

import { requireDomCaptureFrameRuntime } from '../../src/engine/dom-capture-frame-runtime';

describe('DOM capture frame runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers injected animation-frame operations', () => {
    const callback = vi.fn<FrameRequestCallback>();
    const cancelAnimationFrame = vi.fn();
    const requestAnimationFrame = vi.fn(() => 7);
    const runtime = requireDomCaptureFrameRuntime({
      cancelAnimationFrame,
      requestAnimationFrame,
    });

    expect(runtime.requestAnimationFrame(callback)).toBe(7);
    runtime.cancelAnimationFrame(7);
    expect(requestAnimationFrame).toHaveBeenCalledWith(callback);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });

  it('falls back to global animation-frame operations', () => {
    const callback = vi.fn<FrameRequestCallback>();
    const cancelAnimationFrame = vi.fn();
    const requestAnimationFrame = vi.fn(() => 9);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const runtime = requireDomCaptureFrameRuntime({});

    expect(runtime.requestAnimationFrame(callback)).toBe(9);
    runtime.cancelAnimationFrame(9);
    expect(requestAnimationFrame).toHaveBeenCalledWith(callback);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(9);
  });

  it('rejects an environment without complete animation-frame operations', () => {
    vi.stubGlobal('cancelAnimationFrame', undefined);
    vi.stubGlobal('requestAnimationFrame', undefined);

    expect(() => requireDomCaptureFrameRuntime({})).toThrowError(
      expect.objectContaining({ code: 'LIFECYCLE_FAILED' }),
    );
  });
});
