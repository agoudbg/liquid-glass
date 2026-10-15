import { describe, expect, it, vi } from 'vitest';

import { drawBackdropComposite } from '../../src/engine/canvas-backdrop';
import { FakeCanvas } from '../fixtures/fake-webgl2';
import { domRect } from '../fixtures/glass-context-rendering';

describe('canvas backdrop composition', () => {
  it('uses layout dimensions and scroll offsets for scaled canvas sources', () => {
    const composite = new FakeCanvas();
    const source = new FakeCanvas();
    const visible = new FakeCanvas();
    visible.setClientRect(domRect({ x: 70, y: 90, width: 100, height: 80 }));
    const draw = vi.fn();

    drawBackdropComposite(
      composite as unknown as HTMLCanvasElement,
      800,
      600,
      [{
        id: 'scaled-source',
        config: { kind: 'canvas', element: visible as unknown as HTMLCanvasElement, draw },
        canvas: source as unknown as HTMLCanvasElement,
        dirty: true,
        destroyed: false,
        drawVersion: 0,
      }],
      domRect({ x: 10, y: 20, width: 200, height: 150 }),
      2,
      { x: 7, y: 9 },
      { x: 0.5, y: 0.5 },
    );

    expect(draw).toHaveBeenCalledWith(source.context2d, 400, 320);
    expect(composite.context2d.calls).toContainEqual({
      name: 'drawImage', args: [source, 254, 298, 400, 320],
    });
  });

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
