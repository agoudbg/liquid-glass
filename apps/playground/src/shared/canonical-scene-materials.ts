import { isScrollCaptureScene } from './scene-backdrops';
import type { SceneId } from './scene-catalog';
import type { SceneMaterial } from './scene-material-types';

const CANONICAL_RADIUS = 34;
const CANONICAL_THICKNESS = 36;
const CANONICAL_REFRACT_INDEX = 1.21;
const CANONICAL_REFRACT_INTENSITY = 0.72;

/** Resolve fixed materials for canonical scenes outside S001 and S004. */
export function resolveCanonicalSceneMaterials(
  scene: SceneId,
): readonly SceneMaterial[] {
  const multiple = scene === 'S002';
  const primary: SceneMaterial = {
    id: 'primary',
    className: resolvePrimaryMaterialClass(scene, multiple),
    label: 'MATERIAL 01',
    name: resolvePrimaryMaterialName(scene, multiple),
    options: {
      radius: CANONICAL_RADIUS,
      radiusTR: 22,
      radiusBL: 46,
      thickness: CANONICAL_THICKNESS,
      refractIndex: CANONICAL_REFRACT_INDEX,
      refractIntensity: CANONICAL_REFRACT_INTENSITY,
      dispersion: 0.018,
      disableInteractions: isScrollCaptureScene(scene),
      renderOrder: 10,
      illuminationAngle: 34,
      illuminationIntensity: 0.62,
    },
  };

  if (!multiple) return [primary];

  return [
    primary,
    {
      id: 'secondary',
      className: 'scene-material material-secondary',
      label: 'MATERIAL 02',
      name: 'Offset lens',
      options: {
        radius: 24,
        radiusTL: 50,
        thickness: 48,
        refractIndex: 1.28,
        refractIntensity: 0.5184,
        dispersion: 0.032,
        renderOrder: 20,
        useCustomColor: true,
        backgroundColor: 'rgba(206, 238, 229, 0.14)',
        illuminationAngle: 122,
        illuminationIntensity: 0.54,
      },
    },
    {
      id: 'tertiary',
      className: 'scene-material material-tertiary',
      label: 'MATERIAL 03',
      name: 'Compact lens',
      options: {
        radius: 42,
        radiusBR: 12,
        thickness: 26,
        refractIndex: 1.16,
        refractIntensity: 0.9,
        dispersion: 0.009,
        renderOrder: 30,
        useCustomColor: true,
        backgroundColor: 'rgba(255, 232, 213, 0.12)',
        illuminationAngle: 236,
        illuminationIntensity: 0.68,
      },
    },
  ];
}

function resolvePrimaryMaterialClass(scene: SceneId, multiple: boolean): string {
  if (scene === 'S003') return 'scene-material material-dom';
  if (scene === 'S005') return 'scene-material material-body-scroll';
  if (scene === 'S006') return 'scene-material material-internal-scroll';
  return multiple
    ? 'scene-material material-primary'
    : 'scene-material material-single';
}

function resolvePrimaryMaterialName(scene: SceneId, multiple: boolean): string {
  if (scene === 'S003') return 'Captured detail';
  if (scene === 'S005') return 'Body scroll';
  if (scene === 'S006') return 'Internal scroll';
  if (scene === 'S007') return 'Fallback surface';
  return multiple ? 'Primary lens' : 'Optical surface';
}
