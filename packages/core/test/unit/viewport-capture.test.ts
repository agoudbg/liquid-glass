import { describe, expect, it } from 'vitest';

import { calculateViewportCaptureRect } from '../../src/backdrop/viewport';

describe('calculateViewportCaptureRect', () => {
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
});
