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
import {
  createInitialState,
  replacePlaygroundUrl,
} from './shell/state';

const mountPoint = document.getElementById('app');

if (!mountPoint) {
  throw new Error('Could not find #app mount point.');
}

const app = mountPoint;

app.innerHTML = `
  <div class="playground-shell" data-testid="playground-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <div>
          <h1>Liquid Glass</h1>
          <p>Optical workbench</p>
        </div>
      </div>

      <nav class="segment-control scene-switcher" aria-label="Scene">
        <button type="button" data-scene="S001">S001 · Single</button>
        <button type="button" data-scene="S002">S002 · Multiple</button>
        <button type="button" data-scene="S007">S007 · Fallback</button>
      </nav>

      <div class="topbar-actions">
        <div class="segment-control framework-switcher" aria-label="Framework">
          <button type="button" data-framework="vue">Vue</button>
          <button type="button" data-framework="react">React</button>
          <button type="button" data-framework="solid">Solid</button>
        </div>

        <label class="glass-toggle">
          <span>Glass</span>
          <input type="checkbox" data-testid="glass-toggle" />
          <span class="toggle-track" aria-hidden="true"><span></span></span>
        </label>
      </div>
    </header>

    <main class="workspace">
      <section class="stage" aria-label="Liquid glass stage">
        <div id="framework-host" class="framework-host"></div>
        <div class="stage-coordinate stage-coordinate-top" aria-hidden="true">01 / CUSTOM CANVAS</div>
        <div id="stage-pipeline" class="stage-coordinate stage-coordinate-bottom" aria-hidden="true">1440 · WEBGL2 · UNIFORM</div>
      </section>

      <aside class="inspector" aria-label="Optical controls">
        <header class="inspector-heading">
          <p id="scene-kicker">SCENE 001</p>
          <h2 id="scene-title">Single material</h2>
        </header>

        <div class="control-list">
          <label class="range-control" for="thickness-control">
            <span>Thickness</span>
            <output id="thickness-value" for="thickness-control">36 px</output>
            <input id="thickness-control" data-control="thickness" type="range" min="4" max="80" step="1" />
          </label>

          <label class="range-control" for="ior-control">
            <span>Index of refraction</span>
            <output id="ior-value" for="ior-control">1.21</output>
            <input id="ior-control" data-control="refractIndex" type="range" min="1" max="1.6" step="0.01" />
          </label>

          <label class="range-control" for="intensity-control">
            <span>Refraction</span>
            <output id="intensity-value" for="intensity-control">0.72</output>
            <input id="intensity-control" data-control="refractIntensity" type="range" min="0" max="1.4" step="0.01" />
          </label>

          <label class="range-control" for="radius-control">
            <span>Corner radius</span>
            <output id="radius-value" for="radius-control">34 px</output>
            <input id="radius-control" data-control="radius" type="range" min="0" max="64" step="1" />
          </label>

          <label class="range-control" for="precision-control">
            <span>Render precision</span>
            <output id="precision-value" for="precision-control">1.0×</output>
            <input id="precision-control" data-control="renderPrecision" type="range" min="0.5" max="1.5" step="0.1" />
          </label>

          <div class="mode-control">
            <span>Renderer</span>
            <div class="segment-control fallback-switcher" aria-label="Renderer mode">
              <button type="button" data-fallback-mode="webgl">WebGL</button>
              <button type="button" data-fallback-mode="css">CSS fallback</button>
            </div>
          </div>
        </div>

        <dl class="scene-facts">
          <div><dt>Materials</dt><dd id="material-count">1</dd></div>
          <div><dt>Render mode</dt><dd>Uniform</dd></div>
          <div><dt>Presentation</dt><dd id="effective-renderer">WebGL2</dd></div>
          <div><dt>Backdrop</dt><dd>Canvas 2D</dd></div>
        </dl>
      </aside>
    </main>

    <footer class="diagnostics" aria-label="Renderer diagnostics">
      <div class="diagnostic-primary">
        <span class="status-dot" aria-hidden="true"></span>
        <strong id="gl-status" data-testid="gl-status">Initializing</strong>
      </div>
      <dl>
        <div><dt>Host</dt><dd id="diagnostic-framework">Vue</dd></div>
        <div><dt>Scene</dt><dd id="diagnostic-scene">S001</dd></div>
        <div><dt>Frames</dt><dd id="diagnostic-frames">0</dd></div>
        <div><dt>Canvas</dt><dd id="diagnostic-canvas">0 × 0</dd></div>
        <div><dt>GL error</dt><dd id="diagnostic-error" data-testid="gl-error">—</dd></div>
      </dl>
    </footer>
  </div>
`;

const frameworkHost = requireElement<HTMLElement>('#framework-host');
const glassToggle = requireElement<HTMLInputElement>('[data-testid="glass-toggle"]');
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
  S007: { kicker: 'SCENE 007', title: 'Fallback recovery', materialCount: '1' },
};

let currentState = state;
let hostController: FrameworkHostController | null = null;
let activeContext: Parameters<typeof observeGlassContext>[0] | null = null;
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
  for (const button of app.querySelectorAll<HTMLButtonElement>('[data-scene]')) {
    const active = button.dataset.scene === currentState.scene;
    button.dataset.active = String(active);
    button.setAttribute('aria-pressed', String(active));
  }
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

  app.dataset.framework = currentState.framework;
  app.dataset.scene = currentState.scene;
  app.dataset.renderMode = currentState.renderMode;
  app.dataset.glass = currentState.glassEnabled ? 'on' : 'off';
  app.dataset.fallbackRequest = currentState.fallbackEnabled ? 'on' : 'off';
  app.dataset.testMode = String(currentState.testMode);
  app.dataset.oracleMode = String(currentState.oracleMode);
  frameworkHost.dataset.framework = currentState.framework;
  frameworkHost.dataset.scene = currentState.scene;
  frameworkHost.dataset.glass = currentState.glassEnabled ? 'on' : 'off';
  frameworkHost.dataset.fallbackRequest = currentState.fallbackEnabled ? 'on' : 'off';
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

for (const button of app.querySelectorAll<HTMLButtonElement>('[data-scene]')) {
  button.addEventListener('click', () => {
    const scene = button.dataset.scene;
    if (isSceneId(scene)) {
      runtimeReport = createInitializingReport();
      updateState({ fallbackEnabled: scene === 'S007', scene });
    }
  });
}

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
