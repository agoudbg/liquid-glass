import { describe, expect, it } from 'vitest';

import {
  cloneLabState,
  createDefaultLabState,
  isLabBooleanControl,
  isLabInteractionPreset,
  isLabSourceKind,
  updateLabBooleanControl,
  updateLabColor,
  updateLabInteractionPreset,
  updateLabNumericControl,
  updateLabSourceKind,
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

  it('round-trips Lab controls and global precision through the URL', () => {
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
    });
    expect(parsed.renderPrecision).toBe(1.4);

    window.history.replaceState(null, '', '/?stale=1');
    replacePlaygroundUrl(parsed);
    const serialized = new URL(window.location.href);
    expect(serialized.searchParams.get('thickness')).toBe('63');
    expect(serialized.searchParams.get('ior')).toBe('1.47');
    expect(serialized.searchParams.get('intensity')).toBe('1.18');
    expect(serialized.searchParams.get('radius')).toBe('51');
    expect(serialized.searchParams.get('precision')).toBe('1.4');

    const reparsed = createInitialState(serialized);
    expect(reparsed.lab).toEqual(parsed.lab);
    expect(reparsed.renderPrecision).toBe(parsed.renderPrecision);
  });

  it('round-trips complete Lab controls through a reproducible URL', () => {
    const parsed = createInitialState(new URL(
      'https://example.test/?scene=S001&blur=7.5&dispersion=0.085'
      + '&radiusTL=12&radiusTR=22&radiusBR=32&radiusBL=42'
      + '&renderOrder=35&customColor=on&color=%23f5c9ba'
      + '&lightAngle=145&lightIntensity=0.77&interaction=custom'
      + '&interactions=off&clickOnly=on&moveable=on'
      + '&activeScale=1.16&translateFactor=0.31'
      + '&stretchFactor=0.0024&highlightOpacity=0.58&source=dom',
    ));
    expect(parsed.lab).toMatchObject({
      optics: { blur: 7.5, dispersion: 0.085 },
      shape: {
        radiusTL: 12,
        radiusTR: 22,
        radiusBR: 32,
        radiusBL: 42,
      },
      appearance: {
        useCustomColor: true,
        backgroundColor: '#f5c9ba29',
        illuminationAngle: 145,
        illuminationIntensity: 0.77,
      },
      interaction: {
        disableInteractions: true,
        onlyClickInteractions: true,
        isMoveable: true,
        preset: 'custom',
        config: {
          activeScale: 1.16,
          translateFactor: 0.31,
          stretchFactor: 0.0024,
          highlightOpacity: 0.58,
        },
      },
      render: { order: 35 },
      source: { kind: 'dom' },
    });

    window.history.replaceState(null, '', '/');
    replacePlaygroundUrl(parsed);
    expect(createInitialState(new URL(window.location.href)).lab).toEqual(parsed.lab);
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
        render: { order: 27 },
        source: {
          kind: 'dom',
          backgroundColor: '#101820',
        },
      },
      renderPrecision: 1.35,
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

  it('keeps custom draft values inert for the default button preset', () => {
    const state = createInitialState(new URL('https://example.test/?scene=S001'));
    const options = resolveSceneMaterials(state)[0]?.options;

    expect(options?.interactionPreset).toBe('button');
    expect(options?.interactionConfig).toBeUndefined();
    expect(state.lab.interaction.config).toMatchObject({
      activeScale: 1.08,
      translateFactor: 0.2,
      stretchFactor: 0.0015,
      highlightOpacity: 0.35,
    });
  });

  it('updates every Lab group immutably through typed control helpers', () => {
    const initial = createDefaultLabState();
    const blurred = updateLabNumericControl(initial, 'blur', 6.5);
    const corner = updateLabNumericControl(blurred, 'radiusTR', 72);
    const shared = updateLabNumericControl(corner, 'radius', 48);
    const order = updateLabNumericControl(shared, 'renderOrder', 24);
    const light = updateLabNumericControl(
      order,
      'illuminationIntensity',
      0.8,
    );
    const custom = updateLabNumericControl(light, 'activeScale', 1.14);
    const tinted = updateLabColor(custom, '#f5c9ba');
    const disabled = updateLabBooleanControl(
      tinted,
      'disableInteractions',
      true,
    );
    const preset = updateLabInteractionPreset(disabled, 'custom');
    const source = updateLabSourceKind(preset, 'dom');

    expect(initial.optics.blur).toBe(0);
    expect(source).toMatchObject({
      optics: { blur: 6.5 },
      shape: {
        radius: 48,
        radiusTL: 48,
        radiusTR: 48,
        radiusBR: 48,
        radiusBL: 48,
      },
      appearance: {
        backgroundColor: '#f5c9ba29',
        illuminationIntensity: 0.8,
        useCustomColor: true,
      },
      interaction: {
        disableInteractions: true,
        preset: 'custom',
        config: { activeScale: 1.14 },
      },
      render: { order: 24 },
      source: { kind: 'dom' },
    });
    expect(isLabBooleanControl('isMoveable')).toBe(true);
    expect(isLabInteractionPreset('slider')).toBe(true);
    expect(isLabSourceKind('dom')).toBe(true);
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
    });
    expect(resolveSceneControlValues(createInitialState(new URL(
      'https://example.test/?scene=S002&oracle=1',
    )))).toEqual({
      thickness: 16,
      refractIndex: 1.12,
      refractIntensity: 0.64,
      radius: 44,
    });
    expect(resolveSceneControlValues(createInitialState(new URL(
      'https://example.test/?scene=S004&oracle=1',
    )))).toEqual({
      thickness: 10,
      refractIndex: 1.1,
      refractIntensity: 0.5,
      radius: 40,
    });
  });

  it('preserves Lab edits across canonical scene transitions', () => {
    const initial = createInitialState(new URL('https://example.test/?scene=S001'));
    const editedLab = updateLabNumericControl(initial.lab, 'thickness', 67);
    const edited = transitionPlaygroundState(initial, {
      lab: editedLab,
      renderPrecision: 1.4,
    });
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
