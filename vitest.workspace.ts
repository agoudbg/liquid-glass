import { defineWorkspace } from 'vitest/config'

/**
 * Vitest workspace configuration.
 *
 * Discovers and runs tests across all packages.
 * Each package can define its own vitest.config.ts for package-specific settings.
 */
export default defineWorkspace(['packages/*', 'apps/*'])
