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
} from './context';

/**
 * Payload emitted after one backdrop source has been captured.
 */
export interface BackdropCapturedPayload extends CanvasRenderPayload {
  /** Identifier of the captured source. */
  id: string;
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
 * Strongly typed synchronous events emitted by one glass context.
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
  /** A material configuration changed. */
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
