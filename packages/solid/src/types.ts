import type {
  CustomDrawCallback,
  GlassContext,
  GlassContextOptions,
  GlassEngine,
  MaterialAppearanceOptions,
  MaterialConfig,
  MaterialHandle,
  ProxyTargetInterface,
} from '@agou/liquid-glass-core';
import type { Accessor, JSX } from 'solid-js';

/** Stable context value shared by Solid adapter components. */
export interface LiquidGlassContextValue {
  /** Access the mounted core context. */
  context: Accessor<GlassContext | null>;
}

/** Minimal imperative surface exposed by the Solid container. */
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

/** Props accepted by the Solid liquid-glass context owner. */
export interface LiquidGlassProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'onError' | 'ref' | 'style'> {
  /** Core context configuration. */
  options?: GlassContextOptions;
  /** Optional shared engine captured on mount; otherwise the component owns one. */
  engine?: GlassEngine;
  /** Optional callback receiving the imperative container handle. */
  apiRef?: (handle: LiquidGlassHandle | null) => void;
  /** Called after the core context has mounted. */
  onReady?: (context: GlassContext) => void;
  /** Called when context creation fails. */
  onError?: (error: unknown) => void;
  /** Inline container styles. */
  style?: JSX.CSSProperties;
}

/** Controls supplied to a render-function material child. */
export interface MaterialRenderControls {
  /** Whether the consumer marked an update sequence active. */
  updating: Accessor<boolean>;
  /** Start a consumer-controlled update sequence. */
  startUpdating(): void;
  /** Stop a consumer-controlled update sequence. */
  stopUpdating(): void;
}

/** Solid children accepted by a material. */
export type MaterialChildren = JSX.Element | ((controls: MaterialRenderControls) => JSX.Element);

/** Props accepted by a Solid glass material. */
export interface LiquidGlassMaterialProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'children' | 'ref' | 'style'>,
  Omit<MaterialConfig, 'element'>,
  MaterialAppearanceOptions {
  /** Material content or a render function receiving update controls. */
  children?: MaterialChildren;
  /** Optional callback receiving the imperative material handle. */
  apiRef?: (handle: LiquidGlassMaterialHandle | null) => void;
  /** Inline material styles. */
  style?: JSX.CSSProperties;
}

/** Minimal imperative surface exposed by a Solid material. */
export interface LiquidGlassMaterialHandle {
  /** Read the mounted material registration. */
  getHandle(): MaterialHandle | null;
  /** Re-measure the material during the next composite. */
  refreshLayout(): void;
}

/** Props accepted by the Solid custom-canvas backdrop. */
export interface BackdropCanvasProps
  extends Omit<JSX.CanvasHTMLAttributes<HTMLCanvasElement>, 'children' | 'ref'> {
  /** Draw the visible backdrop and the core texture source. */
  draw: CustomDrawCallback;
  /** Explicit order among registered backdrop sources. */
  zIndex?: number;
}

/** CSS properties including the adapter's custom properties. */
export type GlassStyle = JSX.CSSProperties & Record<`--lg-${string}`, string | number>;
