import type { CanvasLike, ShaderCornerRadii } from './common';
import type { GlassEventMap } from './events';
import type { ProxyTargetInterface } from './external-material';
import type {
  InteractionConfig,
  InteractionOutput,
  InteractionPreset,
  InteractionState,
  PartialInteractionConfig,
} from './interaction';

/**
 * Canvas presentation strategy used by a glass context.
 */
export type RenderMode = 'uniform' | 'dedicated';

/**
 * Whether viewport-limited capture is active.
 */
export type ViewportMode = boolean;

/**
 * Whether CSS fallback presentation is active.
 */
export type FallbackMode = boolean;

/**
 * Backdrop brightness classification used for adaptive material styling.
 */
export type AutomaticBackgroundColorMode = 'light' | 'dark' | 'ultra_light' | 'ultra_dark';

/**
 * Reason that invalidated a captured texture or composite frame.
 */
export type TextureDirtyReason =
  | 'layout'
  | 'scroll'
  | 'visibility'
  | 'material_interaction'
  | 'structural'
  | 'external'
  | 'viewport'
  | 'fallback'
  | 'unknown';

/** Feedback emitted when a material's lifecycle or layout changes. */
export type MaterialStateFeedback =
  | { type: 'inserted' }
  | { type: 'removed' }
  | { type: 'moved' }
  | { type: 'resized' };

/** Feedback emitted when backdrop sampling changes a material's theme. */
export interface MaterialThemeFeedback {
  /** Theme feedback discriminator. */
  type: 'theme-changed';
  /** Sampled backdrop brightness class. */
  themeColorMode: AutomaticBackgroundColorMode;
  /** Optional average luma in the inclusive 0-255 range. */
  averageLuminance?: number;
}

/** Typed material feedback surfaced to framework adapters. */
export type MaterialFeedback = MaterialStateFeedback | MaterialThemeFeedback;

/**
 * Priority assigned to a composite request.
 */
export type CompositePriority = 'high' | 'low';

/**
 * Brightness thresholds for automatic material theme classification.
 */
export interface ThemeColorThresholds {
  /** Highest luma classified as ultra dark. */
  ultraDarkMax?: number;
  /** Highest luma classified as dark. */
  darkMax?: number;
  /** Lowest luma classified as ultra light. */
  ultraLightMin?: number;
}

/**
 * Options used when creating one independent glass context.
 */
export interface GlassContextOptions {
  /** Shared or per-material canvas presentation. */
  renderMode?: RenderMode;
  /** Render scale multiplier, where zero selects a safe automatic value. */
  renderPrecision?: number;
  /** Whether CSS backdrop filtering may replace unavailable WebGL2. */
  enableFallback?: boolean;
  /** Whether inactive-page presentation may reduce visual effects. */
  enableBlurredEffect?: boolean;
  /** Whether the context owns an internally scrolling content area. */
  scrollable?: boolean;
  /** Stacking level applied to core-owned presentation canvases. */
  canvasZIndex?: number;
  /** Whether diagnostic events and measurements are enabled. */
  debug?: boolean;
  /** Threshold overrides for automatic theme classification. */
  themeColorThresholds?: ThemeColorThresholds;
}

/**
 * Drawing callback used by a programmatic backdrop source.
 */
export type CustomDrawCallback = (
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
) => void;

/** Options shared by every backdrop source. */
export interface BaseBackdropSourceConfig {
  /** Explicit stacking order. */
  zIndex?: number;
  /** Optional capture scale override. */
  scale?: number;
  /** Optional fill behind captured content. */
  backgroundColor?: string;
  /** Whether source size changes trigger capture. */
  watchResize?: boolean;
  /** Whether descendant mutations trigger capture. */
  watchNodeChanges?: boolean;
  /** Whether movement without resizing triggers remeasurement. */
  watchPositionChanges?: boolean;
}

/** Supported DOM rasterization implementations. */
export type DomCaptureLibrary = 'html-to-image' | 'html2canvas';

/** Configuration for a DOM-backed backdrop source. */
export interface DomBackdropSourceConfig extends BaseBackdropSourceConfig {
  /** Discriminator for DOM capture. */
  kind: 'dom';
  /** DOM subtree captured behind glass materials. */
  element: HTMLElement;
  /** Rasterizer selected for this source. */
  captureLibrary?: DomCaptureLibrary;
  /** Optional bounded capture policy for large scrolling content. */
  viewportCapture?: boolean | ViewportCaptureConfig;
}

/** Configuration for a programmatically drawn canvas backdrop. */
export interface CanvasBackdropSourceConfig extends BaseBackdropSourceConfig {
  /** Discriminator for custom canvas drawing. */
  kind: 'canvas';
  /** Visible canvas receiving a copy of the core-owned authoritative bitmap. */
  element: HTMLCanvasElement;
  /** Callback invoked whenever the source needs to be redrawn. */
  draw: CustomDrawCallback;
}

/** Any backdrop source accepted by a glass context. */
export type BackdropSourceConfig = DomBackdropSourceConfig | CanvasBackdropSourceConfig;

/**
 * User-provided options for one glass material element.
 */
export interface MaterialConfig {
  /** DOM element represented by this material. */
  element: HTMLElement;
  /** Default radius in CSS pixels. */
  radius?: number;
  /** Top-right radius override. */
  radiusTR?: number;
  /** Bottom-right radius override. */
  radiusBR?: number;
  /** Bottom-left radius override. */
  radiusBL?: number;
  /** Top-left radius override. */
  radiusTL?: number;
  /** Optical glass thickness. */
  thickness?: number;
  /** Index of refraction. */
  refractIndex?: number;
  /** Refraction displacement multiplier. */
  refractIntensity?: number;
  /** Frosted-glass blur amount. */
  blur?: number;
  /** Chromatic dispersion strength. */
  dispersion?: number;
  /** Whether pointer-driven transforms are disabled. */
  disableInteractions?: boolean;
  /** Whether hover-only input is ignored while press and held movement remain active. */
  onlyClickInteractions?: boolean;
  /** Whether material translation and hover-follow are suppressed for a moveable host. */
  isMoveable?: boolean;
  /** Stable interaction preset name. */
  interactionPreset?: InteractionPreset;
  /** Preset overrides or complete custom interaction configuration. */
  interactionConfig?: PartialInteractionConfig;
  /** Per-material presentation strategy override. */
  renderMode?: RenderMode;
  /** Explicit order within the render pipeline. */
  renderOrder?: number;
  /** Optional context that renders this material on behalf of its owner. */
  proxyTarget?: ProxyTargetInterface;
}

/** Mutable fields accepted by an existing material registration. */
export type MaterialChanges = Partial<Omit<MaterialConfig, 'element'>>;

/** Framework-facing CSS presentation state for one material. */
export interface MaterialPresentationState {
  /** Latest transform, opacity, background, and highlight output. */
  interactionOutput: InteractionOutput;
  /** Fully resolved preset configuration used by the interaction engine. */
  interactionConfig: InteractionConfig;
  /** Current backdrop-derived appearance mode. */
  themeColorMode: AutomaticBackgroundColorMode;
  /** Whether CSS fallback presentation currently replaces WebGL output. */
  fallbackMode: boolean;
  /** Whether inactive-page presentation should suppress decorative effects. */
  blurred: boolean;
}

/** Listener invoked synchronously with an isolated material presentation snapshot. */
export type MaterialPresentationListener = (
  presentation: MaterialPresentationState,
) => void;

/** Shared lifecycle state exposed by a registration handle. */
export interface RegistrationHandle {
  /** Stable identifier generated by the owning context. */
  readonly id: string;
  /** Whether `destroy()` has already released this registration. */
  readonly destroyed: boolean;
  /** Idempotently release this registration from its owning context. */
  destroy(): void;
}

/** Handle returned for a registered backdrop source. */
export interface BackdropSourceHandle<
  Config extends BackdropSourceConfig = BackdropSourceConfig,
> extends RegistrationHandle {
  /** Apply validated changes without replacing the registration handle. */
  update(changes: BackdropSourceChanges<Config>): void;
  /** Mark this source dirty and request a new capture or draw. */
  refresh(): void;
}

/** Mutable fields accepted by a registered backdrop source. */
export type BackdropSourceChanges<Config extends BackdropSourceConfig> =
  Config extends BackdropSourceConfig
    ? Partial<Omit<Config, 'element' | 'kind'>>
    : never;

/** Handle returned for a registered material. */
export interface MaterialHandle extends RegistrationHandle {
  /**
   * Validate and commit material changes without replacing the DOM element.
   *
   * Config and presentation changes are synchronous, including presentation
   * listener errors. The corresponding `materialUpdated` event and draw are
   * coalesced by animation frame; true no-ops schedule neither. A reentrant
   * update may be included in the current live-config draw, then emit during
   * the next frame without drawing again. Frame listener errors propagate only
   * after executable peer events, animation publication, rendering, and rearm
   * work have completed.
   */
  update(changes: MaterialChanges): void;
  /** Read an isolated snapshot of the current framework-facing presentation. */
  getPresentation(): MaterialPresentationState;
  /** Subscribe to presentation changes and immediately receive the current value. */
  onPresentation(listener: MaterialPresentationListener): () => void;
  /** Forward the latest framework pointer state to the interaction engine. */
  setInteractionState(state: InteractionState): void;
  /** Re-measure this material during the next composite. */
  refreshLayout(): void;
}

/**
 * Fully measured and resolved data consumed by the renderer.
 */
export interface MaterialRenderData {
  /** Material bounds in the owning context. */
  rect: DOMRectReadOnly;
  /** Complete CSS transform matrix. */
  transform: DOMMatrixReadOnly;
  /** Corner radii in shader uniform order. */
  radii: ShaderCornerRadii;
  /** Cumulative material opacity. */
  opacity: number;
  /** Resolved optical thickness. */
  thickness: number;
  /** Resolved index of refraction. */
  refractIndex: number;
  /** Resolved refraction intensity. */
  refractIntensity: number;
  /** Resolved blur amount. */
  blur: number;
  /** Resolved dispersion strength. */
  dispersion: number;
  /** Optional sampled backdrop theme. */
  themeColorMode?: AutomaticBackgroundColorMode;
}

/**
 * Device-pixel scissor rectangle used for a material draw call.
 */
export interface ScissorRect {
  /** Horizontal device-pixel offset. */
  x: number;
  /** Vertical device-pixel offset. */
  y: number;
  /** Device-pixel width. */
  width: number;
  /** Device-pixel height. */
  height: number;
}

/**
 * Imperative framework-neutral API owned by one container.
 */
export interface GlassContext {
  /** Core-owned uniform presentation canvas appended to the container. */
  readonly canvas: HTMLCanvasElement;
  /** Whether this context has released all owned resources. */
  readonly destroyed: boolean;
  /** Whether CSS fallback presentation is currently active. */
  readonly fallbackMode: boolean;
  /** Register a DOM capture source and return its lifecycle handle. */
  addBackdropSource(
    config: DomBackdropSourceConfig,
  ): BackdropSourceHandle<DomBackdropSourceConfig>;
  /** Register a custom canvas source and return its lifecycle handle. */
  addBackdropSource(
    config: CanvasBackdropSourceConfig,
  ): BackdropSourceHandle<CanvasBackdropSourceConfig>;
  /** Register a material and return its lifecycle handle. */
  addMaterial(config: MaterialConfig): MaterialHandle;
  /** Replace the current context option snapshot without replacing registrations. */
  updateOptions(options: GlassContextOptions): void;
  /** Create the delegation interface exposed to nested contexts. */
  createProxyInterface(): ProxyTargetInterface;
  /** Force or clear CSS fallback presentation. */
  setFallbackMode(enabled: boolean): void;
  /** Enable or disable viewport-limited capture. */
  setViewportMode(enabled: boolean): void;
  /** Request a new composition for an explicit dirty reason. */
  refresh(reason?: TextureDirtyReason): void;
  /** Release every observer, animation frame, and graphics resource. */
  destroy(): void;
  /** Subscribe to a typed context event. */
  on<Event extends keyof GlassEventMap>(
    event: Event,
    handler: GlassEventMap[Event],
  ): () => void;
  /** Unsubscribe from a typed context event. */
  off<Event extends keyof GlassEventMap>(event: Event, handler: GlassEventMap[Event]): void;
}

/**
 * Captured viewport region within a larger backdrop source.
 */
export interface ViewportCaptureRect {
  /** Horizontal source offset in CSS pixels. */
  x: number;
  /** Vertical source offset in CSS pixels. */
  y: number;
  /** Captured width in CSS pixels. */
  width: number;
  /** Captured height in CSS pixels. */
  height: number;
}

/**
 * Viewport capture tuning for large scrolling sources.
 */
export interface ViewportCaptureConfig {
  /** Extra captured pixels above and below the viewport. */
  bufferY?: number;
  /** Extra captured pixels to the left and right of the viewport. */
  bufferX?: number;
  /** Whether viewport-limited capture is enabled. */
  enabled?: boolean;
}

/**
 * Payload shared by capture and full-composite events.
 */
export interface CanvasRenderPayload {
  /** Rendered canvas. */
  canvas: CanvasLike;
  /** Rendered width in pixels. */
  width: number;
  /** Rendered height in pixels. */
  height: number;
}
