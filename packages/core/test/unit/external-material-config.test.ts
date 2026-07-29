import { describe, expect, it } from 'vitest';

import {
  prepareExternalMaterialUpdate,
  snapshotExternalMaterialConfig,
} from '../../src/engine/external-material-config';
import { GlassError } from '../../src/errors/GlassError';
import type { ExternalMaterialConfig } from '../../src/types/external-material';
import { externalMaterialConfig } from '../fixtures/external-material';

describe('external material configuration', () => {
  it('validates and detaches every nested value', () => {
    const input = externalMaterialConfig();
    const snapshot = snapshotExternalMaterialConfig(input);

    input.clientRect.x = 999;
    input.borderRadius.topLeft = 999;
    input.transform.translateX = 999;

    expect(snapshot).toEqual(externalMaterialConfig());
    expect(snapshot.clientRect).not.toBe(input.clientRect);
    expect(snapshot.borderRadius).not.toBe(input.borderRadius);
    expect(snapshot.transform).not.toBe(input.transform);
  });

  it('merges isolated updates and rejects semantic no-ops', () => {
    const current = externalMaterialConfig();
    const nextRect = { x: 80, y: 40, width: 100, height: 50 };
    const updated = prepareExternalMaterialUpdate(current, {
      blur: 7,
      clientRect: nextRect,
    });

    nextRect.x = 900;
    expect(updated).toEqual(externalMaterialConfig({
      blur: 7,
      clientRect: { x: 80, y: 40, width: 100, height: 50 },
    }));
    expect(prepareExternalMaterialUpdate(current, { blur: current.blur }))
      .toBeNull();
  });

  it.each([
    externalMaterialConfig({ blur: Number.NaN }),
    externalMaterialConfig({
      clientRect: { x: 0, y: 0, width: -1, height: 10 },
    }),
    externalMaterialConfig({
      transform: {
        scaleX: -1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
      },
    }),
    {
      ...externalMaterialConfig(),
      unknown: true,
    } as unknown as ExternalMaterialConfig,
  ])('rejects malformed complete input', (input) => {
    expect(() => snapshotExternalMaterialConfig(input))
      .toThrowError(expect.objectContaining<Partial<GlassError>>({
        code: 'INVALID_CONFIG',
      }));
  });

  it('rejects incomplete nested updates', () => {
    expect(() => prepareExternalMaterialUpdate(
      externalMaterialConfig(),
      {
        clientRect: { x: 1 } as ExternalMaterialConfig['clientRect'],
      },
    )).toThrowError(expect.objectContaining<Partial<GlassError>>({
      code: 'INVALID_CONFIG',
    }));
  });
});
