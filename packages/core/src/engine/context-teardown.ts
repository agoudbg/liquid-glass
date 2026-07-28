import { TypedEventEmitter } from '../events/TypedEventEmitter';
import type { WebGLRenderer } from '../renderer';
import type { GlassEventMap } from '../types/events';
import { runTasksPreservingFirstFailure } from '../utils/run-tasks';
import type { ContextPresentation } from './context-presentation';
import type { ContextDiagnosticsController } from './ContextDiagnosticsController';
import type { ContextEventController } from './ContextEventController';
import type { ContextRenderCoordinator } from './ContextRenderCoordinator';
import type { DomBackdropCaptureController } from './DomBackdropCaptureController';
import type { MaterialPresentationController } from './MaterialPresentationController';
import type { BackdropRegistration } from './registrations';

/** Owners released together when one glass context becomes terminal. */
export interface ContextTeardownOwners {
  readonly canvas: HTMLCanvasElement;
  readonly content: HTMLElement;
  readonly contextEvents: ContextEventController;
  readonly diagnostics: ContextDiagnosticsController;
  readonly domCapture: DomBackdropCaptureController;
  readonly emitter: TypedEventEmitter<GlassEventMap>;
  readonly markDestroyed: () => void;
  readonly materials: MaterialPresentationController;
  readonly onDestroyed: () => void;
  readonly presentation: ContextPresentation;
  readonly renderer: WebGLRenderer | null;
  readonly renderCoordinator: ContextRenderCoordinator;
  readonly sources: Map<string, BackdropRegistration>;
}

/**
 * Release every context owner, publish terminal state, and preserve the first failure.
 */
export function teardownContext(owners: ContextTeardownOwners): void {
  runTasksPreservingFirstFailure([
    () => owners.contextEvents.destroy(),
    () => owners.domCapture.destroy(),
    () => owners.presentation.destroy(),
    () => owners.materials.destroy(),
    () => {
      for (const source of owners.sources.values()) {
        source.destroyed = true;
      }
      owners.sources.clear();
    },
    () => owners.renderer?.destroy(),
    () => owners.renderCoordinator.destroy(),
    () => {
      if (owners.canvas.parentNode === owners.content) {
        owners.content.removeChild(owners.canvas);
      }
    },
    owners.markDestroyed,
    owners.onDestroyed,
    () => owners.diagnostics.publish(),
    () => owners.emitter.emit('destroyed'),
    () => owners.emitter.removeAllListeners(),
  ]);
}
