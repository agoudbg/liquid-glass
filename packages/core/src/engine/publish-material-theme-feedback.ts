import type { TypedEventEmitter } from '../events/TypedEventEmitter';
import type { AutomaticBackgroundColorMode } from '../types/context';
import type { GlassEventMap } from '../types/events';
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
