import {
  DEFAULT_RENDER_PRECISION,
  MAXIMUM_RENDER_PRECISION,
  MINIMUM_RENDER_PRECISION,
  RENDER_PRECISION_STEP,
} from '../shared/render-precision';
import { SCENE_DEFINITIONS } from '../shared/scene-catalog';
import { WORKBENCH_TABS } from '../shared/workbench-tabs';
import { LAB_INSPECTOR_MARKUP } from './lab-markup';

const SCENE_OPTIONS = SCENE_DEFINITIONS.map(
  ({ id, title }) => `<option value="${id}">${id} &middot; ${title}</option>`,
).join('');

const WORKBENCH_TAB_BUTTONS = WORKBENCH_TABS.map(
  ({ id, label }) => `
    <button
      type="button"
      id="workbench-tab-${id}"
      role="tab"
      data-workbench-tab="${id}"
      aria-controls="workspace"
    >${label}</button>
  `,
).join('');

/** Static framework-neutral workbench chrome mounted around every adapter host. */
export const PLAYGROUND_MARKUP = `
  <div class="playground-shell" data-testid="playground-shell">
    <header class="topbar">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <div>
          <h1>Liquid Glass</h1>
          <p>Optical workbench</p>
        </div>
      </div>

      <nav class="workbench-tabs" role="tablist" aria-label="Workbench">
        ${WORKBENCH_TAB_BUTTONS}
      </nav>

      <label class="scene-picker" for="scene-control">
        <span>Scene</span>
        <select id="scene-control" data-testid="scene-select">
          ${SCENE_OPTIONS}
        </select>
      </label>

      <div class="topbar-actions">
        <div class="segment-control framework-switcher" aria-label="Framework">
          <button type="button" data-framework="vue">Vue</button>
          <button type="button" data-framework="react">React</button>
          <button type="button" data-framework="solid">Solid</button>
        </div>

        <label class="binary-toggle glass-toggle">
          <span>Glass</span>
          <input type="checkbox" data-testid="glass-toggle" />
          <span class="toggle-track" aria-hidden="true"><span></span></span>
        </label>
      </div>
    </header>

    <main
      id="workspace"
      class="workspace"
      role="tabpanel"
      aria-labelledby="workbench-tab-lab"
    >
      <section class="stage" aria-label="Liquid glass stage">
        <div id="framework-host" class="framework-host"></div>
        <div id="stage-source" class="stage-coordinate stage-coordinate-top" aria-hidden="true">01 / CUSTOM CANVAS</div>
        <div id="stage-pipeline" class="stage-coordinate stage-coordinate-bottom" aria-hidden="true">1440 &middot; WEBGL2 &middot; UNIFORM</div>
      </section>

      <aside class="inspector" aria-label="Workbench controls">
        <header class="inspector-heading">
          <p id="scene-kicker">SCENE 001</p>
          <h2 id="scene-title">Single material</h2>
        </header>

        <div class="control-list">
          ${LAB_INSPECTOR_MARKUP}

          <div class="fixed-scene-panel" data-fixed-panel>
            <div class="scene-action-panel" data-scene-actions="S003">
              <button type="button" data-action="mutate-dom">Mutate DOM</button>
              <button type="button" data-action="refresh-backdrop">Refresh capture</button>
            </div>

            <div
              class="scene-action-panel lifecycle-actions"
              data-scene-actions="S012"
              aria-label="Context diagnostic actions"
            >
              <button
                type="button"
                data-action="remount-context"
                title="Remount context"
                aria-label="Remount context"
              ><span aria-hidden="true">&#8634;</span></button>
              <button
                type="button"
                data-action="lose-context"
                title="Lose WebGL context"
                aria-label="Lose WebGL context"
              ><span aria-hidden="true">&#8722;</span></button>
              <button
                type="button"
                data-action="restore-context"
                title="Restore WebGL context"
                aria-label="Restore WebGL context"
              ><span aria-hidden="true">&#10227;</span></button>
            </div>

            <div class="mode-control viewport-control" data-scene-controls="S006">
              <span>Capture</span>
              <div class="segment-control viewport-switcher" aria-label="Capture bounds">
                <button type="button" data-viewport-mode="full">Full source</button>
                <button type="button" data-viewport-mode="bounded">Viewport</button>
              </div>
            </div>
          </div>

          <label class="range-control global-render-precision">
            <span>Render precision</span>
            <output
              for="render-precision-control"
              data-render-precision-output
            >${DEFAULT_RENDER_PRECISION.toFixed(2)}x</output>
            <input
              id="render-precision-control"
              type="range"
              min="${MINIMUM_RENDER_PRECISION}"
              max="${MAXIMUM_RENDER_PRECISION}"
              step="${RENDER_PRECISION_STEP}"
              value="${DEFAULT_RENDER_PRECISION}"
              data-render-precision-control
            />
          </label>

          <label class="binary-toggle debug-toggle">
            <span>Live diagnostics</span>
            <input type="checkbox" data-debug-toggle />
            <span class="toggle-track" aria-hidden="true"><span></span></span>
          </label>

          <div class="mode-control shared-render-mode-control">
            <span>Render mode</span>
            <div class="segment-control render-mode-switcher" aria-label="Render mode">
              <button type="button" data-render-mode="uniform">Uniform</button>
              <button type="button" data-render-mode="dedicated">Dedicated</button>
            </div>
          </div>

          <div class="mode-control shared-renderer-control">
            <span>Renderer</span>
            <div class="segment-control fallback-switcher" aria-label="Renderer mode">
              <button type="button" data-fallback-mode="webgl">WebGL</button>
              <button type="button" data-fallback-mode="css">CSS fallback</button>
            </div>
          </div>
        </div>

        <dl class="scene-facts">
          <div><dt>Materials</dt><dd id="material-count">1</dd></div>
          <div><dt>Render mode</dt><dd id="render-mode-fact">Uniform</dd></div>
          <div><dt>Presentation</dt><dd id="effective-renderer">WebGL2</dd></div>
          <div><dt>Backdrop</dt><dd id="backdrop-type">Canvas 2D</dd></div>
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
        <div><dt>FPS</dt><dd id="diagnostic-fps">--</dd></div>
        <div><dt>Capture</dt><dd id="diagnostic-capture">--</dd></div>
        <div><dt>Canvas</dt><dd id="diagnostic-canvas">0 &times; 0</dd></div>
        <div><dt>Contexts</dt><dd id="diagnostic-contexts">0 live</dd></div>
        <div><dt>Resources</dt><dd id="diagnostic-resources">0 live</dd></div>
        <div><dt>GL error</dt><dd id="diagnostic-error" data-testid="gl-error">&mdash;</dd></div>
      </dl>
    </footer>
  </div>
`;
