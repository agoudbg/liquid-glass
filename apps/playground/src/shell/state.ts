import { isFrameworkId } from '../app-meta';
import {
  cloneLabState,
  createDefaultLabState,
} from '../shared/lab-state';
import {
  parseLabUrlState,
  writeLabUrlState,
} from '../shared/lab-url-state';
import {
  DEFAULT_RENDER_PRECISION,
  normalizeRenderPrecision,
  parseRenderPrecision,
} from '../shared/render-precision';
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
    renderPrecision: DEFAULT_RENDER_PRECISION,
    debugEnabled: true,
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
  const mode = url.searchParams.get('mode');
  const debug = url.searchParams.get('debug');
  const sceneDefinition = getSceneDefinition(scene);
  const testMode = url.searchParams.get('test') === '1';
  const oracleMode = url.searchParams.get('oracle') === '1'
    && sceneDefinition.supportsOracle;
  const lab = parseLabUrlState(url.searchParams);
  const parsedState: PlaygroundState = {
    ...defaults,
    framework: isFrameworkId(framework) ? framework : defaults.framework,
    scene,
    renderMode: mode === 'dedicated' || mode === 'uniform'
      ? mode
      : sceneDefinition.renderModeByDefault,
    renderPrecision: parseRenderPrecision(url.searchParams.get('precision')),
    debugEnabled: debug !== 'off',
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
    renderMode: definition.renderModeByDefault,
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
  writeLabUrlState(url.searchParams, state.lab);
  url.searchParams.set('precision', String(state.renderPrecision));
  url.searchParams.set('debug', state.debugEnabled ? 'on' : 'off');
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
  const normalizedState = {
    ...state,
    oracleMode,
    renderPrecision: normalizeRenderPrecision(state.renderPrecision),
    // The legacy S006 oracle renders the complete scrolling surface.
    viewportEnabled: oracleMode && state.scene === 'S006'
      ? false
      : state.viewportEnabled,
  };
  return normalizeTestFixtureState(
    normalizedState,
  );
}

function parseScene(value: string | null): SceneId {
  return isSceneId(value) ? value : 'S001';
}
