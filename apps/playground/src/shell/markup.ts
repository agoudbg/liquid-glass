import { SCENE_DEFINITIONS } from '../shared/scene-catalog';

const SCENE_OPTIONS = SCENE_DEFINITIONS.map(
  ({ id, title }) => `<option value="${id}">${id} &middot; ${title}</option>`,
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
        <div id="stage-source" class="stage-coordinate stage-coordinate-top" aria-hidden="true">01 / CUSTOM CANVAS</div>
        <div id="stage-pipeline" class="stage-coordinate stage-coordinate-bottom" aria-hidden="true">1440 &middot; WEBGL2 &middot; UNIFORM</div>
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
            <output id="precision-value" for="precision-control">1.0&times;</output>
            <input id="precision-control" data-control="renderPrecision" type="range" min="0.5" max="1.5" step="0.1" />
          </label>

          <div class="mode-control">
            <span>Renderer</span>
            <div class="segment-control fallback-switcher" aria-label="Renderer mode">
              <button type="button" data-fallback-mode="webgl">WebGL</button>
              <button type="button" data-fallback-mode="css">CSS fallback</button>
            </div>
          </div>

          <div class="scene-action-panel" data-scene-actions="S003">
            <button type="button" data-action="mutate-dom">Mutate DOM</button>
            <button type="button" data-action="refresh-backdrop">Refresh capture</button>
          </div>

          <div class="mode-control viewport-control" data-scene-controls="S006">
            <span>Capture</span>
            <div class="segment-control viewport-switcher" aria-label="Capture bounds">
              <button type="button" data-viewport-mode="full">Full source</button>
              <button type="button" data-viewport-mode="bounded">Viewport</button>
            </div>
          </div>
        </div>

        <dl class="scene-facts">
          <div><dt>Materials</dt><dd id="material-count">1</dd></div>
          <div><dt>Render mode</dt><dd>Uniform</dd></div>
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
        <div><dt>Frames</dt><dd id="diagnostic-frames">0</dd></div>
        <div><dt>Captures</dt><dd id="diagnostic-captures">0</dd></div>
        <div><dt>Canvas</dt><dd id="diagnostic-canvas">0 &times; 0</dd></div>
        <div><dt>GL error</dt><dd id="diagnostic-error" data-testid="gl-error">&mdash;</dd></div>
      </dl>
    </footer>
  </div>
`;
