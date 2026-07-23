import { getSceneDefinition } from '../shared/scene-catalog';
import {
  isLabSceneEditable,
  resolveSceneControlValues,
} from '../shared/scene-render-options';
import type {
  HostRuntimeReport,
  PlaygroundState,
} from '../shared/types';

/** DOM facade for the framework-neutral playground shell. */
export class PlaygroundShellView {
  /** Static container where the active framework host mounts. */
  public readonly frameworkHost: HTMLElement;
  /** Static shell toggle controlling presentation visibility. */
  public readonly glassToggle: HTMLInputElement;
  /** Static canonical scene selector. */
  public readonly sceneSelect: HTMLSelectElement;
  private readonly refreshBackdropButton: HTMLButtonElement;

  /** Resolve the required static shell elements within one app root. */
  public constructor(private readonly app: HTMLElement) {
    this.frameworkHost = this.requireElement<HTMLElement>('#framework-host');
    this.glassToggle = this.requireElement<HTMLInputElement>(
      '[data-testid="glass-toggle"]',
    );
    this.sceneSelect = this.requireElement<HTMLSelectElement>(
      '[data-testid="scene-select"]',
    );
    this.refreshBackdropButton = this.requireElement<HTMLButtonElement>(
      '[data-action="refresh-backdrop"]',
    );
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
    this.refreshBackdropButton.disabled = !available;
  }

  /** Render URL-addressable state without reading framework-host material nodes. */
  public renderState(
    state: PlaygroundState,
    backdropRefreshAvailable: boolean,
  ): void {
    for (const button of this.queryElements<HTMLButtonElement>('[data-framework]')) {
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

    this.glassToggle.checked = state.glassEnabled;
    const labEditable = isLabSceneEditable(state);
    for (const input of this.queryElements<HTMLInputElement>('[data-control]')) {
      input.setAttribute('aria-disabled', String(!labEditable));
      input.tabIndex = labEditable ? 0 : -1;
    }
    const controlValues = resolveSceneControlValues(state);
    this.setInputValue('thickness', controlValues.thickness);
    this.setInputValue('refractIndex', controlValues.refractIndex);
    this.setInputValue('refractIntensity', controlValues.refractIntensity);
    this.setInputValue('radius', controlValues.radius);
    this.setInputValue('renderPrecision', controlValues.renderPrecision);
    this.setText(
      '#thickness-value',
      `${String(controlValues.thickness)} px`,
    );
    this.setText('#ior-value', controlValues.refractIndex.toFixed(2));
    this.setText(
      '#intensity-value',
      controlValues.refractIntensity.toFixed(2),
    );
    this.setText('#radius-value', `${String(controlValues.radius)} px`);
    this.setText(
      '#precision-value',
      `${controlValues.renderPrecision.toFixed(1)}×`,
    );
    const sceneDefinition = getSceneDefinition(state.scene);
    this.setText('#scene-kicker', `SCENE ${state.scene.slice(1)}`);
    this.setText('#scene-title', sceneDefinition.title);
    this.setText('#material-count', String(sceneDefinition.materialCount));
    this.setText(
      '#backdrop-type',
      sceneDefinition.captureKind === 'canvas' ? 'Canvas 2D' : 'Captured DOM',
    );
    this.setText('#stage-source', sceneDefinition.stageSource);
    this.setText(
      '[data-action="mutate-dom"]',
      state.domVariant === 'source' ? 'Mutate DOM' : 'Restore source',
    );
    this.setBackdropRefreshAvailable(backdropRefreshAvailable);

    this.app.dataset.framework = state.framework;
    this.app.dataset.scene = state.scene;
    this.app.dataset.renderMode = state.renderMode;
    this.app.dataset.glass = state.glassEnabled ? 'on' : 'off';
    this.app.dataset.fallbackRequest = state.fallbackEnabled ? 'on' : 'off';
    this.app.dataset.viewportRequest = state.viewportEnabled ? 'on' : 'off';
    this.app.dataset.domVariant = state.domVariant;
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
      } · UNIFORM`,
    );
    this.setText('#diagnostic-frames', String(report.frameCount));
    this.setText('#diagnostic-captures', String(report.captureCount));
    this.setText(
      '#diagnostic-canvas',
      `${String(report.canvasWidth)} × ${String(report.canvasHeight)}`,
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
    this.frameworkHost.dataset.ready = String(ready);
    this.frameworkHost.dataset.fallback = report.fallbackMode ? 'on' : 'off';
    document.documentElement.dataset.playgroundReady = String(ready);
  }

  private setInputValue(control: string, value: number): void {
    this.requireElement<HTMLInputElement>(`[data-control="${control}"]`).value = String(value);
  }

  private setText(selector: string, value: string): void {
    this.requireElement<HTMLElement>(selector).textContent = value;
  }
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
