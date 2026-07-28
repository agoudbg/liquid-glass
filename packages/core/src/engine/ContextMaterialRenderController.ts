import type {
  RendererFrameResult,
  RendererMaterial,
  WebGLRenderer,
} from '../renderer';
import type { RenderMode } from '../types/context';
import { DedicatedMaterialPresentationController } from './DedicatedMaterialPresentationController';
import { resolveEffectiveMaterialRenderMode } from './material-render-mode';
import type { MaterialRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

/** Values required to present one complete material frame. */
export interface ContextMaterialRenderInput {
  /** Effective device scale shared by WebGL and presentation canvases. */
  readonly deviceScale: number;
  /** Whether a valid backdrop texture is available for shader sampling. */
  readonly hasBackdrop: boolean;
  /** Context-level default used by materials without an override. */
  readonly renderMode: RenderMode;
  /** Resolved visible materials in deterministic render order. */
  readonly materials: readonly RendererMaterial[];
  /** Live registrations used to resolve effective presentation modes. */
  readonly registrations: readonly MaterialRegistration[];
  /** Shared WebGL renderer reused across every pass. */
  readonly renderer: WebGLRenderer;
  /** Internal WebGL canvas copied into visible presentation canvases. */
  readonly source: HTMLCanvasElement;
  /** Copy the complete material frame into the shared visible canvas. */
  readonly presentUniform: () => void;
  /** Remove one dedicated material region from the shared visible canvas. */
  readonly excludeDedicated: (
    material: RendererMaterial,
    deviceScale: number,
  ) => void;
  /** Run frame work that must observe the completed WebGL pass. */
  readonly beforePresentUniform?: () => void;
}

interface DedicatedRenderTarget {
  readonly element: HTMLElement;
  readonly material: RendererMaterial;
}

interface MaterialRenderPartition {
  readonly dedicated: DedicatedRenderTarget[];
}

/**
 * Present one shared render through uniform and dedicated canvas surfaces.
 *
 * The complete ordered frame is copied once, then dedicated regions are
 * removed from the shared canvas and extracted into their owning elements.
 * This preserves the reference implementation's mixed-mode compositing.
 */
export class ContextMaterialRenderController {
  private readonly dedicated: DedicatedMaterialPresentationController;

  /** Create a material-pass owner using the context's deterministic runtime. */
  public constructor(runtime: GlassEngineRuntime) {
    this.dedicated = new DedicatedMaterialPresentationController(runtime);
  }

  /** Render once and distribute the complete frame across presentation modes. */
  public render(input: ContextMaterialRenderInput): RendererFrameResult {
    const partition = this.partition(
      input.registrations,
      input.materials,
      input.renderMode,
    );
    const frameResult = input.hasBackdrop
      ? input.renderer.render(input.materials)
      : { drawCalls: 0, glError: 0 };
    if (!input.hasBackdrop) {
      input.renderer.clear();
    }
    input.beforePresentUniform?.();
    input.presentUniform();

    for (const target of partition.dedicated) {
      input.excludeDedicated(target.material, input.deviceScale);
      this.dedicated.present({
        deviceScale: input.deviceScale,
        element: target.element,
        material: target.material,
        source: input.source,
      });
    }

    return frameResult;
  }

  /** Remove stale dedicated canvases without measuring or drawing materials. */
  public syncRegistrations(
    registrations: readonly MaterialRegistration[],
    renderMode: RenderMode,
  ): void {
    const dedicatedIds = new Set<string>();
    for (const registration of registrations) {
      if (
        !registration.destroyed
        && resolveEffectiveMaterialRenderMode(
          registration.config.renderMode,
          renderMode,
        ) === 'dedicated'
      ) {
        dedicatedIds.add(registration.id);
      }
    }
    this.dedicated.retain(dedicatedIds);
  }

  /** Hide or reveal all retained dedicated canvases during fallback changes. */
  public setFallbackMode(enabled: boolean): void {
    this.dedicated.setFallbackMode(enabled);
  }

  /** Return the number of live dedicated presentation canvases. */
  public getOwnedCanvasCount(): number {
    return this.dedicated.getDiagnosticsState().ownedCanvases;
  }

  /** Release every dedicated presentation canvas. */
  public destroy(): void {
    this.dedicated.destroy();
  }

  private partition(
    registrations: readonly MaterialRegistration[],
    materials: readonly RendererMaterial[],
    renderMode: RenderMode,
  ): MaterialRenderPartition {
    this.syncRegistrations(registrations, renderMode);
    const registrationsById = new Map(
      registrations.map((registration) => [registration.id, registration]),
    );
    const dedicated: DedicatedRenderTarget[] = [];

    for (const material of materials) {
      const registration = registrationsById.get(material.id);
      if (!registration || registration.destroyed) continue;
      if (
        resolveEffectiveMaterialRenderMode(
          registration.config.renderMode,
          renderMode,
        ) === 'dedicated'
      ) {
        dedicated.push({
          element: registration.config.element,
          material,
        });
      }
    }
    return { dedicated };
  }
}
