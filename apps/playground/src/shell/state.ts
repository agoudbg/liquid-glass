import { isFrameworkId } from '../app-meta';
import {
  getSceneDefinition,
  isSceneId,
  type SceneId,
} from '../shared/scene-catalog';
import type { PlaygroundState } from '../shared/types';

const DEFAULT_STATE: PlaygroundState = {
  framework: 'vue',
  scene: 'S001',
  renderMode: 'uniform',
  glassEnabled: true,
  fallbackEnabled: false,
  scrollable: false,
  viewportEnabled: false,
  domVariant: 'source',
  thickness: 36,
  refractIndex: 1.21,
  refractIntensity: 0.72,
  radius: 34,
  renderPrecision: 1,
  testMode: false,
  oracleMode: false,
};

/** Parse and validate a reproducible playground state from a URL. */
export function createInitialState(url: URL): PlaygroundState {
  const framework = url.searchParams.get('framework');
  const scene = parseScene(url.searchParams.get('scene'));
  const fallback = url.searchParams.get('fallback');
  const scroll = url.searchParams.get('scroll');
  const viewport = url.searchParams.get('viewport');
  const sceneDefinition = getSceneDefinition(scene);
  const oracleMode = url.searchParams.get('oracle') === '1'
    && sceneDefinition.supportsOracle;
  const parsedState: PlaygroundState = {
    ...DEFAULT_STATE,
    framework: isFrameworkId(framework) ? framework : DEFAULT_STATE.framework,
    scene,
    glassEnabled: url.searchParams.get('glass') !== 'off',
    fallbackEnabled: fallback === 'on'
      || (fallback !== 'off' && sceneDefinition.fallbackByDefault),
    scrollable: sceneDefinition.scrollableByDefault && scroll !== 'off',
    viewportEnabled: sceneDefinition.viewportByDefault && viewport !== 'off',
    domVariant: url.searchParams.get('content') === 'mutated' ? 'mutated' : 'source',
    thickness: parseNumber(
      url.searchParams.get('thickness'),
      4,
      80,
      sceneDefinition.opticalDefaults?.thickness ?? DEFAULT_STATE.thickness,
    ),
    refractIndex: parseNumber(
      url.searchParams.get('ior'),
      1,
      1.6,
      sceneDefinition.opticalDefaults?.refractIndex ?? DEFAULT_STATE.refractIndex,
    ),
    refractIntensity: parseNumber(
      url.searchParams.get('intensity'),
      0,
      1.4,
      sceneDefinition.opticalDefaults?.refractIntensity
        ?? DEFAULT_STATE.refractIntensity,
    ),
    radius: parseNumber(
      url.searchParams.get('radius'),
      0,
      64,
      sceneDefinition.opticalDefaults?.radius ?? DEFAULT_STATE.radius,
    ),
    renderPrecision: parseNumber(
      url.searchParams.get('precision'),
      0.5,
      1.5,
      DEFAULT_STATE.renderPrecision,
    ),
    testMode: url.searchParams.get('test') === '1',
    oracleMode,
  };
  if (!oracleMode) return parsedState;
  if (scene === 'S004') {
    return {
      ...parsedState,
      thickness: 10,
      refractIndex: 1.1,
      refractIntensity: 0.5,
      radius: 40,
      renderPrecision: 1,
    };
  }

  return {
    ...parsedState,
    thickness: scene === 'S002' ? 16 : 18,
    refractIndex: scene === 'S002' ? 1.12 : 1.18,
    refractIntensity: scene === 'S002' ? 0.64 : 0.72,
    radius: scene === 'S002' ? 44 : 52,
    renderPrecision: 1,
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
  url.searchParams.set('thickness', String(state.thickness));
  url.searchParams.set('ior', state.refractIndex.toFixed(2));
  url.searchParams.set('intensity', state.refractIntensity.toFixed(2));
  url.searchParams.set('radius', String(state.radius));
  url.searchParams.set('precision', state.renderPrecision.toFixed(1));
  if (state.testMode) {
    url.searchParams.set('test', '1');
  } else {
    url.searchParams.delete('test');
  }
  if (state.oracleMode) {
    url.searchParams.set('oracle', '1');
  } else {
    url.searchParams.delete('oracle');
  }
  window.history.replaceState(null, '', url);
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
