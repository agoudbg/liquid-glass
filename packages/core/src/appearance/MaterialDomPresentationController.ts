import type {
  MaterialAppearanceOptions,
  MaterialAppearanceTokens,
} from '../types/appearance';
import type {
  MaterialHandle,
  MaterialPresentationState,
} from '../types/context';
import { resolveMaterialAppearance } from './resolveMaterialAppearance';

/** Static appearance values owned by a mounted framework material. */
export interface MaterialDomAppearance extends MaterialAppearanceOptions {
  /** Optical thickness used to resolve the inset shadow size. */
  thickness?: number;
}

function highlightVisible(presentation: MaterialPresentationState): boolean {
  return presentation.interactionConfig.showHighlight
    && presentation.interactionOutput.highlightVisible
    && !presentation.fallbackMode;
}

/** Applies core presentation snapshots directly to one framework-owned DOM node. */
export class MaterialDomPresentationController {
  private appearance: MaterialDomAppearance;
  private presentation: MaterialPresentationState | null = null;
  private unsubscribe: () => void = () => undefined;
  private previousFallback: boolean | null = null;
  private previousTint: string | null = null;
  private tintTransitionStage = 0;
  private destroyed = false;

  /** Subscribe one material element to its core presentation stream. */
  public constructor(
    private readonly element: HTMLElement,
    private readonly highlight: HTMLElement,
    handle: MaterialHandle,
    appearance: MaterialDomAppearance = {},
  ) {
    this.appearance = { ...appearance };
    this.unsubscribe = handle.onPresentation((presentation) => {
      this.presentation = presentation;
      this.applyPresentation();
    });
  }

  /** Re-resolve static props against the latest interaction presentation. */
  public updateAppearance(appearance: MaterialDomAppearance): void {
    if (this.destroyed) return;
    const previous = this.appearance;
    this.appearance = { ...appearance };
    try {
      this.applyPresentation();
    } catch (error) {
      this.appearance = previous;
      throw error;
    }
  }

  /** Stop DOM updates and remove transient state markers. */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.highlight.classList.remove('visible');
    this.element.removeAttribute('allowing-color-transition');
    this.element.removeAttribute('is-blurred');
    this.element.removeAttribute('data-edge-style');
  }

  private applyPresentation(): void {
    const presentation = this.presentation;
    if (!presentation) return;
    const tokens = resolveMaterialAppearance({
      ...this.appearance,
      fallbackMode: presentation.fallbackMode,
      interactionConfig: presentation.interactionConfig,
      interactionOutput: presentation.interactionOutput,
      themeColorMode: presentation.themeColorMode,
    });
    this.updateColorTransition(tokens, presentation.fallbackMode);
    for (const [property, value] of Object.entries(tokens)) {
      this.element.style.setProperty(property, value);
    }
    this.element.setAttribute('data-edge-style', this.appearance.edgeStyle ?? 'illuminated');
    this.element.setAttribute('is-blurred', String(presentation.blurred));
    this.highlight.classList.toggle('visible', highlightVisible(presentation));
  }

  private updateColorTransition(
    tokens: MaterialAppearanceTokens,
    fallbackMode: boolean,
  ): void {
    if (
      this.previousFallback !== null
      && this.previousFallback !== fallbackMode
    ) {
      this.tintTransitionStage = 0;
      this.element.removeAttribute('allowing-color-transition');
    }
    const tint = tokens['--lg-background-tint'];
    if (this.previousTint !== null && this.previousTint !== tint) {
      this.tintTransitionStage = Math.min(2, this.tintTransitionStage + 1);
      this.element.setAttribute(
        'allowing-color-transition',
        String(this.tintTransitionStage >= 2),
      );
    }
    this.previousFallback = fallbackMode;
    this.previousTint = tint;
  }
}
