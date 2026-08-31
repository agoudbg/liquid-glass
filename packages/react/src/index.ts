/**
 * @agou/liquid-glass-react
 *
 * React 19 adapter for @agou/liquid-glass-core.
 *
 * Provides React-idiomatic functional components and hooks that wrap the
 * core engine's imperative API. Uses React Context for dependency injection.
 *
 * @packageDocumentation
 */

import './styles/glass.css';

import packageJson from '../package.json';

export { BackdropCanvas } from './BackdropCanvas';
export { BackdropConverter } from './BackdropConverter';
export { LiquidGlass } from './LiquidGlass';
export type { LiquidGlassContextValue } from './LiquidGlassContext';
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
  LiquidGlassHandle,
  LiquidGlassMaterialHandle,
  LiquidGlassMaterialProps,
  LiquidGlassProps,
  MaterialChildren,
  MaterialRenderControls,
} from './types';
export { CORE_VERSION } from '@agou/liquid-glass-core';

/**
 * React adapter package version.
 */
export const REACT_ADAPTER_VERSION = packageJson.version;
