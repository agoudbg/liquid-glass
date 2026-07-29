import { describe, expect, it } from 'vitest';

import { normalizeTestFixtureState } from '../src/shared/test-fixtures';
import {
  createInitialState,
  replacePlaygroundUrl,
} from '../src/shell/state';

describe('playground URL state', () => {
  it('parses and serializes the global render mode', () => {
    const dedicated = createInitialState(new URL(
      'https://example.test/?scene=S002&mode=dedicated',
    ));
    expect(dedicated.renderMode).toBe('dedicated');
    expect(createInitialState(new URL(
      'https://example.test/?mode=invalid',
    )).renderMode).toBe('uniform');

    window.history.replaceState(null, '', '/');
    replacePlaygroundUrl(dedicated);
    expect(new URL(window.location.href).searchParams.get('mode'))
      .toBe('dedicated');
  });

  it('enters the dedicated scene in dedicated mode with an explicit URL override', () => {
    expect(createInitialState(new URL(
      'https://example.test/?scene=S008',
    ))).toMatchObject({
      renderMode: 'dedicated',
      scene: 'S008',
    });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S008&mode=uniform',
    ))).toMatchObject({
      renderMode: 'uniform',
      scene: 'S008',
    });
  });

  it('parses and clamps the global render precision', () => {
    expect(createInitialState(new URL(
      'https://example.test/?scene=S004&precision=1.65',
    )).renderPrecision).toBe(1.65);
    expect(createInitialState(new URL(
      'https://example.test/?precision=99',
    )).renderPrecision).toBe(2.5);
    expect(createInitialState(new URL(
      'https://example.test/?precision=invalid',
    )).renderPrecision).toBe(1);
  });

  it('parses and serializes the global diagnostics policy', () => {
    expect(createInitialState(new URL(
      'https://example.test/?debug=off',
    )).debugEnabled).toBe(false);
    expect(createInitialState(new URL(
      'https://example.test/?debug=invalid',
    )).debugEnabled).toBe(true);

    const state = createInitialState(new URL(
      'https://example.test/?debug=off',
    ));
    window.history.replaceState(null, '', '/');
    replacePlaygroundUrl(state);
    expect(new URL(window.location.href).searchParams.get('debug')).toBe('off');
  });

  it('defaults S007 to forced fallback while preserving explicit overrides', () => {
    expect(createInitialState(new URL('https://example.test/?scene=S007')))
      .toMatchObject({ scene: 'S007', fallbackEnabled: true });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S007&fallback=off',
    ))).toMatchObject({ scene: 'S007', fallbackEnabled: false });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S001&fallback=on',
    ))).toMatchObject({ scene: 'S001', fallbackEnabled: true });
  });

  it('parses reproducible DOM capture state with its legacy oracle fixture', () => {
    expect(createInitialState(new URL(
      'https://example.test/?scene=S003&content=mutated&oracle=1',
    ))).toMatchObject({
      domVariant: 'mutated',
      oracleMode: true,
      scene: 'S003',
    });
  });

  it('enables legacy oracle mode only for scenes with durable fixtures', () => {
    expect(createInitialState(new URL(
      'https://example.test/?scene=S004&oracle=1',
    ))).toMatchObject({
      oracleMode: true,
      scene: 'S004',
      lab: {
        optics: {
          thickness: 36,
          refractIndex: 1.21,
          refractIntensity: 0.72,
        },
        shape: { radius: 34 },
      },
    });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S004',
    ))).toMatchObject({
      oracleMode: false,
      scene: 'S004',
      lab: {
        optics: {
          thickness: 36,
          refractIndex: 1.21,
          refractIntensity: 0.72,
        },
        shape: { radius: 34 },
      },
    });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S005&oracle=1',
    ))).toMatchObject({ oracleMode: true, scene: 'S005' });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S007&oracle=1',
    ))).toMatchObject({ oracleMode: false, scene: 'S007' });
  });

  it('gates the interaction-policy fixture behind test-only non-oracle S004', () => {
    const fixtureUrl =
      'https://example.test/?scene=S004&test=1&fixture=interaction-policy';
    expect(createInitialState(new URL(fixtureUrl)))
      .toMatchObject({
        oracleMode: false,
        scene: 'S004',
        testFixture: 'interaction-policy',
        testMode: true,
      });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S004&fixture=interaction-policy',
    )).testFixture).toBeNull();
    expect(createInitialState(new URL(
      'https://example.test/?scene=S001&test=1&fixture=interaction-policy',
    )).testFixture).toBeNull();
    expect(createInitialState(new URL(
      `${fixtureUrl}&oracle=1`,
    ))).toMatchObject({
      oracleMode: true,
      testFixture: null,
    });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S004&test=1&fixture=unknown',
    )).testFixture).toBeNull();
  });

  it('removes inactive test-only flags when serializing state', () => {
    window.history.replaceState(
      null,
      '',
      '/?scene=S005&oracle=1&test=1&fixture=interaction-policy',
    );
    const state = createInitialState(new URL(window.location.href));

    replacePlaygroundUrl({ ...state, oracleMode: false, testMode: false });

    const serializedUrl = new URL(window.location.href);
    expect(serializedUrl.searchParams.has('oracle')).toBe(false);
    expect(serializedUrl.searchParams.has('test')).toBe(false);
    expect(serializedUrl.searchParams.has('fixture')).toBe(false);
  });

  it('serializes only a currently reachable test fixture', () => {
    window.history.replaceState(null, '', '/?scene=S004');
    const state = createInitialState(new URL(
      'https://example.test/?scene=S004&test=1&fixture=interaction-policy',
    ));

    replacePlaygroundUrl(state);
    expect(new URL(window.location.href).searchParams.get('fixture'))
      .toBe('interaction-policy');

    replacePlaygroundUrl({ ...state, oracleMode: true });
    expect(new URL(window.location.href).searchParams.has('fixture')).toBe(false);
  });

  it('clears an invalidated fixture before later transitions can reactivate it', () => {
    const fixtureState = createInitialState(new URL(
      'https://example.test/?scene=S004&test=1&fixture=interaction-policy',
    ));

    const leftFixtureScene = normalizeTestFixtureState({
      ...fixtureState,
      scene: 'S001',
    });
    expect(leftFixtureScene.testFixture).toBeNull();
    expect(normalizeTestFixtureState({
      ...leftFixtureScene,
      scene: 'S004',
    }).testFixture).toBeNull();

    const testModeDisabled = normalizeTestFixtureState({
      ...fixtureState,
      testMode: false,
    });
    expect(testModeDisabled.testFixture).toBeNull();
    expect(normalizeTestFixtureState({
      ...testModeDisabled,
      testMode: true,
    }).testFixture).toBeNull();

    const oracleEnabled = normalizeTestFixtureState({
      ...fixtureState,
      oracleMode: true,
    });
    expect(oracleEnabled.testFixture).toBeNull();
    expect(normalizeTestFixtureState({
      ...oracleEnabled,
      oracleMode: false,
    }).testFixture).toBeNull();
  });

  it('defaults S006 to bounded internal scrolling while preserving overrides', () => {
    expect(createInitialState(new URL('https://example.test/?scene=S006')))
      .toMatchObject({
        scene: 'S006',
        scrollable: true,
        viewportEnabled: true,
      });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S006&oracle=1&viewport=on',
    ))).toMatchObject({
      oracleMode: true,
      scene: 'S006',
      scrollable: true,
      viewportEnabled: false,
    });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S006&scroll=off&viewport=off',
    ))).toMatchObject({
      scene: 'S006',
      scrollable: false,
      viewportEnabled: false,
    });
    expect(createInitialState(new URL('https://example.test/?scene=S005')))
      .toMatchObject({
        scene: 'S005',
        scrollable: false,
        viewportEnabled: false,
      });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S005&scroll=on&viewport=on',
    ))).toMatchObject({
      scene: 'S005',
      scrollable: false,
      viewportEnabled: false,
    });
  });
});
