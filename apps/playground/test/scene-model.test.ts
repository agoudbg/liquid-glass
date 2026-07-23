import { describe, expect, it } from 'vitest';

import {
  getBackdropDraw,
  isDomCaptureScene,
  isScrollCaptureScene,
  resolveViewportCapture,
} from '../src/shared/scene-backdrops';
import {
  getSceneDefinition,
  SCENE_DEFINITIONS,
  SCENE_IDS,
} from '../src/shared/scene-catalog';
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
        id: 'S004',
        title: 'Interaction presets',
        materialCount: 4,
        captureKind: 'canvas',
        opticalDefaults: {
          radius: 28,
          thickness: 30,
          refractIndex: 1.1,
          refractIntensity: 0.5,
        },
        supportsOracle: true,
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
    const interactionState = createInitialState(new URL(
      'https://example.test/?scene=S004',
    ));
    const interactionMaterials = resolveSceneMaterials(interactionState);
    expect(interactionMaterials.map(({ id }) => id)).toEqual([
      's004-button',
      's004-context',
      's004-slider',
      's004-custom',
    ]);
    expect(interactionMaterials[0]).toMatchObject({
      testId: 'interaction-button',
      options: {
        interactionPreset: 'button',
        radius: 28,
        refractIndex: 1.1,
        refractIntensity: 0.5,
        dispersion: 0.01,
        thickness: 30,
      },
    });
    expect(interactionMaterials[2]).toMatchObject({
      options: {
        backgroundColor: '#ff000033',
        interactionPreset: 'slider',
      },
    });
    expect(interactionMaterials[3]).toMatchObject({
      options: {
        interactionConfig: {
          activeScale: 1.12,
          hoverScale: 1.05,
          releaseSpring: { stiffness: 250, damping: 8, mass: 1 },
          stretchFactor: 0.002,
        },
        interactionPreset: 'button',
      },
    });
    expect(resolveSceneMaterials(createInitialState(new URL(
      'https://example.test/?scene=S002&oracle=1',
    ))).map(({ id }) => id)).toEqual(['s002-a', 's002-b', 's002-c']);
    expect(resolveSceneMaterials(createInitialState(new URL(
      'https://example.test/?scene=S004&oracle=1',
    ))).map(({ id }) => id)).toEqual([
      's004-button',
      's004-context',
      's004-slider',
    ]);
  });

  it('returns shared read-only scene definitions', () => {
    expect(getSceneDefinition('S006')).toBe(
      SCENE_DEFINITIONS.find(({ id }) => id === 'S006'),
    );
  });

  it('resolves the gated interaction-policy fixture without changing S004', () => {
    const fixtureState = createInitialState(new URL(
      'https://example.test/?scene=S004&test=1&fixture=interaction-policy',
    ));
    const materials = resolveSceneMaterials(fixtureState);
    expect(materials.map(({ id }) => id)).toEqual([
      'disabled-button',
      'disabled-range',
      'click-only-button',
      'click-only-range',
    ]);
    expect(materials).toEqual([
      expect.objectContaining({
        className: expect.stringContaining('interaction-button'),
        control: {
          kind: 'button',
          label: 'Run disabled action',
          testId: 'disabled-button-control',
        },
        options: expect.objectContaining({
          disableInteractions: true,
          interactionPreset: 'button',
        }),
      }),
      expect.objectContaining({
        className: expect.stringContaining('interaction-context'),
        control: {
          initialValue: 32,
          kind: 'range',
          label: 'Disabled policy value',
          testId: 'disabled-range-control',
        },
        options: expect.objectContaining({
          disableInteractions: true,
          interactionPreset: 'slider',
        }),
      }),
      expect.objectContaining({
        className: expect.stringContaining('interaction-slider'),
        control: expect.objectContaining({ kind: 'button' }),
        options: expect.objectContaining({
          interactionPreset: 'button',
          onlyClickInteractions: true,
        }),
      }),
      expect.objectContaining({
        className: expect.stringContaining('interaction-custom'),
        control: expect.objectContaining({
          initialValue: 68,
          kind: 'range',
        }),
        options: expect.objectContaining({
          interactionPreset: 'slider',
          onlyClickInteractions: true,
        }),
      }),
    ]);

    expect(resolveSceneMaterials(createInitialState(new URL(
      'https://example.test/?scene=S004&fixture=interaction-policy',
    ))).map(({ id }) => id)).toEqual([
      's004-button',
      's004-context',
      's004-slider',
      's004-custom',
    ]);
    expect(resolveSceneMaterials(createInitialState(new URL(
      'https://example.test/?scene=S004&test=1&fixture=interaction-policy&oracle=1',
    ))).map(({ id }) => id)).toEqual([
      's004-button',
      's004-context',
      's004-slider',
    ]);
  });
});
