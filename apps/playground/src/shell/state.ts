import { isFrameworkId } from '../app-meta';
import {
  cloneLabState,
  createDefaultLabState,
  DEFAULT_LAB_URL_VALUES,
} from '../shared/lab-state';
import {
  getSceneDefinition,
  isSceneId,
  type SceneId,
} from '../shared/scene-catalog';
import { normalizeTestFixtureState } from '../shared/test-fixtures';
import type {
  LabState,
  PlaygroundState,
} from '../shared/types';

/** State changes accepted by the immutable playground transition helper. */
export type PlaygroundStateChanges =
  Partial<Omit<PlaygroundState, 'lab'>>
  & { lab?: LabState };

/** Create an independent default state for the focused Lab scene. */
export function createDefaultPlaygroundState(): PlaygroundState {
  return {
    framework: 'vue',
    scene: 'S001',
    renderMode: 'uniform',
    glassEnabled: true,
    fallbackEnabled: false,
    scrollable: false,
    viewportEnabled: false,
    domVariant: 'source',
    lab: createDefaultLabState(),
    testMode: false,
    testFixture: null,
    oracleMode: false,
  };
}

/** Parse and validate a reproducible playground state from a URL. */
export function createInitialState(url: URL): PlaygroundState {
  const defaults = createDefaultPlaygroundState();
  const framework = url.searchParams.get('framework');
  const scene = parseScene(url.searchParams.get('scene'));
  const fallback = url.searchParams.get('fallback');
  const scroll = url.searchParams.get('scroll');
  const viewport = url.searchParams.get('viewport');
  const sceneDefinition = getSceneDefinition(scene);
  const testMode = url.searchParams.get('test') === '1';
  const oracleMode = url.searchParams.get('oracle') === '1'
    && sceneDefinition.supportsOracle;
  const lab = createDefaultLabState({
    thickness: parseNumber(
      url.searchParams.get('thickness'),
      4,
      80,
      DEFAULT_LAB_URL_VALUES.thickness,
    ),
    refractIndex: parseNumber(
      url.searchParams.get('ior'),
      1,
      1.6,
      DEFAULT_LAB_URL_VALUES.refractIndex,
    ),
    refractIntensity: parseNumber(
      url.searchParams.get('intensity'),
      0,
      1.4,
      DEFAULT_LAB_URL_VALUES.refractIntensity,
    ),
    radius: parseNumber(
      url.searchParams.get('radius'),
      0,
      64,
      DEFAULT_LAB_URL_VALUES.radius,
    ),
    renderPrecision: parseNumber(
      url.searchParams.get('precision'),
      0.5,
      1.5,
      DEFAULT_LAB_URL_VALUES.renderPrecision,
    ),
  });
  const parsedState: PlaygroundState = {
    ...defaults,
    framework: isFrameworkId(framework) ? framework : defaults.framework,
    scene,
    glassEnabled: url.searchParams.get('glass') !== 'off',
    fallbackEnabled: fallback === 'on'
      || (fallback !== 'off' && sceneDefinition.fallbackByDefault),
    scrollable: sceneDefinition.scrollableByDefault && scroll !== 'off',
    viewportEnabled: sceneDefinition.viewportByDefault && viewport !== 'off',
    domVariant: url.searchParams.get('content') === 'mutated' ? 'mutated' : 'source',
    lab,
    testMode,
    testFixture: testMode
      && scene === 'S004'
      && !oracleMode
      && url.searchParams.get('fixture') === 'interaction-policy'
      ? 'interaction-policy'
      : null,
    oracleMode,
  };
  return normalizePlaygroundState(parsedState);
}

/** Apply a state patch while enforcing oracle and test-fixture reachability. */
export function transitionPlaygroundState(
  current: PlaygroundState,
  changes: PlaygroundStateChanges,
): PlaygroundState {
  return normalizePlaygroundState({
    ...current,
    ...changes,
    lab: changes.lab ?? current.lab,
  });
}

/** Enter a canonical scene using its default shell policies while retaining Lab edits. */
export function transitionPlaygroundScene(
  current: PlaygroundState,
  scene: SceneId,
): PlaygroundState {
  const definition = getSceneDefinition(scene);
  return transitionPlaygroundState(current, {
    domVariant: 'source',
    fallbackEnabled: definition.fallbackByDefault,
    oracleMode: current.oracleMode && definition.supportsOracle,
    scene,
    scrollable: definition.scrollableByDefault,
    viewportEnabled: definition.viewportByDefault,
  });
}

/** Clone state returned across the shell boundary without sharing editable Lab objects. */
export function clonePlaygroundState(state: PlaygroundState): PlaygroundState {
  return {
    ...state,
    lab: cloneLabState(state.lab),
  };
}

/** Replace the current query string with the complete reproducible state. */
export function replacePlaygroundUrl(state: PlaygroundState): void {
  const url = new URL(window.location.href);
  url.searchParams.set('framework', state.framework);
  url.searchParams.set('scene', state.scene);
  url.searchParams.set('mode', state.renderMode);
  url.searchParams.set('glass', state.glassEnabled ? 'on' : 'off');
  url.searchParams.set('fallback', state.fallbackEnabled ? 'on' : 'off');
  url.searchParams.set('scroll', state.scrollable ? 'on' : 'off');
  url.searchParams.set('viewport', state.viewportEnabled ? 'on' : 'off');
  url.searchParams.set('content', state.domVariant);
  url.searchParams.set('thickness', String(state.lab.optics.thickness));
  url.searchParams.set('ior', state.lab.optics.refractIndex.toFixed(2));
  url.searchParams.set(
    'intensity',
    state.lab.optics.refractIntensity.toFixed(2),
  );
  url.searchParams.set('radius', String(state.lab.shape.radius));
  url.searchParams.set('precision', state.lab.render.precision.toFixed(1));
  if (state.testMode) {
    url.searchParams.set('test', '1');
  } else {
    url.searchParams.delete('test');
  }
  if (
    state.testMode
    && state.scene === 'S004'
    && !state.oracleMode
    && state.testFixture === 'interaction-policy'
  ) {
    url.searchParams.set('fixture', state.testFixture);
  } else {
    url.searchParams.delete('fixture');
  }
  if (state.oracleMode) {
    url.searchParams.set('oracle', '1');
  } else {
    url.searchParams.delete('oracle');
  }
  window.history.replaceState(null, '', url);
}

function normalizePlaygroundState(state: PlaygroundState): PlaygroundState {
  const oracleMode = state.oracleMode
    && getSceneDefinition(state.scene).supportsOracle;
  return normalizeTestFixtureState(
    oracleMode === state.oracleMode ? state : { ...state, oracleMode },
  );
}

function parseScene(value: string | null): SceneId {
  return isSceneId(value) ? value : 'S001';
}

function parseNumber(
  value: string | null,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (value === null || value.trim() === '') return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}
