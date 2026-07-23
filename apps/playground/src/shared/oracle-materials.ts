import type { SceneId } from './scene-catalog';
import type { SceneMaterial } from './scene-material-types';

/** Resolve fixed materials that reproduce exact legacy oracle geometry. */
export function resolveOracleMaterials(scene: SceneId): readonly SceneMaterial[] {
  if (scene === 'S004') return resolveOracleInteractionMaterials();
  if (scene !== 'S002') {
    return [{
      id: 's001-main',
      className: 'scene-material oracle-material oracle-s001',
      label: '',
      name: 'Static glass',
      detail: 'Custom canvas backdrop',
      options: {
        radius: 52,
        thickness: 18,
        refractIndex: 1.18,
        refractIntensity: 0.72,
        blur: 0.018,
        dispersion: 0.018,
        disableInteractions: true,
      },
    }];
  }

  return [
    {
      id: 's002-a',
      className: 'scene-material oracle-material oracle-multi oracle-multi-a',
      label: '',
      name: 'Alpha',
      options: {
        radius: 44,
        thickness: 16,
        refractIndex: 1.12,
        refractIntensity: 0.64,
        dispersion: 0.012,
        renderOrder: 1,
        disableInteractions: true,
      },
    },
    {
      id: 's002-b',
      className: 'scene-material oracle-material oracle-multi oracle-multi-b',
      label: '',
      name: 'Beta',
      options: {
        radius: 28,
        radiusTR: 64,
        radiusBL: 64,
        thickness: 24,
        refractIndex: 1.24,
        refractIntensity: 0.82,
        blur: 0.025,
        dispersion: 0.024,
        renderOrder: 3,
        disableInteractions: true,
      },
    },
    {
      id: 's002-c',
      className: 'scene-material oracle-material oracle-multi oracle-multi-c',
      label: '',
      name: 'Gamma',
      options: {
        radius: 80,
        thickness: 12,
        refractIndex: 1.08,
        refractIntensity: 0.52,
        renderOrder: 2,
        disableInteractions: true,
      },
    },
  ];
}

function resolveOracleInteractionMaterials(): readonly SceneMaterial[] {
  return [
    {
      id: 's004-button',
      className: 'scene-material oracle-material oracle-s004 oracle-s004-button',
      label: '',
      name: 'Button',
      testId: 'interaction-button',
      options: {
        radius: 40,
        interactionPreset: 'button',
      },
    },
    {
      id: 's004-context',
      className: 'scene-material oracle-material oracle-s004 oracle-s004-context',
      label: '',
      name: 'Context',
      options: {
        radius: 40,
        interactionPreset: 'context-menu',
      },
    },
    {
      id: 's004-slider',
      className: 'scene-material oracle-material oracle-s004 oracle-s004-slider',
      label: '',
      name: 'Slider',
      options: {
        radius: 40,
        interactionPreset: 'slider',
      },
    },
  ];
}
