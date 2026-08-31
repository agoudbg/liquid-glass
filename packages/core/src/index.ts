/**
 * @agou/liquid-glass-core
 *
 * Framework-agnostic WebGL2 liquid glass rendering engine.
 *
 * This package provides the core rendering pipeline, interaction physics,
 * and background capture utilities. Framework adapters (Vue, React, Solid)
 * wrap this engine into framework-idiomatic components.
 *
 * @packageDocumentation
 */

import packageJson from '../package.json';

/**
 * Core package version.
 * Matches the package.json version field.
 */
export const CORE_VERSION = packageJson.version;

export * from './appearance/index';
export * from './engine/index';
export * from './errors/index';
export * from './events/index';
export * from './interaction/index';
export * from './renderer/index';
export * from './shaders/index';
export * from './types/index';
export * from './utils/index';
