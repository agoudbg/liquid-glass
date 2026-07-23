import type { LabNumericControl } from './lab-state';
import type { LabState } from './types';

/** One compact numeric control rendered by the Lab inspector. */
export interface LabRangeControl {
  /** Stable DOM and transition identifier. */
  readonly id: LabNumericControl;
  /** Human-readable control label. */
  readonly label: string;
  /** Inclusive slider minimum. */
  readonly minimum: number;
  /** Inclusive slider maximum. */
  readonly maximum: number;
  /** Slider increment. */
  readonly step: number;
  /** Optional compact value suffix. */
  readonly suffix?: string;
  /** Fixed decimal places used by the output label. */
  readonly digits: number;
}

/** One visually grouped set of related Lab ranges. */
export interface LabRangeGroup {
  /** Stable group identifier. */
  readonly id: 'optics' | 'shape' | 'appearance' | 'render' | 'custom';
  /** Compact group heading. */
  readonly label: string;
  /** Numeric controls rendered in order. */
  readonly controls: readonly LabRangeControl[];
}

/** Complete range inventory shared by markup, view binding, and tests. */
export const LAB_RANGE_GROUPS: readonly LabRangeGroup[] = [
  {
    id: 'optics',
    label: 'Optics',
    controls: [
      range('thickness', 'Thickness', 0, 100, 1, 0, ' px'),
      range('refractIndex', 'Index of refraction', 1, 3, 0.01, 2),
      range('refractIntensity', 'Refraction', 0, 2, 0.01, 2),
      range('blur', 'Blur', 0, 20, 0.5, 1, ' px'),
      range('dispersion', 'Dispersion', 0, 0.2, 0.005, 3),
    ],
  },
  {
    id: 'shape',
    label: 'Shape',
    controls: [
      range('radius', 'Shared radius', 0, 200, 1, 0, ' px'),
      range('radiusTL', 'Top left', 0, 200, 1, 0, ' px'),
      range('radiusTR', 'Top right', 0, 200, 1, 0, ' px'),
      range('radiusBR', 'Bottom right', 0, 200, 1, 0, ' px'),
      range('radiusBL', 'Bottom left', 0, 200, 1, 0, ' px'),
    ],
  },
  {
    id: 'appearance',
    label: 'Illumination',
    controls: [
      range('illuminationAngle', 'Angle', 0, 360, 1, 0, ' deg'),
      range('illuminationIntensity', 'Intensity', 0, 1, 0.01, 2),
    ],
  },
  {
    id: 'render',
    label: 'Render',
    controls: [
      range('renderOrder', 'Order', -100, 100, 1, 0),
    ],
  },
  {
    id: 'custom',
    label: 'Custom response',
    controls: [
      range('activeScale', 'Active scale', 0.5, 2, 0.01, 2),
      range('translateFactor', 'Translation', 0, 1, 0.01, 2),
      range('stretchFactor', 'Stretch', 0, 0.01, 0.0001, 4),
      range('highlightOpacity', 'Highlight', 0, 1, 0.01, 2),
    ],
  },
];

/** Read one numeric control value from immutable Lab state. */
export function readLabNumericControl(
  state: Readonly<LabState>,
  control: LabNumericControl,
): number {
  if (control === 'thickness') return state.optics.thickness;
  if (control === 'refractIndex') return state.optics.refractIndex;
  if (control === 'refractIntensity') return state.optics.refractIntensity;
  if (control === 'blur') return state.optics.blur;
  if (control === 'dispersion') return state.optics.dispersion;
  if (control === 'radius') return state.shape.radius;
  if (control === 'radiusTL') return state.shape.radiusTL;
  if (control === 'radiusTR') return state.shape.radiusTR;
  if (control === 'radiusBR') return state.shape.radiusBR;
  if (control === 'radiusBL') return state.shape.radiusBL;
  if (control === 'renderOrder') return state.render.order;
  if (control === 'illuminationAngle') return state.appearance.illuminationAngle;
  if (control === 'illuminationIntensity') {
    return state.appearance.illuminationIntensity;
  }
  return state.interaction.config[control] ?? 0;
}

/** Format one range value for a compact live output. */
export function formatLabRangeValue(
  control: LabRangeControl,
  value: number,
): string {
  return `${value.toFixed(control.digits)}${control.suffix ?? ''}`;
}

function range(
  id: LabNumericControl,
  label: string,
  minimum: number,
  maximum: number,
  step: number,
  digits: number,
  suffix?: string,
): LabRangeControl {
  return {
    id,
    label,
    minimum,
    maximum,
    step,
    digits,
    ...(suffix ? { suffix } : {}),
  };
}
