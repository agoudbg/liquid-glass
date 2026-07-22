import './styles.css';
import './styles/responsive.css';

import { observeGlassContext } from './shared/diagnostics';
import type {
  FrameworkHostController,
  FrameworkHostMount,
  HostRuntimeReport,
  PlaygroundState,
  SceneId,
} from './shared/types';
import { isSceneId } from './shared/types';
import { PLAYGROUND_MARKUP } from './shell/markup';
import {
  createInitialState,
  replacePlaygroundUrl,
} from './shell/state';

const mountPoint = document.getElementById('app');

if (!mountPoint) {
  throw new Error('Could not find #app mount point.');
}

const app = mountPoint;

app.innerHTML = PLAYGROUND_MARKUP;

const frameworkHost = requireElement<HTMLElement>('#framework-host');
const glassToggle = requireElement<HTMLInputElement>('[data-testid="glass-toggle"]');
const sceneSelect = requireElement<HTMLSelectElement>('[data-testid="scene-select"]');
const refreshBackdropButton = requireElement<HTMLButtonElement>(
  '[data-action="refresh-backdrop"]',
);
const state = createInitialState(new URL(window.location.href));
const hostModules = import.meta.glob<{ default: FrameworkHostMount }>(
  './hosts/*/mount.{ts,tsx}',
  { eager: true },
);
const mounts: Record<PlaygroundState['framework'], FrameworkHostMount> = {
  vue: requireHostMount('./hosts/vue/mount.ts'),
  react: requireHostMount('./hosts/react/mount.tsx'),
  solid: requireHostMount('./hosts/solid/mount.tsx'),
};
const SCENE_META: Record<SceneId, {
  kicker: string;
  title: string;
  materialCount: string;
}> = {
  S001: { kicker: 'SCENE 001', title: 'Single material', materialCount: '1' },
  S002: { kicker: 'SCENE 002', title: 'Material overlap', materialCount: '3' },
  S003: { kicker: 'SCENE 003', title: 'DOM capture', materialCount: '1' },
  S007: { kicker: 'SCENE 007', title: 'Fallback recovery', materialCount: '1' },
};

let currentState = state;
let hostController: FrameworkHostController | null = null;
let activeContext: Parameters<typeof observeGlassContext>[0] | null = null;
let activeBackdropRefresh: (() => void) | null = null;
let stopObservingContext: (() => void) | null = null;
let runtimeReport: HostRuntimeReport = createInitializingReport();

const hostCallbacks = {
  onContextReady: (context: Parameters<typeof observeGlassContext>[0]) => {
    activeContext = context;
    stopObservingContext?.();
    stopObservingContext = observeGlassContext(context, (report) => {
      runtimeReport = report;
      renderDiagnostics();
    });
    context.setFallbackMode(currentState.fallbackEnabled);
  },
  onBackdropRefreshReady: (refresh: (() => void) | null) => {
    activeBackdropRefresh = refresh;
    refreshBackdropButton.disabled = refresh === null;
  },
  onError: (error: unknown) => {
    runtimeReport = {
      ...createInitializingReport(),
      status: 'error',
      error: formatError(error),
    };
    renderDiagnostics();
  },
};

function requireHostMount(path: string): FrameworkHostMount {
  const hostModule = hostModules[path];
  if (!hostModule) throw new Error(`Missing framework host module: ${path}`);
  return hostModule.default;
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = app.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`Missing playground element: ${selector}`);
  }
  return element;
}

function createInitializingReport(): HostRuntimeReport {
  return {
    status: 'initializing',
    fallbackMode: false,
    frameCount: 0,
    captureCount: 0,
    lastCapture: null,
    canvasWidth: 0,
    canvasHeight: 0,
    glError: null,
    error: null,
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown renderer error';
}

function mountFramework(): void {
  stopObservingContext?.();
  stopObservingContext = null;
  activeContext = null;
  activeBackdropRefresh = null;
  refreshBackdropButton.disabled = true;
  hostController?.destroy();
  runtimeReport = createInitializingReport();
  frameworkHost.replaceChildren();
  hostController = mounts[currentState.framework](
    frameworkHost,
    currentState,
    hostCallbacks,
  );
}

function updateState(
  changes: Partial<PlaygroundState>,
  options: { remount?: boolean } = {},
): void {
  const fallbackChanged = changes.fallbackEnabled !== undefined
    && changes.fallbackEnabled !== currentState.fallbackEnabled;
  const hostStateChanged = Object.keys(changes).some(
    (key) => key !== 'fallbackEnabled',
  );
  currentState = { ...currentState, ...changes };
  if (options.remount) {
    mountFramework();
  } else {
    if (hostStateChanged) hostController?.update(currentState);
    if (fallbackChanged) {
      activeContext?.setFallbackMode(currentState.fallbackEnabled);
    }
  }
  replacePlaygroundUrl(currentState);
  renderState();
}

function renderState(): void {
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-framework]')) {
    const active = button.dataset.framework === currentState.framework;
    button.dataset.active = String(active);
    button.setAttribute('aria-pressed', String(active));
  }
  sceneSelect.value = currentState.scene;
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-fallback-mode]')) {
    const active = (button.dataset.fallbackMode === 'css')
      === currentState.fallbackEnabled;
    button.dataset.active = String(active);
    button.setAttribute('aria-pressed', String(active));
  }

  glassToggle.checked = currentState.glassEnabled;
  setInputValue('thickness', currentState.thickness);
  setInputValue('refractIndex', currentState.refractIndex);
  setInputValue('refractIntensity', currentState.refractIntensity);
  setInputValue('radius', currentState.radius);
  setInputValue('renderPrecision', currentState.renderPrecision);
  setText('#thickness-value', `${String(currentState.thickness)} px`);
  setText('#ior-value', currentState.refractIndex.toFixed(2));
  setText('#intensity-value', currentState.refractIntensity.toFixed(2));
  setText('#radius-value', `${String(currentState.radius)} px`);
  setText('#precision-value', `${currentState.renderPrecision.toFixed(1)}×`);
  const sceneMeta = SCENE_META[currentState.scene];
  setText('#scene-kicker', sceneMeta.kicker);
  setText('#scene-title', sceneMeta.title);
  setText('#material-count', sceneMeta.materialCount);
  setText('#backdrop-type', currentState.scene === 'S003' ? 'Captured DOM' : 'Canvas 2D');
  setText(
    '[data-action="mutate-dom"]',
    currentState.domVariant === 'source' ? 'Mutate DOM' : 'Restore source',
  );
  refreshBackdropButton.disabled = activeBackdropRefresh === null;

  app.dataset.framework = currentState.framework;
  app.dataset.scene = currentState.scene;
  app.dataset.renderMode = currentState.renderMode;
  app.dataset.glass = currentState.glassEnabled ? 'on' : 'off';
  app.dataset.fallbackRequest = currentState.fallbackEnabled ? 'on' : 'off';
  app.dataset.domVariant = currentState.domVariant;
  app.dataset.testMode = String(currentState.testMode);
  app.dataset.oracleMode = String(currentState.oracleMode);
  frameworkHost.dataset.framework = currentState.framework;
  frameworkHost.dataset.scene = currentState.scene;
  frameworkHost.dataset.glass = currentState.glassEnabled ? 'on' : 'off';
  frameworkHost.dataset.fallbackRequest = currentState.fallbackEnabled ? 'on' : 'off';
  document.body.dataset.playgroundScene = currentState.scene;
  renderDiagnostics();
}

function renderDiagnostics(): void {
  const ready = runtimeReport.status === 'ready';
  const statusLabel = runtimeReport.status === 'error'
    ? 'Renderer error'
    : ready
      ? (runtimeReport.fallbackMode ? 'CSS fallback active' : 'WebGL2 ready')
      : 'Initializing';
  setText('#gl-status', statusLabel);
  setText('#diagnostic-framework', capitalize(currentState.framework));
  setText('#diagnostic-scene', currentState.scene);
  setText('#effective-renderer', runtimeReport.fallbackMode ? 'CSS fallback' : 'WebGL2');
  setText(
    '#stage-pipeline',
    `1440 · ${runtimeReport.fallbackMode ? 'CSS FILTER' : 'WEBGL2'} · UNIFORM`,
  );
  setText('#diagnostic-frames', String(runtimeReport.frameCount));
  setText('#diagnostic-captures', String(runtimeReport.captureCount));
  setText(
    '#diagnostic-canvas',
    `${String(runtimeReport.canvasWidth)} × ${String(runtimeReport.canvasHeight)}`,
  );
  setText(
    '#diagnostic-error',
    runtimeReport.error ?? runtimeReport.glError ?? 'NO_ERROR',
  );

  app.dataset.ready = String(ready);
  app.dataset.glStatus = runtimeReport.status;
  app.dataset.fallback = runtimeReport.fallbackMode ? 'on' : 'off';
  app.dataset.glError = runtimeReport.error ?? runtimeReport.glError ?? 'NO_ERROR';
  app.dataset.frameCount = String(runtimeReport.frameCount);
  app.dataset.captureCount = String(runtimeReport.captureCount);
  const viewport = runtimeReport.lastCapture?.viewportRect;
  app.dataset.captureX = String(viewport?.x ?? 0);
  app.dataset.captureY = String(viewport?.y ?? 0);
  app.dataset.captureWidth = String(viewport?.width ?? 0);
  app.dataset.captureHeight = String(viewport?.height ?? 0);
  frameworkHost.dataset.ready = String(ready);
  frameworkHost.dataset.fallback = runtimeReport.fallbackMode ? 'on' : 'off';
  document.documentElement.dataset.playgroundReady = String(ready);
}

function setInputValue(control: string, value: number): void {
  requireElement<HTMLInputElement>(`[data-control="${control}"]`).value = String(value);
}

function setText(selector: string, value: string): void {
  requireElement<HTMLElement>(selector).textContent = value;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

for (const button of app.querySelectorAll<HTMLButtonElement>('[data-framework]')) {
  button.addEventListener('click', () => {
    const framework = button.dataset.framework;
    if (
      framework === 'vue'
      || framework === 'react'
      || framework === 'solid'
    ) {
      updateState({ framework }, { remount: framework !== currentState.framework });
    }
  });
}

sceneSelect.addEventListener('change', () => {
  const scene = sceneSelect.value;
  if (isSceneId(scene)) {
    runtimeReport = createInitializingReport();
    updateState({
      domVariant: 'source',
      fallbackEnabled: scene === 'S007',
      scene,
      scrollable: false,
    });
  }
});

requireElement<HTMLButtonElement>('[data-action="mutate-dom"]')
  .addEventListener('click', () => {
    if (currentState.scene !== 'S003') return;
    updateState({
      domVariant: currentState.domVariant === 'source' ? 'mutated' : 'source',
    });
  });

refreshBackdropButton.addEventListener('click', () => {
  activeBackdropRefresh?.();
});

for (const button of app.querySelectorAll<HTMLButtonElement>('[data-fallback-mode]')) {
  button.addEventListener('click', () => {
    updateState({ fallbackEnabled: button.dataset.fallbackMode === 'css' });
  });
}

for (const input of app.querySelectorAll<HTMLInputElement>('[data-control]')) {
  input.addEventListener('input', () => {
    const value = Number(input.value);
    const control = input.dataset.control;
    if (!Number.isFinite(value) || !control) return;
    updateNumericControl(control, value);
  });
}

function updateNumericControl(control: string, value: number): void {
  if (control === 'thickness') updateState({ thickness: value });
  if (control === 'refractIndex') updateState({ refractIndex: value });
  if (control === 'refractIntensity') updateState({ refractIntensity: value });
  if (control === 'radius') updateState({ radius: value });
  if (control === 'renderPrecision') updateState({ renderPrecision: value });
}

glassToggle.addEventListener('change', () => {
  updateState({ glassEnabled: glassToggle.checked });
});

replacePlaygroundUrl(currentState);
renderState();
mountFramework();
renderState();
