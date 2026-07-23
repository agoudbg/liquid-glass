import { describe, expect, it } from 'vitest';

import {
  getSceneDefinition,
  SCENE_DEFINITIONS,
  SCENE_IDS,
} from '../src/shared/scene-catalog';
import {
  getBackdropDraw,
  isDomCaptureScene,
  isScrollCaptureScene,
  resolveViewportCapture,
} from '../src/shared/scene-backdrops';
import { resolveSceneMaterials } from '../src/shared/scene-materials';
import { createInitialState } from '../src/shell/state';

describe('playground scene model', () => {
  it('keeps navigation order and scene metadata in one catalog', () => {
    expect(SCENE_DEFINITIONS.map(({ id }) => id)).toEqual(SCENE_IDS);
    expect(SCENE_DEFINITIONS).toEqual([
      expect.objectContaining({
        id: 'S001',
        title: 'Single material',
        materialCount: 1,
        captureKind: 'canvas',
        supportsOracle: true,
      }),
      expect.objectContaining({
        id: 'S002',
        title: 'Material overlap',
        materialCount: 3,
        captureKind: 'canvas',
        supportsOracle: true,
      }),
      expect.objectContaining({
        id: 'S003',
        title: 'DOM capture',
        captureKind: 'dom',
        stageSource: '01 / DOM SOURCE',
      }),
      expect.objectContaining({
        id: 'S005',
        title: 'Body scroll',
        captureKind: 'body-scroll',
        stageSource: '05 / BODY SCROLL',
      }),
      expect.objectContaining({
        id: 'S006',
        title: 'Internal scroll',
        captureKind: 'internal-scroll',
        scrollableByDefault: true,
        viewportByDefault: true,
      }),
      expect.objectContaining({
        id: 'S007',
        title: 'Fallback recovery',
        captureKind: 'canvas',
        fallbackByDefault: true,
      }),
    ]);
  });

  it('derives capture policies from catalog definitions', () => {
    expect(SCENE_IDS.filter(isDomCaptureScene)).toEqual(['S003', 'S005', 'S006']);
    expect(SCENE_IDS.filter(isScrollCaptureScene)).toEqual(['S005', 'S006']);

    const viewportState = createInitialState(new URL(
      'https://example.test/?scene=S006',
    ));
    expect(resolveViewportCapture(viewportState)).toEqual({
      bufferX: 80,
      bufferY: 180,
      enabled: true,
    });
    expect(resolveViewportCapture({
      ...viewportState,
      viewportEnabled: false,
    })).toBe(false);
  });

  it('preserves stable canvas callbacks and canonical material sets', () => {
    const singleDraw = getBackdropDraw('S001');
    expect(getBackdropDraw('S001')).toBe(singleDraw);
    expect(getBackdropDraw('S003')).toBe(singleDraw);
    expect(getBackdropDraw('S002')).not.toBe(singleDraw);
    expect(getBackdropDraw('S001', true)).toBe(getBackdropDraw('S002', true));

    const singleState = createInitialState(new URL('https://example.test/'));
    expect(resolveSceneMaterials(singleState).map(({ id }) => id)).toEqual(['primary']);
    expect(resolveSceneMaterials({
      ...singleState,
      scene: 'S002',
    }).map(({ id }) => id)).toEqual(['primary', 'secondary', 'tertiary']);
    expect(resolveSceneMaterials(createInitialState(new URL(
      'https://example.test/?scene=S002&oracle=1',
    ))).map(({ id }) => id)).toEqual(['s002-a', 's002-b', 's002-c']);
  });

  it('returns shared read-only scene definitions', () => {
    expect(getSceneDefinition('S006')).toBe(SCENE_DEFINITIONS[4]);
  });
});
