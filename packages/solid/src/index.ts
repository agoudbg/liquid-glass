/**
 * @agou/liquid-glass-solid
 *
 * Solid adapter for @agou/liquid-glass-core.
 *
 * Provides Solid-idiomatic components and primitives that wrap the core
 * engine's imperative API.
 *
 * @packageDocumentation
 */

import './styles/glass.css';

export { BackdropCanvas } from './BackdropCanvas';
export { BackdropConverter } from './BackdropConverter';
export { LiquidGlass } from './LiquidGlass';
export {
  LiquidGlassContext,
  useLiquidGlassContext,
} from './LiquidGlassContext';
export { LiquidGlassMaterial } from './LiquidGlassMaterial';
export type {
  BackdropCanvasProps,
  BackdropConverterHandle,
  BackdropConverterProps,
  GlassStyle,
  LiquidGlassContextValue,
  LiquidGlassHandle,
  LiquidGlassMaterialHandle,
  LiquidGlassMaterialProps,
  LiquidGlassProps,
  MaterialChildren,
  MaterialRenderControls,
} from './types';
export { CORE_VERSION } from '@agou/liquid-glass-core';

/**
 * Solid adapter package version.
 */
export const SOLID_ADAPTER_VERSION = '0.1.0';
