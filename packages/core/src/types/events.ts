import type { GlassErrorContext } from '../errors/GlassError';
import type { CanvasLike } from './common';
import type {
  AutomaticBackgroundColorMode,
  CanvasRenderPayload,
  CompositePriority,
  MaterialChanges,
  MaterialConfig,
  MaterialFeedback,
  TextureDirtyReason,
  ViewportCaptureRect,
} from './context';

/**
 * Payload emitted after one backdrop source has been captured.
 */
export interface BackdropCapturedPayload extends CanvasRenderPayload {
  /** Identifier of the captured source. */
  id: string;
  /** Source-local region represented by a bounded DOM capture. */
  viewportRect?: ViewportCaptureRect;
}

/**
 * Payload emitted after the current material set has been rendered.
 */
export interface MaterialsRenderedPayload {
  /** Canvas containing the rendered material set. */
  canvas: CanvasLike;
  /** Optional theme classification keyed by material identifier. */
  themeColors?: Readonly<Record<string, AutomaticBackgroundColorMode>>;
}

/**
 * Strongly typed events emitted by one glass context.
 *
 * Lifecycle and render events are synchronous with their owning operation.
 * Material update events are the exception described on `materialUpdated`.
 */
export interface GlassEventMap {
  /** A source capture completed. */
  backdropCaptured: (payload: BackdropCapturedPayload) => void;
  /** The current material set was drawn. */
  materialsRendered: (payload: MaterialsRenderedPayload) => void;
  /** A complete composition became available for a parent context. */
  fullCanvasRendered: (payload: CanvasRenderPayload) => void;
  /** A material entered the context. */
  materialAdded: (id: string, config: MaterialConfig) => void;
  /** A material left the context. */
  materialRemoved: (id: string) => void;
  /**
   * Material configuration commits coalesced during one animation frame.
   *
   * Config and presentation state are committed synchronously by `update()`;
   * this event is deferred, merges fields last-write-wins by true commit order,
   * and runs before that frame's material-only draw. Listener failures drain
   * executable update, animation, render, and rearm work before propagating.
   */
  materialUpdated: (id: string, changes: MaterialChanges) => void;
  /** CSS fallback presentation changed. */
  fallbackModeChanged: (enabled: boolean) => void;
  /** Viewport-limited capture changed. */
  viewportModeChanged: (enabled: boolean) => void;
  /** A subsystem requested a new composite. */
  compositeRequested: (reason: TextureDirtyReason, priority: CompositePriority) => void;
  /** A material lifecycle or sampled-theme condition changed. */
  materialFeedback: (materialId: string, feedback: MaterialFeedback) => void;
  /** A core ownership boundary surfaced a contextual failure. */
  error: (context: GlassErrorContext) => void;
  /** The context released all owned resources. */
  destroyed: () => void;
}

/**
 * Name of any event emitted by a glass context.
 */
export type GlassEvent = keyof GlassEventMap;
