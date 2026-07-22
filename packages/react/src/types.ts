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
} from '@agou/liquid-glass-core';
import type {
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from 'react';

/** Minimal imperative surface exposed by the React container. */
export interface LiquidGlassHandle {
  /** Read the mounted core context. */
  getContext(): GlassContext | null;
  /** Request a new composite. */
  refresh(): void;
  /** Re-evaluate visibility during the next composite. */
  refreshVisibility(): void;
  /** Create the stable proxy target for nested/delegated materials. */
  getProxyTarget(): ProxyTargetInterface | null;
}

/** Props accepted by the React liquid-glass context owner. */
export interface LiquidGlassProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onError' | 'style'> {
  /** Core context configuration. */
  options?: GlassContextOptions;
  /** Optional shared engine captured on mount; otherwise the component owns one. */
  engine?: GlassEngine;
  /** Called after the core context has mounted. */
  onReady?: (context: GlassContext) => void;
  /** Called when context creation fails. */
  onError?: (error: unknown) => void;
  /** Inline styles including public liquid-glass CSS custom properties. */
  style?: GlassStyle;
}

/** Controls supplied to a render-function material child. */
export interface MaterialRenderControls {
  /** Whether the consumer marked an update sequence active. */
  updating: boolean;
  /** Start a consumer-controlled update sequence. */
  startUpdating(): void;
  /** Stop a consumer-controlled update sequence. */
  stopUpdating(): void;
}

/** React children accepted by a material. */
export type MaterialChildren = ReactNode | ((controls: MaterialRenderControls) => ReactNode);

/** Props accepted by a React glass material. */
export interface LiquidGlassMaterialProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'style'>,
  Omit<MaterialConfig, 'element'>,
  MaterialAppearanceOptions {
  /** Material content or a render function receiving update controls. */
  children?: MaterialChildren;
  /** Inline styles including public liquid-glass CSS custom properties. */
  style?: GlassStyle;
}

/** Minimal imperative surface exposed by a React material. */
export interface LiquidGlassMaterialHandle {
  /** Read the mounted material registration. */
  getHandle(): MaterialHandle | null;
  /** Re-measure the material during the next composite. */
  refreshLayout(): void;
}

/** Props accepted by the React custom-canvas backdrop. */
export interface BackdropCanvasProps extends Omit<HTMLAttributes<HTMLCanvasElement>, 'children'> {
  /** Draw the visible backdrop and the core texture source. */
  draw: CustomDrawCallback;
  /** Explicit order among registered backdrop sources. */
  zIndex?: number;
}

/** Props accepted by the React DOM backdrop converter. */
export interface BackdropConverterProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** DOM content captured as a backdrop texture. */
  children?: ReactNode;
  /** DOM rasterizer used by core. */
  captureLibrary?: DomCaptureLibrary;
  /** Explicit order among registered backdrop sources. */
  zIndex?: number;
  /** Capture scale override. */
  scale?: number;
  /** Fill painted behind captured content. */
  backgroundColor?: string;
  /** Whether source size changes request a capture. */
  watchResize?: boolean;
  /** Whether descendant mutations request a capture. */
  watchNodeChanges?: boolean;
  /** Whether movement without resizing requests remeasurement. */
  watchPositionChanges?: boolean;
  /** Optional bounded capture policy for scrolling content. */
  viewportCapture?: DomBackdropSourceConfig['viewportCapture'];
}

/** Imperative controls exposed by the React DOM backdrop converter. */
export interface BackdropConverterHandle {
  /** Read the mounted core registration. */
  getHandle(): BackdropSourceHandle<DomBackdropSourceConfig> | null;
  /** Request a fresh DOM rasterization. */
  refresh(): void;
}

/** CSS properties including the adapter's custom properties. */
export type GlassStyle = CSSProperties & Record<`--lg-${string}`, string | number>;
