import { describe, expect, it } from 'vitest';

import { drawBackdropComposite } from '../../src/engine/canvas-backdrop';
import { FakeCanvas } from '../fixtures/fake-webgl2';
import { domRect } from '../fixtures/glass-context-rendering';

describe('canvas backdrop composition', () => {
  it('creates the composite context for repeated theme readback', () => {
    const canvas = new FakeCanvas();

    drawBackdropComposite(
      canvas as unknown as HTMLCanvasElement,
      120,
      80,
      [],
      domRect({ height: 80, width: 120, x: 0, y: 0 }),
      1,
    );

    expect(canvas.context2dSettings).toEqual([{
      willReadFrequently: true,
    }]);
  });
});
