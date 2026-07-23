import type {
  MaterialAppearanceOptions,
  MaterialConfig,
} from '@agou/liquid-glass-core';

import { isScrollCaptureScene } from './scene-backdrops';
import type { SceneId } from './scene-catalog';
import type { PlaygroundState } from './types';

/** Material options accepted consistently by all three public adapters. */
export interface SceneMaterialOptions
  extends Omit<MaterialConfig, 'element'>,
  MaterialAppearanceOptions {}

/** Framework-neutral material definition rendered by every host. */
export interface SceneMaterial {
  /** Stable reconciliation and diagnostic identifier. */
  id: string;
  /** CSS placement class shared across hosts. */
  className: string;
  /** Compact material label rendered above the optical values. */
  label: string;
  /** Secondary material label. */
  name: string;
  /** Optional compact detail used by the exact legacy oracle. */
  detail?: string;
  /** Optional stable browser-test identifier for a primary interaction target. */
  testId?: string;
  /** Public adapter options for this material. */
  options: SceneMaterialOptions;
}

/** Resolve the canonical material set from the current optical controls. */
export function resolveSceneMaterials(state: PlaygroundState): readonly SceneMaterial[] {
  if (state.oracleMode) return resolveOracleMaterials(state.scene);
  if (state.scene === 'S004') return resolveInteractionMaterials(state);
  const multiple = state.scene === 'S002';

  const primary: SceneMaterial = {
    id: 'primary',
    className: resolvePrimaryMaterialClass(state.scene, multiple),
    label: 'MATERIAL 01',
    name: resolvePrimaryMaterialName(state.scene, multiple),
    options: {
      radius: state.radius,
      radiusTR: Math.max(8, state.radius - 12),
      radiusBL: Math.min(72, state.radius + 12),
      thickness: state.thickness,
      refractIndex: state.refractIndex,
      refractIntensity: state.refractIntensity,
      dispersion: 0.018,
      disableInteractions: isScrollCaptureScene(state.scene),
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
        radius: Math.max(12, state.radius - 10),
        radiusTL: Math.min(72, state.radius + 16),
        thickness: Math.min(80, state.thickness + 12),
        refractIndex: Math.min(1.6, state.refractIndex + 0.07),
        refractIntensity: Math.max(0.12, state.refractIntensity * 0.72),
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
        radius: Math.min(64, state.radius + 8),
        radiusBR: 12,
        thickness: Math.max(8, state.thickness - 10),
        refractIndex: Math.max(1.02, state.refractIndex - 0.05),
        refractIntensity: Math.min(1.4, state.refractIntensity + 0.18),
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

function resolveInteractionMaterials(
  state: PlaygroundState,
): readonly SceneMaterial[] {
  const opticalOptions = {
    radius: state.radius,
    thickness: state.thickness,
    refractIndex: state.refractIndex,
    refractIntensity: state.refractIntensity,
    dispersion: 0.01,
  } satisfies SceneMaterialOptions;

  return [
    {
      id: 's004-button',
      className: 'scene-material interaction-scene-material interaction-button',
      label: 'PRESET 01',
      name: 'Button',
      testId: 'interaction-button',
      options: {
        ...opticalOptions,
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
        ...opticalOptions,
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
        ...opticalOptions,
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
        ...opticalOptions,
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

function resolveOracleMaterials(scene: SceneId): readonly SceneMaterial[] {
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
