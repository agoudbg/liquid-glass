import { describe, expect, it } from 'vitest';

import {
  cloneLabState,
  createDefaultLabState,
  updateLabNumericControl,
} from '../src/shared/lab-state';
import { resolveSceneMaterials } from '../src/shared/scene-materials';
import {
  isLabSceneEditable,
  resolveSceneControlValues,
  resolveSceneRenderPrecision,
} from '../src/shared/scene-render-options';
import {
  createDefaultPlaygroundState,
  createInitialState,
  replacePlaygroundUrl,
  transitionPlaygroundScene,
  transitionPlaygroundState,
} from '../src/shell/state';

describe('isolated Lab state', () => {
  it('creates fresh defaults without shared nested references', () => {
    const first = createDefaultLabState();
    const second = createDefaultLabState();
    const cloned = cloneLabState(first);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.optics).not.toBe(second.optics);
    expect(first.shape).not.toBe(second.shape);
    expect(first.appearance).not.toBe(second.appearance);
    expect(first.interaction).not.toBe(second.interaction);
    expect(first.interaction.config).not.toBe(second.interaction.config);
    expect(first.render).not.toBe(second.render);
    expect(first.source).not.toBe(second.source);
    expect(cloned).toEqual(first);
    expect(cloned.interaction.config).not.toBe(first.interaction.config);

    const firstState = createDefaultPlaygroundState();
    const secondState = createDefaultPlaygroundState();
    expect(firstState.lab).not.toBe(secondState.lab);
  });

  it('round-trips the five existing URL controls through nested Lab groups', () => {
    const parsed = createInitialState(new URL(
      'https://example.test/?scene=S004&thickness=63&ior=1.47'
      + '&intensity=1.18&radius=51&precision=1.4',
    ));
    expect(parsed.lab).toMatchObject({
      optics: {
        thickness: 63,
        refractIndex: 1.47,
        refractIntensity: 1.18,
      },
      shape: {
        radius: 51,
        radiusTL: 51,
        radiusTR: 39,
        radiusBR: 51,
        radiusBL: 63,
      },
      render: { precision: 1.4 },
    });

    window.history.replaceState(null, '', '/?stale=1');
    replacePlaygroundUrl(parsed);
    const serialized = new URL(window.location.href);
    expect(serialized.searchParams.get('thickness')).toBe('63');
    expect(serialized.searchParams.get('ior')).toBe('1.47');
    expect(serialized.searchParams.get('intensity')).toBe('1.18');
    expect(serialized.searchParams.get('radius')).toBe('51');
    expect(serialized.searchParams.get('precision')).toBe('1.4');

    expect(createInitialState(serialized).lab).toEqual(parsed.lab);
  });

  it('applies edited optical, shape, appearance, interaction, and render values to S001', () => {
    const initial = createInitialState(new URL('https://example.test/?scene=S001'));
    const edited = transitionPlaygroundState(initial, {
      lab: {
        optics: {
          thickness: 58,
          refractIndex: 1.42,
          refractIntensity: 1.08,
          blur: 4,
          dispersion: 0.075,
        },
        shape: {
          radius: 46,
          radiusTL: 12,
          radiusTR: 22,
          radiusBR: 32,
          radiusBL: 42,
        },
        appearance: {
          useCustomColor: true,
          backgroundColor: 'rgba(20, 80, 110, 0.2)',
          illuminationAngle: 128,
          illuminationIntensity: 0.74,
        },
        interaction: {
          disableInteractions: false,
          onlyClickInteractions: true,
          isMoveable: true,
          preset: 'custom',
          config: { activeScale: 1.08 },
        },
        render: {
          precision: 1.35,
          order: 27,
        },
        source: {
          kind: 'dom',
          backgroundColor: '#101820',
        },
      },
    });

    expect(resolveSceneMaterials(edited)[0]?.options).toMatchObject({
      radius: 46,
      radiusTL: 12,
      radiusTR: 22,
      radiusBR: 32,
      radiusBL: 42,
      thickness: 58,
      refractIndex: 1.42,
      refractIntensity: 1.08,
      blur: 4,
      dispersion: 0.075,
      backgroundColor: 'rgba(20, 80, 110, 0.2)',
      useCustomColor: true,
      illuminationAngle: 128,
      illuminationIntensity: 0.74,
      onlyClickInteractions: true,
      isMoveable: true,
      interactionPreset: 'custom',
      interactionConfig: { activeScale: 1.08 },
      renderOrder: 27,
    });
    expect(resolveSceneRenderPrecision(edited)).toBe(1.35);
  });

  it('keeps S002 through S007 canonical when Lab values change', () => {
    const editedLab = createInitialState(new URL(
      'https://example.test/?scene=S001&thickness=80&ior=1.6'
      + '&intensity=1.4&radius=64&precision=1.5',
    )).lab;

    for (const scene of ['S002', 'S003', 'S004', 'S005', 'S006', 'S007'] as const) {
      const canonical = createInitialState(new URL(
        `https://example.test/?scene=${scene}`,
      ));
      const withLabEdits = transitionPlaygroundState(canonical, { lab: editedLab });
      expect(resolveSceneMaterials(withLabEdits)).toEqual(
        resolveSceneMaterials(canonical),
      );
      expect(resolveSceneControlValues(withLabEdits)).toEqual(
        resolveSceneControlValues(canonical),
      );
      expect(resolveSceneRenderPrecision(withLabEdits)).toBe(1);
    }

    const fixture = createInitialState(new URL(
      'https://example.test/?scene=S004&test=1&fixture=interaction-policy',
    ));
    expect(resolveSceneMaterials(transitionPlaygroundState(fixture, {
      lab: editedLab,
    }))).toEqual(resolveSceneMaterials(fixture));
    expect(resolveSceneControlValues(fixture)).toEqual({
      thickness: 30,
      refractIndex: 1.1,
      refractIntensity: 0.5,
      radius: 28,
      renderPrecision: 1,
    });
  });

  it('keeps every oracle resolver independent from Lab state', () => {
    const editedLab = createInitialState(new URL(
      'https://example.test/?thickness=80&ior=1.6'
      + '&intensity=1.4&radius=64&precision=1.5',
    )).lab;

    for (const scene of ['S001', 'S002', 'S004'] as const) {
      const oracle = createInitialState(new URL(
        `https://example.test/?scene=${scene}&oracle=1`,
      ));
      const edited = transitionPlaygroundState(oracle, { lab: editedLab });
      expect(resolveSceneMaterials(edited)).toEqual(resolveSceneMaterials(oracle));
      expect(resolveSceneControlValues(edited)).toEqual(
        resolveSceneControlValues(oracle),
      );
      expect(resolveSceneRenderPrecision(edited)).toBe(1);
    }

    expect(resolveSceneControlValues(createInitialState(new URL(
      'https://example.test/?scene=S001&oracle=1',
    )))).toEqual({
      thickness: 18,
      refractIndex: 1.18,
      refractIntensity: 0.72,
      radius: 52,
      renderPrecision: 1,
    });
    expect(resolveSceneControlValues(createInitialState(new URL(
      'https://example.test/?scene=S002&oracle=1',
    )))).toEqual({
      thickness: 16,
      refractIndex: 1.12,
      refractIntensity: 0.64,
      radius: 44,
      renderPrecision: 1,
    });
    expect(resolveSceneControlValues(createInitialState(new URL(
      'https://example.test/?scene=S004&oracle=1',
    )))).toEqual({
      thickness: 10,
      refractIndex: 1.1,
      refractIntensity: 0.5,
      radius: 40,
      renderPrecision: 1,
    });
  });

  it('preserves Lab edits across canonical scene transitions', () => {
    const initial = createInitialState(new URL('https://example.test/?scene=S001'));
    const editedLab = updateLabNumericControl(
      updateLabNumericControl(initial.lab, 'thickness', 67),
      'renderPrecision',
      1.4,
    );
    const edited = transitionPlaygroundState(initial, { lab: editedLab });
    const interaction = transitionPlaygroundScene(edited, 'S004');
    const restored = transitionPlaygroundScene(interaction, 'S001');

    expect(isLabSceneEditable(edited)).toBe(true);
    expect(isLabSceneEditable(interaction)).toBe(false);
    expect(interaction.lab).toEqual(editedLab);
    expect(resolveSceneMaterials(interaction)[0]?.options.thickness).toBe(30);
    expect(restored.lab).toEqual(editedLab);
    expect(resolveSceneMaterials(restored)[0]?.options.thickness).toBe(67);
    expect(resolveSceneRenderPrecision(restored)).toBe(1.4);
  });

  it('normalizes fixture, oracle, and target-scene default policies', () => {
    const fixture = createInitialState(new URL(
      'https://example.test/?scene=S004&test=1&fixture=interaction-policy',
    ));
    const leftFixture = transitionPlaygroundScene(fixture, 'S001');
    expect(leftFixture.testFixture).toBeNull();

    const oracle = createInitialState(new URL(
      'https://example.test/?scene=S004&oracle=1',
    ));
    expect(isLabSceneEditable(oracle)).toBe(false);
    const supportedOracle = transitionPlaygroundScene(oracle, 'S002');
    expect(supportedOracle.oracleMode).toBe(true);
    const unsupportedOracle = transitionPlaygroundScene(oracle, 'S006');
    expect(unsupportedOracle).toMatchObject({
      oracleMode: false,
      scene: 'S006',
      scrollable: true,
      viewportEnabled: true,
      fallbackEnabled: false,
      domVariant: 'source',
    });
    expect(transitionPlaygroundScene(unsupportedOracle, 'S007')).toMatchObject({
      fallbackEnabled: true,
      oracleMode: false,
      scrollable: false,
      viewportEnabled: false,
    });
  });
});
