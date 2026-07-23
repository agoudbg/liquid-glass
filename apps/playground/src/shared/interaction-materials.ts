import type {
  SceneMaterial,
  SceneMaterialOptions,
} from './scene-material-types';

const OPTICAL_OPTIONS = {
  radius: 28,
  thickness: 30,
  refractIndex: 1.1,
  refractIntensity: 0.5,
  dispersion: 0.01,
} satisfies SceneMaterialOptions;

/** Resolve the fixed S004 interaction-preset showcase. */
export function resolveInteractionMaterials(): readonly SceneMaterial[] {
  return [
    {
      id: 's004-button',
      className: 'scene-material interaction-scene-material interaction-button',
      label: 'PRESET 01',
      name: 'Button',
      testId: 'interaction-button',
      options: {
        ...OPTICAL_OPTIONS,
        interactionPreset: 'button',
        renderOrder: 10,
      },
    },
    {
      id: 's004-context',
      className: 'scene-material interaction-scene-material interaction-context',
      label: 'PRESET 02',
      name: 'Context menu',
      options: {
        ...OPTICAL_OPTIONS,
        interactionPreset: 'context-menu',
        renderOrder: 20,
      },
    },
    {
      id: 's004-slider',
      className: 'scene-material interaction-scene-material interaction-slider',
      label: 'PRESET 03',
      name: 'Slider',
      options: {
        ...OPTICAL_OPTIONS,
        backgroundColor: '#ff000033',
        interactionPreset: 'slider',
        renderOrder: 30,
      },
    },
    {
      id: 's004-custom',
      className: 'scene-material interaction-scene-material interaction-custom',
      label: 'OVERRIDE 04',
      name: 'Custom spring',
      options: {
        ...OPTICAL_OPTIONS,
        interactionPreset: 'button',
        interactionConfig: {
          hoverScale: 1.05,
          activeScale: 1.12,
          stretchFactor: 0.002,
          releaseSpring: { stiffness: 250, damping: 8, mass: 1 },
        },
        renderOrder: 40,
      },
    },
  ];
}
