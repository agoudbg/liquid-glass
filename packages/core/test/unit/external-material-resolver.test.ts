import { describe, expect, it } from 'vitest';

import { resolveExternalRendererMaterial } from '../../src/engine/external-material-resolver';
import { externalMaterialConfig } from '../fixtures/external-material';
import { domRect } from '../fixtures/glass-context-rendering';

describe('resolveExternalRendererMaterial', () => {
  it('removes viewport transform effects and applies target scroll', () => {
    const material = resolveExternalRendererMaterial(
      'external-1',
      externalMaterialConfig({
        clientRect: { x: 50, y: 50, width: 100, height: 40 },
        transform: {
          scaleX: 2,
          scaleY: 2,
          translateX: 10,
          translateY: 4,
        },
      }),
      domRect({ x: 10, y: 20, width: 200, height: 100 }),
      { x: 7, y: 9 },
    );

    expect(material).toMatchObject({
      id: 'external-1',
      matrix: [2, 0, 0, 2, 0, 0],
      opacity: 1,
      radii: [16, 20, 24, 12],
      rect: {
        x: 62,
        y: 45,
        width: 50,
        height: 20,
      },
    });
  });

  it('preserves legacy zero-scale sizing while culling outside materials', () => {
    const containerRect = domRect({ x: 0, y: 0, width: 200, height: 100 });
    const zeroScale = resolveExternalRendererMaterial(
      'zero-scale',
      externalMaterialConfig({
        transform: {
          scaleX: 0,
          scaleY: 0,
          translateX: 0,
          translateY: 0,
        },
      }),
      containerRect,
      { x: 0, y: 0 },
    );
    expect(zeroScale?.rect).toMatchObject({ width: 120, height: 60 });

    expect(resolveExternalRendererMaterial(
      'outside',
      externalMaterialConfig({
        clientRect: { x: 500, y: 500, width: 20, height: 20 },
      }),
      containerRect,
      { x: 0, y: 0 },
    )).toBeNull();
  });
});
