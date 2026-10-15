import { GlassError } from '../errors/GlassError';
import { calculateMaterialScissor } from '../renderer/scissor';
import type { RendererMaterial } from '../renderer/types';
import { rethrowAfterRunningTasks } from '../utils/run-tasks';
import type { GlassEngineRuntime } from './runtime';

interface DedicatedCanvasEntry {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly element: HTMLElement;
}

interface ClippedSourceRect {
  readonly destinationHeight: number;
  readonly destinationWidth: number;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  readonly sourceX: number;
  readonly sourceY: number;
}

/** Input required to copy one material region into its visible canvas. */
export interface DedicatedMaterialPresentationInput {
  /** Device pixel ratio multiplied by the normalized render precision. */
  readonly deviceScale: number;
  /** DOM element that owns the dedicated presentation canvas. */
  readonly element: HTMLElement;
  /** Fully resolved material used to calculate the extraction region. */
  readonly material: RendererMaterial;
  /** WebGL canvas containing the complete ordered material frame. */
  readonly source: HTMLCanvasElement;
}

/** Detached resource state exposed to the owning context diagnostics. */
export interface DedicatedMaterialPresentationDiagnosticsState {
  /** Whether this controller has released all owned resources. */
  readonly destroyed: boolean;
  /** Whether dedicated canvases are currently hidden behind CSS fallback. */
  readonly fallbackMode: boolean;
  /** Number of live core-owned dedicated canvases. */
  readonly ownedCanvases: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function requirePresentationDimension(
  value: number,
  field: string,
  materialId: string,
): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new GlassError(
      'RENDER_FAILED',
      `Dedicated material presentation requires a finite ${field}.`,
      {
        phase: 'render',
        materialId,
        details: { field, value },
      },
    );
  }
  return Math.round(value);
}

function resolveClippedSourceRect(
  material: RendererMaterial,
  source: HTMLCanvasElement,
  destination: HTMLCanvasElement,
  deviceScale: number,
): ClippedSourceRect | null {
  const scissor = calculateMaterialScissor(
    material,
    deviceScale,
    source.height,
    0,
  );
  if (scissor.width <= 0 || scissor.height <= 0) {
    return null;
  }

  const sourceTop = source.height - scissor.y - scissor.height;
  const clippedLeft = clamp(scissor.x, 0, source.width);
  const clippedTop = clamp(sourceTop, 0, source.height);
  const clippedRight = clamp(scissor.x + scissor.width, 0, source.width);
  const clippedBottom = clamp(sourceTop + scissor.height, 0, source.height);
  const sourceWidth = clippedRight - clippedLeft;
  const sourceHeight = clippedBottom - clippedTop;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const horizontalScale = destination.width / scissor.width;
  const verticalScale = destination.height / scissor.height;
  return {
    destinationHeight: sourceHeight * verticalScale,
    destinationWidth: sourceWidth * horizontalScale,
    destinationX: (clippedLeft - scissor.x) * horizontalScale,
    destinationY: (clippedTop - sourceTop) * verticalScale,
    sourceHeight,
    sourceWidth,
    sourceX: clippedLeft,
    sourceY: clippedTop,
  };
}

/**
 * Own per-material 2D presentation canvases while reusing one shared WebGL renderer.
 *
 * The renderer provides one complete ordered frame so extraction matches the
 * reference implementation's shared material buffer.
 */
export class DedicatedMaterialPresentationController {
  private readonly entries = new Map<string, DedicatedCanvasEntry>();
  private destroyed = false;
  private fallbackMode = false;

  /** Create a dedicated-canvas owner around the injected browser runtime. */
  public constructor(private readonly runtime: GlassEngineRuntime) {}

  /** Copy one material region into its core-owned visible canvas. */
  public present(input: DedicatedMaterialPresentationInput): void {
    this.assertUsable(input.material.id);
    const { deviceScale, element, material, source } = input;
    if (!Number.isFinite(deviceScale) || deviceScale <= 0) {
      throw new GlassError(
        'RENDER_FAILED',
        'Dedicated material presentation requires a positive device scale.',
        {
          phase: 'render',
          materialId: material.id,
          details: { deviceScale },
        },
      );
    }

    const entryExisted = this.entries.has(material.id);
    const entry = this.getOrCreateEntry(material.id, element);
    try {
      const width = requirePresentationDimension(
        material.rect.width * deviceScale,
        'backing width',
        material.id,
      );
      const height = requirePresentationDimension(
        material.rect.height * deviceScale,
        'backing height',
        material.id,
      );
      if (entry.canvas.width !== width) entry.canvas.width = width;
      if (entry.canvas.height !== height) entry.canvas.height = height;
      entry.context.clearRect(0, 0, width, height);
      if (width === 0 || height === 0) return;

      const clipped = resolveClippedSourceRect(
        material,
        source,
        entry.canvas,
        deviceScale,
      );
      if (!clipped) return;
      entry.context.drawImage(
        source,
        clipped.sourceX,
        clipped.sourceY,
        clipped.sourceWidth,
        clipped.sourceHeight,
        clipped.destinationX,
        clipped.destinationY,
        clipped.destinationWidth,
        clipped.destinationHeight,
      );
    } catch (error) {
      const contextual = GlassError.fromUnknown(
        error,
        'RENDER_FAILED',
        'Failed to present a dedicated liquid-glass material.',
        { phase: 'render', materialId: material.id },
      );
      if (!entryExisted) {
        rethrowAfterRunningTasks(contextual, [
          () => this.remove(material.id),
        ]);
      }
      throw contextual;
    }
  }

  /** Hide or reveal every dedicated canvas without discarding retained pixels. */
  public setFallbackMode(enabled: boolean): void {
    if (this.destroyed || this.fallbackMode === enabled) return;
    this.fallbackMode = enabled;
    let firstFailure: GlassError | null = null;
    for (const [materialId, entry] of this.entries) {
      try {
        this.syncVisibility(entry.canvas);
      } catch (error) {
        firstFailure ??= GlassError.fromUnknown(
          error,
          'RENDER_FAILED',
          'Failed to update dedicated material visibility.',
          { phase: 'render', materialId },
        );
      }
    }
    if (firstFailure) throw firstFailure;
  }

  /** Release one material's canvas bitmap and remove it from the material DOM. */
  public remove(materialId: string): void {
    const entry = this.entries.get(materialId);
    if (!entry) return;
    this.entries.delete(materialId);
    try {
      this.releaseEntry(entry);
    } catch (error) {
      throw GlassError.fromUnknown(
        error,
        'RENDER_FAILED',
        'Failed to release a dedicated material canvas.',
        { phase: 'render', materialId },
      );
    }
  }

  /** Release canvases that no longer belong to an effective dedicated material. */
  public retain(materialIds: ReadonlySet<string>): void {
    if (this.destroyed) return;
    let firstFailure: unknown;
    let failed = false;
    for (const materialId of [...this.entries.keys()]) {
      if (materialIds.has(materialId)) continue;
      try {
        this.remove(materialId);
      } catch (error) {
        if (!failed) firstFailure = error;
        failed = true;
      }
    }
    if (failed) throw firstFailure;
  }

  /** Return a detached resource snapshot for context-level diagnostics. */
  public getDiagnosticsState(): DedicatedMaterialPresentationDiagnosticsState {
    return {
      destroyed: this.destroyed,
      fallbackMode: this.fallbackMode,
      ownedCanvases: this.entries.size,
    };
  }

  /** Idempotently release every dedicated canvas and retained 2D context. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const entries = [...this.entries];
    this.entries.clear();
    let firstFailure: GlassError | null = null;
    for (const [materialId, entry] of entries) {
      try {
        this.releaseEntry(entry);
      } catch (error) {
        firstFailure ??= GlassError.fromUnknown(
          error,
          'RENDER_FAILED',
          'Failed to release a dedicated material canvas.',
          { phase: 'render', materialId },
        );
      }
    }
    if (firstFailure) throw firstFailure;
  }

  private getOrCreateEntry(
    materialId: string,
    element: HTMLElement,
  ): DedicatedCanvasEntry {
    const current = this.entries.get(materialId);
    if (current) {
      if (current.element !== element) {
        throw new GlassError(
          'RENDER_FAILED',
          'A dedicated material cannot change its owning element.',
          { phase: 'render', materialId },
        );
      }
      return current;
    }

    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = this.runtime.createCanvas();
      canvas.className = 'liquid-glass-dedicated-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('data-liquid-glass-canvas', 'dedicated');
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.zIndex = '-1';
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.borderRadius = 'inherit';
      canvas.style.pointerEvents = 'none';
      // Visibility must follow the owner immediately, including before the next RAF.
      canvas.style.transition = 'opacity 0.2s ease';
      this.syncVisibility(canvas);
      element.insertBefore(canvas, element.firstChild);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new GlassError(
          'RENDER_FAILED',
          'Failed to acquire a dedicated material 2D context.',
          { phase: 'render', materialId },
        );
      }
      const entry = { canvas, context, element };
      this.entries.set(materialId, entry);
      return entry;
    } catch (error) {
      let cleanupError: unknown;
      if (canvas) {
        try {
          this.releaseCanvas(canvas);
        } catch (caughtError) {
          cleanupError = caughtError;
        }
      }
      if (cleanupError === undefined) {
        throw GlassError.fromUnknown(
          error,
          'RENDER_FAILED',
          'Failed to create a dedicated material canvas.',
          { phase: 'render', materialId },
        );
      }
      throw new GlassError(
        'RENDER_FAILED',
        'Failed to create and clean up a dedicated material canvas.',
        {
          phase: 'render',
          cause: error,
          materialId,
          details: { cleanupError },
        },
      );
    }
  }

  private syncVisibility(canvas: HTMLCanvasElement): void {
    // A visible child must not override a consumer-hidden material owner.
    canvas.style.visibility = this.fallbackMode ? 'hidden' : 'inherit';
    canvas.style.opacity = this.fallbackMode ? '0' : '1';
  }

  private releaseEntry(entry: DedicatedCanvasEntry): void {
    this.releaseCanvas(entry.canvas);
  }

  private releaseCanvas(canvas: HTMLCanvasElement): void {
    try {
      canvas.parentNode?.removeChild(canvas);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  private assertUsable(materialId: string): void {
    if (!this.destroyed) return;
    throw new GlassError(
      'RENDER_FAILED',
      'The dedicated material presentation controller has been destroyed.',
      { phase: 'render', materialId },
    );
  }
}
