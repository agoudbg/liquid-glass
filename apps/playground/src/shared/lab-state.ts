import type {
  InteractionPreset,
  PartialInteractionConfig,
} from '@agou/liquid-glass-core';

import type {
  LabShapeState,
  LabState,
} from './types';

const RGB_HEX_PATTERN = /^#[0-9a-f]{6}$/iu;
const RGBA_HEX_PATTERN = /^#[0-9a-f]{8}$/iu;
const DEFAULT_TINT_ALPHA = '29';

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
export type LabNumericControl =
  | keyof LabUrlValues
  | 'blur'
  | 'dispersion'
  | 'radiusTL'
  | 'radiusTR'
  | 'radiusBR'
  | 'radiusBL'
  | 'renderOrder'
  | 'illuminationAngle'
  | 'illuminationIntensity'
  | 'activeScale'
  | 'translateFactor'
  | 'stretchFactor'
  | 'highlightOpacity';

/** Binary controls rendered by the Lab inspector. */
export type LabBooleanControl =
  | 'useCustomColor'
  | 'disableInteractions'
  | 'onlyClickInteractions'
  | 'isMoveable';

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
      backgroundColor: '#d9f2ea29',
      illuminationAngle: 34,
      illuminationIntensity: 0.62,
    },
    interaction: {
      disableInteractions: false,
      onlyClickInteractions: false,
      isMoveable: false,
      preset: 'button',
      config: {
        activeScale: 1.08,
        translateFactor: 0.2,
        stretchFactor: 0.0015,
        highlightOpacity: 0.35,
      },
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
  if (control === 'blur') {
    return {
      ...state,
      optics: { ...state.optics, blur: value },
    };
  }
  if (control === 'dispersion') {
    return {
      ...state,
      optics: { ...state.optics, dispersion: value },
    };
  }
  if (control === 'radius') {
    return {
      ...state,
      shape: {
        radius: value,
        radiusTL: value,
        radiusTR: value,
        radiusBR: value,
        radiusBL: value,
      },
    };
  }
  if (
    control === 'radiusTL'
    || control === 'radiusTR'
    || control === 'radiusBR'
    || control === 'radiusBL'
  ) {
    return {
      ...state,
      shape: { ...state.shape, [control]: value },
    };
  }
  if (control === 'renderPrecision') {
    return {
      ...state,
      render: { ...state.render, precision: value },
    };
  }
  if (control === 'renderOrder') {
    return {
      ...state,
      render: { ...state.render, order: value },
    };
  }
  if (
    control === 'illuminationAngle'
    || control === 'illuminationIntensity'
  ) {
    return {
      ...state,
      appearance: { ...state.appearance, [control]: value },
    };
  }
  return {
    ...state,
    interaction: {
      ...state.interaction,
      config: { ...state.interaction.config, [control]: value },
    },
  };
}

/** Narrow a data-control value to a currently supported Lab numeric control. */
export function isLabNumericControl(value: string): value is LabNumericControl {
  return value === 'thickness'
    || value === 'refractIndex'
    || value === 'refractIntensity'
    || value === 'blur'
    || value === 'dispersion'
    || value === 'radius'
    || value === 'radiusTL'
    || value === 'radiusTR'
    || value === 'radiusBR'
    || value === 'radiusBL'
    || value === 'renderPrecision'
    || value === 'renderOrder'
    || value === 'illuminationAngle'
    || value === 'illuminationIntensity'
    || value === 'activeScale'
    || value === 'translateFactor'
    || value === 'stretchFactor'
    || value === 'highlightOpacity';
}

/** Apply one Lab checkbox without mutating prior state. */
export function updateLabBooleanControl(
  state: Readonly<LabState>,
  control: LabBooleanControl,
  value: boolean,
): LabState {
  if (control === 'useCustomColor') {
    return {
      ...state,
      appearance: { ...state.appearance, useCustomColor: value },
    };
  }
  return {
    ...state,
    interaction: { ...state.interaction, [control]: value },
  };
}

/** Narrow a data attribute to one supported Lab checkbox. */
export function isLabBooleanControl(value: string): value is LabBooleanControl {
  return value === 'useCustomColor'
    || value === 'disableInteractions'
    || value === 'onlyClickInteractions'
    || value === 'isMoveable';
}

/** Apply a validated material tint without mutating prior state. */
export function updateLabColor(
  state: Readonly<LabState>,
  color: string,
): LabState {
  const normalized = normalizeLabTintColor(color);
  if (!normalized) return cloneLabState(state);
  return {
    ...state,
    appearance: {
      ...state.appearance,
      backgroundColor: normalized,
      useCustomColor: true,
    },
  };
}

/** Normalize an RGB color input to a restrained translucent CSS tint. */
export function normalizeLabTintColor(color: string): string | null {
  const normalized = color.toLowerCase();
  if (RGBA_HEX_PATTERN.test(normalized)) return normalized;
  if (RGB_HEX_PATTERN.test(normalized)) {
    return `${normalized}${DEFAULT_TINT_ALPHA}`;
  }
  return null;
}

/** Convert a stored translucent tint into a value accepted by type=color. */
export function resolveLabColorInputValue(color: string): string {
  return normalizeLabTintColor(color)?.slice(0, 7) ?? '#d9f2ea';
}

/** Apply a public interaction preset without mutating prior Lab state. */
export function updateLabInteractionPreset(
  state: Readonly<LabState>,
  preset: InteractionPreset,
): LabState {
  return {
    ...state,
    interaction: { ...state.interaction, preset },
  };
}

/** Narrow an option value to a public interaction preset. */
export function isLabInteractionPreset(
  value: string,
): value is InteractionPreset {
  return value === 'button'
    || value === 'context-menu'
    || value === 'slider'
    || value === 'custom';
}

/** Apply a focused backdrop source without mutating prior Lab state. */
export function updateLabSourceKind(
  state: Readonly<LabState>,
  kind: LabState['source']['kind'],
): LabState {
  return {
    ...state,
    source: { ...state.source, kind },
  };
}

/** Narrow an option value to a focused backdrop source kind. */
export function isLabSourceKind(
  value: string,
): value is LabState['source']['kind'] {
  return value === 'canvas' || value === 'dom';
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
