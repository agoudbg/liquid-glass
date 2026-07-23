import type { PartialInteractionConfig } from '@agou/liquid-glass-core';

import type {
  LabShapeState,
  LabState,
} from './types';

/** URL-backed values currently exposed by the compact Lab inspector. */
export interface LabUrlValues {
  /** Material thickness in CSS pixels. */
  thickness: number;
  /** Material index of refraction. */
  refractIndex: number;
  /** Material refraction displacement multiplier. */
  refractIntensity: number;
  /** Shared corner radius in CSS pixels. */
  radius: number;
  /** Backing-canvas render scale. */
  renderPrecision: number;
}

/** Numeric controls currently rendered by the compact inspector. */
export type LabNumericControl = keyof LabUrlValues;

/** Defaults that preserve the current S001 playground presentation. */
export const DEFAULT_LAB_URL_VALUES: Readonly<LabUrlValues> = {
  thickness: 36,
  refractIndex: 1.21,
  refractIntensity: 0.72,
  radius: 34,
  renderPrecision: 1,
};

/** Create independent corner values that preserve the existing asymmetric lens. */
export function createLabShapeState(radius: number): LabShapeState {
  return {
    radius,
    radiusTL: radius,
    radiusTR: Math.max(8, radius - 12),
    radiusBR: radius,
    radiusBL: Math.min(72, radius + 12),
  };
}

/** Create a fresh complete Lab state without sharing nested mutable objects. */
export function createDefaultLabState(
  values: Readonly<LabUrlValues> = DEFAULT_LAB_URL_VALUES,
): LabState {
  return {
    optics: {
      thickness: values.thickness,
      refractIndex: values.refractIndex,
      refractIntensity: values.refractIntensity,
      blur: 0,
      dispersion: 0.018,
    },
    shape: createLabShapeState(values.radius),
    appearance: {
      useCustomColor: false,
      backgroundColor: 'rgba(229, 244, 239, 0.16)',
      illuminationAngle: 34,
      illuminationIntensity: 0.62,
    },
    interaction: {
      disableInteractions: false,
      onlyClickInteractions: false,
      isMoveable: false,
      preset: 'button',
      config: {},
    },
    render: {
      precision: values.renderPrecision,
      order: 10,
    },
    source: {
      kind: 'canvas',
      backgroundColor: '#dce4df',
    },
  };
}

/** Clone a Lab state deeply enough for every currently modeled nested option. */
export function cloneLabState(state: Readonly<LabState>): LabState {
  return {
    optics: { ...state.optics },
    shape: { ...state.shape },
    appearance: { ...state.appearance },
    interaction: {
      ...state.interaction,
      config: cloneInteractionConfig(state.interaction.config),
    },
    render: { ...state.render },
    source: { ...state.source },
  };
}

/** Apply one compact-inspector numeric value without mutating prior Lab state. */
export function updateLabNumericControl(
  state: Readonly<LabState>,
  control: LabNumericControl,
  value: number,
): LabState {
  if (control === 'thickness') {
    return {
      ...state,
      optics: { ...state.optics, thickness: value },
    };
  }
  if (control === 'refractIndex') {
    return {
      ...state,
      optics: { ...state.optics, refractIndex: value },
    };
  }
  if (control === 'refractIntensity') {
    return {
      ...state,
      optics: { ...state.optics, refractIntensity: value },
    };
  }
  if (control === 'radius') {
    return {
      ...state,
      shape: createLabShapeState(value),
    };
  }
  return {
    ...state,
    render: { ...state.render, precision: value },
  };
}

/** Narrow a data-control value to a currently supported Lab numeric control. */
export function isLabNumericControl(value: string): value is LabNumericControl {
  return value === 'thickness'
    || value === 'refractIndex'
    || value === 'refractIntensity'
    || value === 'radius'
    || value === 'renderPrecision';
}

function cloneInteractionConfig(
  config: Readonly<PartialInteractionConfig>,
): PartialInteractionConfig {
  return {
    ...config,
    ...(config.hoverSpring ? { hoverSpring: { ...config.hoverSpring } } : {}),
    ...(config.activeSpring ? { activeSpring: { ...config.activeSpring } } : {}),
    ...(config.releaseSpring ? { releaseSpring: { ...config.releaseSpring } } : {}),
  };
}
