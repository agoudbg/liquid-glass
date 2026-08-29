import type { TypedEventEmitter } from '../events/TypedEventEmitter';
import type { TextureDirtyReason } from '../types/context';
import type { GlassEventMap } from '../types/events';
import { runTasksPreservingFirstFailure } from '../utils/run-tasks';
import type { ContextRenderCoordinator } from './ContextRenderCoordinator';
import type { DomBackdropCaptureController } from './DomBackdropCaptureController';

/** Own context refresh publication and DOM-capture routing. */
export class ContextRefreshController {
  /** Bind one context's event, capture, renderer, and fallback owners. */
  public constructor(
    private readonly emitter: TypedEventEmitter<GlassEventMap>,
    private readonly domCapture: DomBackdropCaptureController,
    private readonly renderCoordinator: ContextRenderCoordinator,
    private readonly isFallbackMode: () => boolean,
  ) {}

  /** Request capture-aware work for a public refresh. */
  public refresh(reason: TextureDirtyReason): void {
    this.request(reason, (dirtyReason) => this.domCapture.request(dirtyReason));
  }

  /** Request a composite that reuses current DOM capture pixels. */
  public composite(reason: TextureDirtyReason): void {
    this.request(
      reason,
      (dirtyReason) => this.domCapture.requestComposite(dirtyReason),
    );
  }

  private request(
    reason: TextureDirtyReason,
    requestDomCapture: (dirtyReason: TextureDirtyReason) => boolean,
  ): void {
    runTasksPreservingFirstFailure([
      () => this.emitter.emit('compositeRequested', reason, 'high'),
      () => {
        if (this.isFallbackMode() || !requestDomCapture(reason)) {
          this.renderCoordinator.renderFrame();
        }
      },
    ]);
  }
}
