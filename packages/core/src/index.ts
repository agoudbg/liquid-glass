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

/**
 * Core package version.
 * Matches the package.json version field.
 */
export const CORE_VERSION = '0.1.0';

export * from './errors/index';
export * from './events/index';
export * from './interaction/index';
export * from './shaders/index';
export * from './types/index';
export * from './utils/index';
