import { describe, expect, it } from 'vitest';

import {
  calculateViewportCaptureRect,
  intersectRects,
  shouldRecaptureViewport,
} from '../../src/backdrop/viewport';

describe('calculateViewportCaptureRect', () => {
  it('converts scaled viewport intersections into source-local capture pixels', () => {
    expect(calculateViewportCaptureRect(
      { x: -20, y: -100, width: 200, height: 500 },
      { width: 400, height: 1000 },
      { x: 0, y: 0, width: 100, height: 150 },
      { enabled: true, bufferX: 10, bufferY: 20 },
      { x: 0.5, y: 0.5 },
    )).toEqual({ x: 30, y: 180, width: 220, height: 340 });
  });

  it('intersects the source with the viewport and applies bounded buffers', () => {
    expect(calculateViewportCaptureRect(
      { x: -40, y: 100, width: 500, height: 1000 },
      { width: 500, height: 1000 },
      { x: 0, y: 0, width: 320, height: 400 },
      { enabled: true, bufferX: 20, bufferY: 100 },
    )).toEqual({
      x: 20,
      y: 0,
      width: 360,
      height: 400,
    });
  });

  it('returns null outside the viewport and full bounds when disabled', () => {
    expect(calculateViewportCaptureRect(
      { x: 500, y: 500, width: 100, height: 100 },
      { width: 100, height: 100 },
      { x: 0, y: 0, width: 320, height: 400 },
      true,
    )).toBeNull();

    expect(calculateViewportCaptureRect(
      { x: 500, y: 500, width: 100, height: 100 },
      { width: 120, height: 140 },
      { x: 0, y: 0, width: 320, height: 400 },
      false,
    )).toEqual({ x: 0, y: 0, width: 120, height: 140 });
  });

  it('normalizes invalid buffers and clips only the requested axes', () => {
    expect(calculateViewportCaptureRect(
      { x: 0, y: -400, width: 200, height: 1_000 },
      { width: 200, height: 1_000 },
      { x: 0, y: 0, width: 200, height: 100 },
      { enabled: true, bufferX: -50, bufferY: Number.NaN },
    )).toEqual({ x: 0, y: 200, width: 200, height: 500 });
    expect(intersectRects(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 25, y: 25, width: 50, height: 50 },
      true,
      false,
    )).toEqual({ x: 25, y: 0, width: 50, height: 100 });
  });
});

describe('shouldRecaptureViewport', () => {
  it('reuses cached pixels until half of the vertical buffer is consumed', () => {
    const fullSize = { width: 320, height: 1000 };
    const viewport = { x: 0, y: 0, width: 320, height: 200 };
    const policy = { enabled: true, bufferY: 100 };
    const captured = { x: 0, y: 200, width: 320, height: 400 };

    expect(shouldRecaptureViewport(
      { x: 0, y: -350, width: 320, height: 1000 },
      fullSize,
      viewport,
      policy,
      captured,
    )).toBe(false);
    expect(shouldRecaptureViewport(
      { x: 0, y: -351, width: 320, height: 1000 },
      fullSize,
      viewport,
      policy,
      captured,
    )).toBe(true);
  });

  it('never recaptures disabled or fully offscreen viewport sources', () => {
    const element = { x: 500, y: 500, width: 100, height: 100 };
    const fullSize = { width: 100, height: 100 };
    const viewport = { x: 0, y: 0, width: 320, height: 200 };
    expect(shouldRecaptureViewport(element, fullSize, viewport, false, null))
      .toBe(false);
    expect(shouldRecaptureViewport(element, fullSize, viewport, true, null))
      .toBe(false);
  });

  it('recaptures horizontal movement when no horizontal buffer is configured', () => {
    expect(shouldRecaptureViewport(
      { x: -101, y: 0, width: 500, height: 200 },
      { width: 500, height: 200 },
      { x: 0, y: 0, width: 200, height: 200 },
      { enabled: true, bufferX: 0 },
      { x: 100, y: 0, width: 200, height: 200 },
    )).toBe(true);
  });
});
