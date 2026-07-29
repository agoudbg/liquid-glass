import type { TypedEventEmitter } from '../events/TypedEventEmitter';
import type { AutomaticBackgroundColorMode } from '../types/context';
import type { GlassEventMap } from '../types/events';
import type { ExternalMaterialFeedback } from '../types/external-material';
import type { MaterialPresentationController } from './MaterialPresentationController';

/**
 * Create a lazy theme publisher so render callbacks can be wired before the
 * owning material controller has finished construction.
 */
export function createMaterialThemeFeedbackPublisher(
  getMaterials: () => MaterialPresentationController,
  emitter: TypedEventEmitter<GlassEventMap>,
): (
  materialId: string,
  themeColorMode: AutomaticBackgroundColorMode,
  averageLuminance: number,
) => void {
  return (materialId, themeColorMode, averageLuminance) => {
    const registration = getMaterials().applyThemeSample(
      materialId,
      themeColorMode,
      averageLuminance,
    );
    if (!registration) return;
    emitter.emit('materialFeedback', registration.id, {
      type: 'theme-changed',
      themeColorMode,
      averageLuminance,
    });
  };
}

/** Create the event adapter used when a target context samples a source material. */
export function createDelegatedMaterialFeedbackPublisher(
  emitter: TypedEventEmitter<GlassEventMap>,
): (materialId: string, feedback: ExternalMaterialFeedback) => void {
  return (materialId, feedback) => {
    emitter.emit('materialFeedback', materialId, {
      type: 'theme-changed',
      ...feedback,
    });
  };
}
