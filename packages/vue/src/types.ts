import type {
  BackdropSourceHandle,
  CustomDrawCallback,
  DomBackdropSourceConfig,
  DomCaptureLibrary,
  GlassContext,
  GlassContextOptions,
  GlassEngine,
  MaterialAppearanceOptions,
  MaterialConfig,
  MaterialHandle,
  ProxyTargetInterface,
  RenderMode,
  ThemeColorThresholds,
} from '@agou/liquid-glass-core';
import type { ShallowRef } from 'vue';

/** Props accepted by the Vue liquid-glass context owner. */
export interface LiquidGlassProps {
  /** Core context configuration; legacy top-level props take precedence. */
  options?: GlassContextOptions;
  /** Optional shared engine captured on mount; otherwise the component owns one. */
  engine?: GlassEngine;
  /** Enable diagnostic collection. */
  debug?: boolean;
  /** Enable the inactive-page blurred presentation policy. */
  enableBlurredEffect?: boolean;
  /** Select the legacy container rendering strategy. */
  renderMode?: RenderMode;
  /** Scale the backing canvas resolution. */
  renderPrecision?: number;
  /** Mark the container as an internal scroll owner. */
  scrollable?: boolean;
  /** Override automatic background theme thresholds. */
  themeColorThresholds?: ThemeColorThresholds;
  /** Legacy material stacking level; the uniform canvas is placed one level below it. */
  zIndex?: number;
}

/** Minimal imperative surface exposed by the Vue container. */
export interface LiquidGlassExposed {
  /** Read the mounted core context. */
  getContext(): GlassContext | null;
  /** Request a new composite. */
  refresh(): void;
  /** Re-evaluate visibility during the next composite. */
  refreshVisibility(): void;
  /** Create the stable proxy target for nested/delegated materials. */
  getProxyTarget(): ProxyTargetInterface | null;
}

/** Props accepted by a Vue glass material. */
export interface LiquidGlassMaterialProps
  extends Omit<MaterialConfig, 'element'>,
  MaterialAppearanceOptions {}

/** Minimal imperative surface exposed by a Vue material. */
export interface LiquidGlassMaterialExposed {
  /** Read the mounted material registration. */
  getHandle(): MaterialHandle | null;
  /** Re-measure the material during the next composite. */
  refreshLayout(): void;
}

/** Props accepted by the Vue custom-canvas backdrop. */
export interface LgBackdropCanvasProps {
  /** Draw the visible backdrop and the core texture source. */
  draw: CustomDrawCallback;
  /** Explicit order among registered backdrop sources. */
  zIndex?: number;
}

/** Props accepted by the Vue DOM backdrop converter. */
export interface LgBackdropConverterProps
  extends Omit<
    DomBackdropSourceConfig,
    'captureLibrary' | 'element' | 'kind'
  > {
  /** DOM rasterizer used by core; takes precedence over `captureLib`. */
  captureLibrary?: DomCaptureLibrary;
  /** Legacy Vue alias for `captureLibrary`. */
  captureLib?: DomCaptureLibrary;
}

/** Imperative controls exposed by the Vue DOM backdrop converter. */
export interface LgBackdropConverterExposed {
  /** Read the mounted core registration. */
  getHandle(): BackdropSourceHandle<DomBackdropSourceConfig> | null;
  /** Request a fresh DOM rasterization. */
  refresh(): void;
  /** Legacy name for requesting a fresh DOM rasterization. */
  requestBackdropRedraw(): void;
}

/** Controls supplied to the Vue DOM backdrop converter's default slot. */
export interface LgBackdropConverterSlotProps {
  /** Request a fresh DOM rasterization. */
  refresh(): void;
  /** Legacy name for requesting a fresh DOM rasterization. */
  requestBackdropRedraw(): void;
}

/** Reactive context value shared by Vue liquid-glass descendants. */
export interface LiquidGlassInjection {
  /** Core context becomes available after the container mounts. */
  context: ShallowRef<GlassContext | null>;
}
