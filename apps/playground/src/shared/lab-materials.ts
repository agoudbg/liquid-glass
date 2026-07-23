import type { SceneMaterial } from './scene-material-types';
import type { LabState } from './types';

/** Resolve the focused S001 material exclusively from editable Lab state. */
export function resolveLabMaterials(lab: Readonly<LabState>): readonly SceneMaterial[] {
  const appearance = lab.appearance.useCustomColor
    ? {
        backgroundColor: lab.appearance.backgroundColor,
        useCustomColor: true,
      }
    : {};
  const interactionConfig = Object.keys(lab.interaction.config).length > 0
    ? lab.interaction.config
    : undefined;

  return [{
    id: 'primary',
    className: 'scene-material material-single',
    label: 'MATERIAL 01',
    name: 'Optical surface',
    options: {
      ...appearance,
      radius: lab.shape.radius,
      radiusTL: lab.shape.radiusTL,
      radiusTR: lab.shape.radiusTR,
      radiusBR: lab.shape.radiusBR,
      radiusBL: lab.shape.radiusBL,
      thickness: lab.optics.thickness,
      refractIndex: lab.optics.refractIndex,
      refractIntensity: lab.optics.refractIntensity,
      blur: lab.optics.blur,
      dispersion: lab.optics.dispersion,
      disableInteractions: lab.interaction.disableInteractions,
      onlyClickInteractions: lab.interaction.onlyClickInteractions,
      isMoveable: lab.interaction.isMoveable,
      interactionPreset: lab.interaction.preset,
      interactionConfig,
      renderOrder: lab.render.order,
      illuminationAngle: lab.appearance.illuminationAngle,
      illuminationIntensity: lab.appearance.illuminationIntensity,
    },
  }];
}
