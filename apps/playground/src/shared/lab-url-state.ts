import {
  createDefaultLabState,
  DEFAULT_LAB_URL_VALUES,
  isLabEdgeStyle,
  normalizeLabTintColor,
} from './lab-state';
import type { LabState } from './types';

/** Parse the complete reproducible Lab state from URL search parameters. */
export function parseLabUrlState(params: URLSearchParams): LabState {
  const lab = createDefaultLabState({
    thickness: parseNumber(
      params.get('thickness'),
      0,
      100,
      DEFAULT_LAB_URL_VALUES.thickness,
    ),
    refractIndex: parseNumber(
      params.get('ior'),
      1,
      3,
      DEFAULT_LAB_URL_VALUES.refractIndex,
    ),
    refractIntensity: parseNumber(
      params.get('intensity'),
      0,
      2,
      DEFAULT_LAB_URL_VALUES.refractIntensity,
    ),
    radius: parseNumber(
      params.get('radius'),
      0,
      200,
      DEFAULT_LAB_URL_VALUES.radius,
    ),
  });
  const preset = params.get('interaction');
  const source = params.get('source');
  const edgeStyle = params.get('edgeStyle');

  return {
    optics: {
      ...lab.optics,
      blur: parseNumber(params.get('blur'), 0, 20, lab.optics.blur),
      dispersion: parseNumber(
        params.get('dispersion'),
        0,
        0.2,
        lab.optics.dispersion,
      ),
    },
    shape: {
      ...lab.shape,
      radiusTL: parseNumber(params.get('radiusTL'), 0, 200, lab.shape.radiusTL),
      radiusTR: parseNumber(params.get('radiusTR'), 0, 200, lab.shape.radiusTR),
      radiusBR: parseNumber(params.get('radiusBR'), 0, 200, lab.shape.radiusBR),
      radiusBL: parseNumber(params.get('radiusBL'), 0, 200, lab.shape.radiusBL),
    },
    appearance: {
      ...lab.appearance,
      edgeStyle: edgeStyle && isLabEdgeStyle(edgeStyle)
        ? edgeStyle
        : lab.appearance.edgeStyle,
      useCustomColor: params.get('customColor') === 'on',
      backgroundColor: parseColor(
        params.get('color'),
        lab.appearance.backgroundColor,
      ),
      illuminationAngle: parseNumber(
        params.get('lightAngle'),
        0,
        360,
        lab.appearance.illuminationAngle,
      ),
      illuminationIntensity: parseNumber(
        params.get('lightIntensity'),
        0,
        1,
        lab.appearance.illuminationIntensity,
      ),
    },
    interaction: {
      ...lab.interaction,
      disableInteractions: params.get('interactions') === 'off',
      onlyClickInteractions: params.get('clickOnly') === 'on',
      isMoveable: params.get('moveable') === 'on',
      preset: preset === 'context-menu'
        || preset === 'slider'
        || preset === 'custom'
        ? preset
        : 'button',
      config: {
        ...lab.interaction.config,
        activeScale: parseNumber(
          params.get('activeScale'),
          0.5,
          2,
          lab.interaction.config.activeScale ?? 1.08,
        ),
        translateFactor: parseNumber(
          params.get('translateFactor'),
          0,
          1,
          lab.interaction.config.translateFactor ?? 0.2,
        ),
        stretchFactor: parseNumber(
          params.get('stretchFactor'),
          0,
          0.01,
          lab.interaction.config.stretchFactor ?? 0.0015,
        ),
        highlightOpacity: parseNumber(
          params.get('highlightOpacity'),
          0,
          1,
          lab.interaction.config.highlightOpacity ?? 0.35,
        ),
      },
    },
    render: {
      order: parseNumber(params.get('renderOrder'), -100, 100, lab.render.order),
    },
    source: {
      ...lab.source,
      kind: source === 'dom' ? 'dom' : 'canvas',
    },
  };
}

/** Write the complete Lab state while retaining the original five parameter names. */
export function writeLabUrlState(
  params: URLSearchParams,
  lab: Readonly<LabState>,
): void {
  params.set('thickness', String(lab.optics.thickness));
  params.set('ior', lab.optics.refractIndex.toFixed(2));
  params.set('intensity', lab.optics.refractIntensity.toFixed(2));
  params.set('blur', String(lab.optics.blur));
  params.set('dispersion', String(lab.optics.dispersion));
  params.set('radius', String(lab.shape.radius));
  params.set('radiusTL', String(lab.shape.radiusTL));
  params.set('radiusTR', String(lab.shape.radiusTR));
  params.set('radiusBR', String(lab.shape.radiusBR));
  params.set('radiusBL', String(lab.shape.radiusBL));
  params.set('renderOrder', String(lab.render.order));
  params.set('customColor', lab.appearance.useCustomColor ? 'on' : 'off');
  params.set('edgeStyle', lab.appearance.edgeStyle);
  params.set('color', lab.appearance.backgroundColor);
  params.set('lightAngle', String(lab.appearance.illuminationAngle));
  params.set('lightIntensity', String(lab.appearance.illuminationIntensity));
  params.set('interaction', lab.interaction.preset);
  params.set(
    'interactions',
    lab.interaction.disableInteractions ? 'off' : 'on',
  );
  params.set('clickOnly', lab.interaction.onlyClickInteractions ? 'on' : 'off');
  params.set('moveable', lab.interaction.isMoveable ? 'on' : 'off');
  params.set(
    'activeScale',
    String(lab.interaction.config.activeScale ?? 1.08),
  );
  params.set(
    'translateFactor',
    String(lab.interaction.config.translateFactor ?? 0.2),
  );
  params.set(
    'stretchFactor',
    String(lab.interaction.config.stretchFactor ?? 0.0015),
  );
  params.set(
    'highlightOpacity',
    String(lab.interaction.config.highlightOpacity ?? 0.35),
  );
  params.set('source', lab.source.kind);
}

function parseNumber(
  value: string | null,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function parseColor(value: string | null, fallback: string): string {
  return value ? (normalizeLabTintColor(value) ?? fallback) : fallback;
}
