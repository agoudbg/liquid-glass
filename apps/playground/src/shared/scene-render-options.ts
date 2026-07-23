import {
  DEFAULT_LAB_URL_VALUES,
  type LabUrlValues,
} from './lab-state';
import type { PlaygroundState } from './types';

const ORACLE_CONTROL_VALUES = {
  S001: {
    thickness: 18,
    refractIndex: 1.18,
    refractIntensity: 0.72,
    radius: 52,
    renderPrecision: 1,
  },
  S002: {
    thickness: 16,
    refractIndex: 1.12,
    refractIntensity: 0.64,
    radius: 44,
    renderPrecision: 1,
  },
  S004: {
    thickness: 10,
    refractIndex: 1.1,
    refractIntensity: 0.5,
    radius: 40,
    renderPrecision: 1,
  },
} as const satisfies Readonly<Record<'S001' | 'S002' | 'S004', LabUrlValues>>;

const INTERACTION_CONTROL_VALUES: Readonly<LabUrlValues> = {
  thickness: 30,
  refractIndex: 1.1,
  refractIntensity: 0.5,
  radius: 28,
  renderPrecision: 1,
};

/** Return whether the current scene may mutate the isolated Lab controls. */
export function isLabSceneEditable(state: PlaygroundState): boolean {
  return state.scene === 'S001' && !state.oracleMode;
}

/** Resolve effective compact-inspector values without exposing Lab edits to fixed scenes. */
export function resolveSceneControlValues(state: PlaygroundState): LabUrlValues {
  if (state.oracleMode) {
    if (state.scene === 'S001') return { ...ORACLE_CONTROL_VALUES.S001 };
    if (state.scene === 'S002') return { ...ORACLE_CONTROL_VALUES.S002 };
    if (state.scene === 'S004') return { ...ORACLE_CONTROL_VALUES.S004 };
  }
  if (isLabSceneEditable(state)) {
    return {
      thickness: state.lab.optics.thickness,
      refractIndex: state.lab.optics.refractIndex,
      refractIntensity: state.lab.optics.refractIntensity,
      radius: state.lab.shape.radius,
      renderPrecision: state.lab.render.precision,
    };
  }
  if (state.scene === 'S004') return { ...INTERACTION_CONTROL_VALUES };
  return { ...DEFAULT_LAB_URL_VALUES };
}

/** Resolve render precision without leaking Lab edits into canonical scenes. */
export function resolveSceneRenderPrecision(state: PlaygroundState): number {
  return resolveSceneControlValues(state).renderPrecision;
}
