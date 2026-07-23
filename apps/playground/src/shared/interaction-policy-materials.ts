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

/** Build the isolated S004 material set used by pointer-policy browser tests. */
export function resolveInteractionPolicyMaterials(): readonly SceneMaterial[] {
  return [
    {
      id: 'disabled-button',
      className: 'scene-material interaction-scene-material interaction-button',
      label: 'DISABLED 01',
      name: 'Button policy',
      control: {
        kind: 'button',
        label: 'Run disabled action',
        testId: 'disabled-button-control',
      },
      options: {
        ...OPTICAL_OPTIONS,
        disableInteractions: true,
        interactionPreset: 'button',
        renderOrder: 10,
      },
    },
    {
      id: 'disabled-range',
      className: 'scene-material interaction-scene-material interaction-context',
      label: 'DISABLED 02',
      name: 'Range policy',
      control: {
        kind: 'range',
        initialValue: 32,
        label: 'Disabled policy value',
        testId: 'disabled-range-control',
      },
      options: {
        ...OPTICAL_OPTIONS,
        disableInteractions: true,
        interactionPreset: 'slider',
        renderOrder: 20,
      },
    },
    {
      id: 'click-only-button',
      className: 'scene-material interaction-scene-material interaction-slider',
      label: 'CLICK ONLY 03',
      name: 'Button policy',
      control: {
        kind: 'button',
        label: 'Run click-only action',
        testId: 'click-only-button-control',
      },
      options: {
        ...OPTICAL_OPTIONS,
        interactionPreset: 'button',
        onlyClickInteractions: true,
        renderOrder: 30,
      },
    },
    {
      id: 'click-only-range',
      className: 'scene-material interaction-scene-material interaction-custom',
      label: 'CLICK ONLY 04',
      name: 'Range policy',
      control: {
        kind: 'range',
        initialValue: 68,
        label: 'Click-only policy value',
        testId: 'click-only-range-control',
      },
      options: {
        ...OPTICAL_OPTIONS,
        interactionPreset: 'slider',
        onlyClickInteractions: true,
        renderOrder: 40,
      },
    },
  ];
}
