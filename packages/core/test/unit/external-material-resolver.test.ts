import { describe, expect, it } from 'vitest';

import { resolveExternalRendererMaterial } from '../../src/engine/external-material-resolver';
import { externalMaterialConfig } from '../fixtures/external-material';
import { domRect } from '../fixtures/glass-context-rendering';

describe('resolveExternalRendererMaterial', () => {
  it('maps viewport bounds into a scaled target without scaling scroll offsets', () => {
    expect(resolveExternalRendererMaterial(
      'scaled-target',
      externalMaterialConfig({
        clientRect: { x: 60, y: 40, width: 50, height: 20 },
      }),
      domRect({ x: 10, y: 20, width: 200, height: 75 }),
      { x: 7, y: 9 },
      { x: 0.5, y: 0.25 },
    )?.rect).toEqual({ x: 107, y: 89, width: 100, height: 80 });
  });

  it('preserves translated viewport bounds and applies target scroll', () => {
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
        x: 72,
        y: 49,
        width: 50,
        height: 20,
      },
    });
  });

  it('culls against transformed bounds at both canvas edges', () => {
    const container = domRect({ x: 0, y: 0, width: 200, height: 100 });
    const resolve = (x: number, translateX: number) => resolveExternalRendererMaterial(
      'translated',
      externalMaterialConfig({
        clientRect: { x, y: 20, width: 100, height: 40 },
        transform: { scaleX: 2, scaleY: 1, translateX, translateY: 0 },
      }),
      container,
      { x: 0, y: 0 },
    );

    expect(resolve(-80, -100)).not.toBeNull();
    expect(resolve(180, 100)).not.toBeNull();
    expect(resolve(210, 100)).toBeNull();
    expect(resolve(-110, -100)).toBeNull();
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
