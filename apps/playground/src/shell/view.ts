import {
  isDomCaptureState,
  resolveStageSource,
} from '../shared/scene-backdrops';
import { getSceneDefinition } from '../shared/scene-catalog';
import type {
  HostResourceAudit,
  HostRuntimeReport,
  PlaygroundState,
} from '../shared/types';
import {
  renderCopyStatus,
  renderLabWorkbench,
} from './lab-view';

/** DOM facade for the framework-neutral playground shell. */
export class PlaygroundShellView {
  /** Static container where the active framework host mounts. */
  public readonly frameworkHost: HTMLElement;
  /** Static shell toggle controlling presentation visibility. */
  public readonly glassToggle: HTMLInputElement;
  /** Static canonical scene selector. */
  public readonly sceneSelect: HTMLSelectElement;
  /** Static global control for the backing-canvas render scale. */
  public readonly renderPrecisionInput: HTMLInputElement;
  /** Static global toggle for optional core measurements. */
  public readonly debugToggle: HTMLInputElement;
  private readonly renderPrecisionOutput: HTMLOutputElement;
  private readonly refreshBackdropButtons: HTMLButtonElement[];

  /** Resolve the required static shell elements within one app root. */
  public constructor(private readonly app: HTMLElement) {
    this.frameworkHost = this.requireElement<HTMLElement>('#framework-host');
    this.glassToggle = this.requireElement<HTMLInputElement>(
      '[data-testid="glass-toggle"]',
    );
    this.sceneSelect = this.requireElement<HTMLSelectElement>(
      '[data-testid="scene-select"]',
    );
    this.renderPrecisionInput = this.requireElement<HTMLInputElement>(
      '[data-render-precision-control]',
    );
    this.debugToggle = this.requireElement<HTMLInputElement>(
      '[data-debug-toggle]',
    );
    this.renderPrecisionOutput = this.requireElement<HTMLOutputElement>(
      '[data-render-precision-output]',
    );
    this.refreshBackdropButtons = this.queryElements<HTMLButtonElement>(
      '[data-action="refresh-backdrop"], [data-action="refresh-lab-backdrop"]',
    );
    if (this.refreshBackdropButtons.length === 0) {
      throw new Error('Missing playground backdrop refresh actions.');
    }
  }

  /** Resolve one required shell-owned element by scoped selector. */
  public requireElement<ElementType extends Element>(selector: string): ElementType {
    const element = this.app.querySelector<ElementType>(selector);
    if (!element) throw new Error(`Missing playground element: ${selector}`);
    return element;
  }

  /** Snapshot shell-owned elements matching one scoped selector. */
  public queryElements<ElementType extends Element>(selector: string): ElementType[] {
    return [...this.app.querySelectorAll<ElementType>(selector)];
  }

  /** Enable the capture refresh command only while a host supplies it. */
  public setBackdropRefreshAvailable(available: boolean): void {
    for (const button of this.refreshBackdropButtons) {
      button.disabled = !available;
    }
  }

  /** Publish accessible copy feedback beside the Lab action buttons. */
  public setCopyStatus(
    message: string,
    status: 'error' | 'success' | 'idle',
  ): void {
    renderCopyStatus(this.app, message, status);
  }

  /** Expose whether a browser accepted the latest context diagnostic action. */
  public setContextActionStatus(status: 'requested' | 'unsupported'): void {
    this.app.dataset.contextActionStatus = status;
  }

  /** Render URL-addressable state without reading framework-host material nodes. */
  public renderState(
    state: PlaygroundState,
    backdropRefreshAvailable: boolean,
  ): void {
    for (const button of this.queryElements<HTMLButtonElement>(
      'button[data-framework]',
    )) {
      const active = button.dataset.framework === state.framework;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.sceneSelect.value = state.scene;
    for (const button of this.queryElements<HTMLButtonElement>(
      '[data-fallback-mode]',
    )) {
      const active = (button.dataset.fallbackMode === 'css')
        === state.fallbackEnabled;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const button of this.queryElements<HTMLButtonElement>(
      '[data-viewport-mode]',
    )) {
      const active = (button.dataset.viewportMode === 'bounded')
        === state.viewportEnabled;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const button of this.queryElements<HTMLButtonElement>(
      '[data-render-mode]',
    )) {
      const active = button.dataset.renderMode === state.renderMode;
      button.dataset.active = String(active);
      button.setAttribute('aria-pressed', String(active));
    }

    this.glassToggle.checked = state.glassEnabled;
    this.debugToggle.checked = state.debugEnabled;
    this.renderPrecisionInput.value = String(state.renderPrecision);
    this.renderPrecisionOutput.value = `${state.renderPrecision.toFixed(2)}x`;
    renderLabWorkbench(this.app, state);
    const sceneDefinition = getSceneDefinition(state.scene);
    this.setText('#scene-kicker', `SCENE ${state.scene.slice(1)}`);
    this.setText('#scene-title', sceneDefinition.title);
    this.setText('#material-count', String(sceneDefinition.materialCount));
    this.setText('#render-mode-fact', capitalize(state.renderMode));
    this.setText(
      '#backdrop-type',
      isDomCaptureState(state) ? 'Captured DOM' : 'Canvas 2D',
    );
    this.setText('#stage-source', resolveStageSource(state));
    this.setText(
      '[data-action="mutate-dom"]',
      state.domVariant === 'source' ? 'Mutate DOM' : 'Restore source',
    );
    this.setBackdropRefreshAvailable(backdropRefreshAvailable);

    this.app.dataset.framework = state.framework;
    this.app.dataset.scene = state.scene;
    this.app.dataset.renderMode = state.renderMode;
    this.app.dataset.renderPrecision = String(state.renderPrecision);
    this.app.dataset.debug = state.debugEnabled ? 'on' : 'off';
    this.app.dataset.glass = state.glassEnabled ? 'on' : 'off';
    this.app.dataset.fallbackRequest = state.fallbackEnabled ? 'on' : 'off';
    this.app.dataset.viewportRequest = state.viewportEnabled ? 'on' : 'off';
    this.app.dataset.domVariant = state.domVariant;
    this.app.dataset.labSource = state.lab.source.kind;
    this.app.dataset.testMode = String(state.testMode);
    if (state.testFixture) {
      this.app.dataset.testFixture = state.testFixture;
    } else {
      delete this.app.dataset.testFixture;
    }
    this.app.dataset.oracleMode = String(state.oracleMode);
    this.frameworkHost.dataset.framework = state.framework;
    this.frameworkHost.dataset.scene = state.scene;
    this.frameworkHost.dataset.glass = state.glassEnabled ? 'on' : 'off';
    this.frameworkHost.dataset.fallbackRequest = state.fallbackEnabled ? 'on' : 'off';
    this.frameworkHost.dataset.viewportRequest = state.viewportEnabled ? 'on' : 'off';
    document.body.dataset.playgroundScene = state.scene;
  }

  /** Render diagnostics and their browser-test data attributes. */
  public renderDiagnostics(
    state: PlaygroundState,
    report: HostRuntimeReport,
    audit: HostResourceAudit,
  ): void {
    const ready = report.status === 'ready';
    const statusLabel = report.status === 'error'
      ? 'Renderer error'
      : ready
        ? (report.fallbackMode ? 'CSS fallback active' : 'WebGL2 ready')
        : 'Initializing';
    this.setText('#gl-status', statusLabel);
    this.setText('#diagnostic-framework', capitalize(state.framework));
    this.setText('#diagnostic-scene', state.scene);
    this.setText('#effective-renderer', report.fallbackMode ? 'CSS fallback' : 'WebGL2');
    this.setText(
      '#stage-pipeline',
      `${String(report.canvasWidth || window.innerWidth)} · ${
        report.fallbackMode ? 'CSS FILTER' : 'WEBGL2'
      } · ${state.renderMode.toUpperCase()}`,
    );
    this.setText(
      '#diagnostic-fps',
      formatMeasurement(audit.primary?.metrics?.framesPerSecond, 'fps'),
    );
    this.setText(
      '#diagnostic-capture',
      formatMeasurement(audit.primary?.metrics?.lastCaptureDurationMs, 'ms'),
    );
    this.setText(
      '#diagnostic-canvas',
      `${String(report.canvasWidth)} × ${String(report.canvasHeight)}`,
    );
    this.setText(
      '#diagnostic-contexts',
      `${String(audit.activeContextCount)} live`,
    );
    this.setText(
      '#diagnostic-resources',
      `${String(audit.liveResourceCount)} live`,
    );
    this.setText(
      '#diagnostic-error',
      report.error ?? report.glError ?? 'NO_ERROR',
    );

    this.app.dataset.ready = String(ready);
    this.app.dataset.glStatus = report.status;
    this.app.dataset.fallback = report.fallbackMode ? 'on' : 'off';
    this.app.dataset.glError = report.error ?? report.glError ?? 'NO_ERROR';
    this.app.dataset.frameCount = String(report.frameCount);
    this.app.dataset.captureCount = String(report.captureCount);
    const viewport = report.lastCapture?.viewportRect;
    this.app.dataset.captureX = String(viewport?.x ?? 0);
    this.app.dataset.captureY = String(viewport?.y ?? 0);
    this.app.dataset.captureWidth = String(viewport?.width ?? 0);
    this.app.dataset.captureHeight = String(viewport?.height ?? 0);
    this.app.dataset.captureBitmapWidth = String(report.lastCapture?.width ?? 0);
    this.app.dataset.captureBitmapHeight = String(report.lastCapture?.height ?? 0);
    this.app.dataset.rendererState =
      audit.primary?.presentation.rendererState ?? 'unavailable';
    this.app.dataset.contextLossCount = String(
      audit.primary?.metrics?.contextLossCount ?? 0,
    );
    this.app.dataset.contextRestoreCount = String(
      audit.primary?.metrics?.contextRestoreCount ?? 0,
    );
    this.app.dataset.activeContexts = String(audit.activeContextCount);
    this.app.dataset.liveResources = String(audit.liveResourceCount);
    this.app.dataset.retiredContexts = String(audit.retiredContextCount);
    this.app.dataset.retiredDestroyedContexts = String(
      audit.retiredDestroyedContextCount,
    );
    this.app.dataset.retiredResources = String(audit.retiredResourceCount);
    this.app.dataset.remountCount = String(audit.remountCount);
    this.frameworkHost.dataset.ready = String(ready);
    this.frameworkHost.dataset.fallback = report.fallbackMode ? 'on' : 'off';
    document.documentElement.dataset.playgroundReady = String(ready);
  }

  private setText(selector: string, value: string): void {
    this.requireElement<HTMLElement>(selector).textContent = value;
  }
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatMeasurement(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined
    ? '--'
    : `${value.toFixed(1)} ${unit}`;
}
