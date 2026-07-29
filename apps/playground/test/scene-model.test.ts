import { describe, expect, it } from 'vitest';

import {
  createProxyMaterial,
  getCompositionBackdropDraw,
  isCompositionScene,
  resolveCompositionMaterials,
} from '../src/shared/composition-scenes';
import {
  getBackdropDraw,
  isDomCaptureScene,
  isDomCaptureState,
  isEditorialDomCaptureState,
  isScrollCaptureScene,
  LEGACY_ORACLE_SCROLL_BANDS,
  resolveBackdropBackgroundColor,
  resolveStageSource,
  resolveViewportCapture,
  shouldRenderMaterialsBeforeBackdrop,
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
        supportsOracle: true,
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
        supportsOracle: true,
      }),
      expect.objectContaining({
        id: 'S006',
        title: 'Internal scroll',
        captureKind: 'internal-scroll',
        scrollableByDefault: true,
        viewportByDefault: true,
        supportsOracle: true,
      }),
      expect.objectContaining({
        id: 'S007',
        title: 'Fallback recovery',
        captureKind: 'canvas',
        fallbackByDefault: true,
      }),
      expect.objectContaining({
        id: 'S008',
        title: 'Dedicated clipping',
        materialCount: 2,
        renderModeByDefault: 'dedicated',
      }),
      expect.objectContaining({
        id: 'S009',
        title: 'Nested composition',
        materialCount: 2,
      }),
      expect.objectContaining({
        id: 'S010',
        title: 'Proxy delegation',
        materialCount: 1,
      }),
      expect.objectContaining({
        id: 'S011',
        title: 'Theme feedback',
        materialCount: 4,
      }),
      expect.objectContaining({
        id: 'S012',
        title: 'Lifecycle stress',
        materialCount: 1,
      }),
    ]);
  });

  it('defines the advanced Composition fixtures through shared scene data', () => {
    expect(SCENE_IDS.filter(isCompositionScene)).toEqual([
      'S008',
      'S009',
      'S010',
      'S011',
      'S012',
    ]);
    expect(resolveCompositionMaterials('S008').map(({ id }) => id)).toEqual([
      'dedicated-wide',
      'dedicated-compact',
    ]);
    expect(resolveCompositionMaterials('S009').map(({ id }) => id)).toEqual([
      'nested-parent',
      'nested-child',
    ]);
    expect(resolveCompositionMaterials('S011').map(({ id }) => id)).toEqual([
      'theme-ultra-dark',
      'theme-dark',
      'theme-light',
      'theme-ultra-light',
    ]);
    expect(resolveCompositionMaterials('S012').map(({ id }) => id))
      .toEqual(['lifecycle']);
    expect(getCompositionBackdropDraw('S008'))
      .toBe(getCompositionBackdropDraw('S010'));
    expect(getCompositionBackdropDraw('S011'))
      .not.toBe(getCompositionBackdropDraw('S008'));

    const target = {
      getContainerRect: () => null,
      getScrollPosition: () => ({ x: 0, y: 0 }),
      registerExternalMaterial: () => {
        throw new Error('Registration is not exercised by scene-model tests.');
      },
    };
    expect(createProxyMaterial(target).options.proxyTarget).toBe(target);
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
    const oracleState = createInitialState(new URL(
      'https://example.test/?scene=S006&oracle=1',
    ));
    expect(oracleState.viewportEnabled).toBe(false);
    expect(resolveViewportCapture(oracleState)).toEqual({
      bufferX: 0,
      bufferY: 180,
      enabled: true,
    });
    expect(resolveViewportCapture({
      ...viewportState,
      viewportEnabled: false,
    })).toBe(false);
  });

  it('switches only the focused Lab backdrop between stable source types', () => {
    const canvas = createInitialState(new URL(
      'https://example.test/?scene=S001&source=canvas',
    ));
    const dom = createInitialState(new URL(
      'https://example.test/?scene=S001&source=dom',
    ));
    const oracle = createInitialState(new URL(
      'https://example.test/?scene=S001&source=dom&oracle=1',
    ));

    expect(isDomCaptureState(canvas)).toBe(false);
    expect(isDomCaptureState(dom)).toBe(true);
    expect(isEditorialDomCaptureState(dom)).toBe(true);
    expect(resolveBackdropBackgroundColor(dom)).toBe('#dce4df');
    expect(resolveStageSource(dom)).toBe('01 / DOM SOURCE');
    expect(isDomCaptureState(oracle)).toBe(false);
    expect(resolveStageSource(oracle)).toBe('01 / CUSTOM CANVAS');
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

  it('reproduces the exact legacy DOM and scroll oracle contracts', () => {
    expect(LEGACY_ORACLE_SCROLL_BANDS).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(resolveSceneMaterials(createInitialState(new URL(
      'https://example.test/?scene=S003&oracle=1',
    )))).toEqual([{
      id: 's003-main',
      className: 'scene-material oracle-material oracle-s003',
      label: '',
      name: 'DOM capture',
      options: {
        radius: 36,
        thickness: 20,
        refractIndex: 1.2,
        refractIntensity: 0.76,
        blur: 0.022,
        dispersion: 0.016,
        disableInteractions: true,
      },
    }]);
    expect(resolveSceneMaterials(createInitialState(new URL(
      'https://example.test/?scene=S005&oracle=1',
    )))).toEqual([{
      id: 's005-sticky',
      className: 'scene-material oracle-material oracle-s005-sticky',
      label: '',
      name: 'Body scroll',
      options: {
        radius: 34,
        thickness: 19,
        refractIndex: 1.16,
        refractIntensity: 0.7,
        disableInteractions: true,
      },
    }]);
    expect(resolveSceneMaterials(createInitialState(new URL(
      'https://example.test/?scene=S006&oracle=1',
    )))).toEqual([{
      id: 's006-sticky',
      className: 'scene-material oracle-material oracle-s006-sticky',
      label: '',
      name: 'Internal scroll',
      options: {
        radius: 34,
        thickness: 19,
        refractIndex: 1.16,
        refractIntensity: 0.7,
        disableInteractions: true,
      },
    }]);
    expect(shouldRenderMaterialsBeforeBackdrop(createInitialState(new URL(
      'https://example.test/?scene=S006&oracle=1',
    )))).toBe(true);
    expect(shouldRenderMaterialsBeforeBackdrop(createInitialState(new URL(
      'https://example.test/?scene=S006',
    )))).toBe(false);
    expect(shouldRenderMaterialsBeforeBackdrop(createInitialState(new URL(
      'https://example.test/?scene=S005&oracle=1',
    )))).toBe(false);
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
