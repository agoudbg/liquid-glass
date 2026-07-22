import { GlassError } from '../errors/GlassError';
import type { GlassContext, GlassContextOptions } from '../types/context';
import { GlassContextImpl } from './GlassContext';
import {
  DEFAULT_GLASS_ENGINE_RUNTIME,
  type GlassEngineRuntime,
} from './runtime';

/** Top-level owner that creates and cascades destruction across glass contexts. */
export class GlassEngine {
  /** Whether this engine has destroyed every context it created. */
  public get destroyed(): boolean {
    return this.isDestroyed;
  }

  private readonly contexts = new Set<GlassContextImpl>();
  private isDestroyed = false;

  /**
   * Create a glass engine with an optional deterministic browser runtime.
   *
   * @param runtime - Lazy DOM and device operations used by created contexts.
   */
  public constructor(
    private readonly runtime: GlassEngineRuntime = DEFAULT_GLASS_ENGINE_RUNTIME,
  ) {}

  /**
   * Create one core-owned uniform rendering context inside a container.
   *
   * @param container - DOM element that owns the presentation canvas.
   * @param options - Rendering and lifecycle configuration.
   * @returns Framework-neutral glass context.
   */
  public createContext(
    container: HTMLElement,
    options: GlassContextOptions = {},
  ): GlassContext {
    if (this.isDestroyed) {
      throw new GlassError(
        'DESTROYED_CONTEXT',
        'The liquid-glass engine has already been destroyed.',
        { phase: 'lifecycle' },
      );
    }
    if (options.renderMode === 'dedicated') {
      throw new GlassError(
        'INVALID_CONFIG',
        'Dedicated per-material canvases are introduced after the P3 uniform slice.',
        { phase: 'configuration', details: { renderMode: options.renderMode } },
      );
    }

    const context = new GlassContextImpl(
      container,
      { ...options, renderMode: 'uniform' },
      this.runtime,
      () => this.contexts.delete(context),
    );
    this.contexts.add(context);
    return context;
  }

  /** Idempotently destroy all contexts and prevent future context creation. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    for (const context of [...this.contexts]) {
      context.destroy();
    }
    this.contexts.clear();
  }
}

/**
 * Create a top-level engine using the default browser runtime or a test seam.
 *
 * @param runtime - Optional lazy browser runtime.
 * @returns New independent engine.
 */
export function createGlassEngine(runtime?: GlassEngineRuntime): GlassEngine {
  return new GlassEngine(runtime);
}
