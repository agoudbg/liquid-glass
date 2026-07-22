import type {
  CustomDrawCallback,
  MaterialAppearanceOptions,
  MaterialConfig,
} from '@agou/liquid-glass-core';

import type { PlaygroundState, SceneId } from './types';

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
  /** Public adapter options for this material. */
  options: SceneMaterialOptions;
}

/** Stable content rendered inside the S003 DOM capture source. */
export interface DomCaptureContent {
  /** Compact capture-state label. */
  eyebrow: string;
  /** Prominent editorial heading. */
  title: string;
  /** Supporting copy that changes through a real DOM mutation. */
  description: string;
  /** CSS phase class used to change captured colors. */
  phaseClass: string;
}

/** Resolve one of the two deterministic DOM capture states. */
export function resolveDomCaptureContent(
  variant: PlaygroundState['domVariant'],
): DomCaptureContent {
  return variant === 'mutated'
    ? {
        eyebrow: 'MUTATION 02 / CORAL',
        title: 'Alpine afterglow',
        description: 'A replaced DOM subtree shifts type, color, and the refracted image.',
        phaseClass: 'is-mutated',
      }
    : {
        eyebrow: 'SOURCE 01 / LAKE',
        title: 'Dolomite daylight',
        description: 'Live text, local imagery, and color captured from ordinary HTML.',
        phaseClass: 'is-source',
      };
}

const drawSingleBackdrop: CustomDrawCallback = (context, width, height) => {
  drawBackdropBase(context, width, height, 'single');
};

const drawMultipleBackdrop: CustomDrawCallback = (context, width, height) => {
  drawBackdropBase(context, width, height, 'multiple');
};

const drawOracleBackdrop: CustomDrawCallback = (context, width, height) => {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#f0c65b');
  gradient.addColorStop(0.38, '#db4b55');
  gradient.addColorStop(0.7, '#227f8f');
  gradient.addColorStop(1, '#15263d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const cellSize = 72;
  for (let y = 0; y < height + cellSize; y += cellSize) {
    for (let x = 0; x < width + cellSize; x += cellSize) {
      context.fillStyle = (x / cellSize + y / cellSize) % 2 === 0
        ? 'rgba(255, 255, 255, 0.18)'
        : 'rgba(3, 11, 24, 0.16)';
      context.fillRect(x, y, cellSize, cellSize);
    }
  }
};

/** Return the stable deterministic backdrop callback for one scene. */
export function getBackdropDraw(
  scene: SceneId,
  oracleMode = false,
): CustomDrawCallback {
  if (oracleMode) return drawOracleBackdrop;
  return scene === 'S002' ? drawMultipleBackdrop : drawSingleBackdrop;
}

/** Resolve the canonical material set from the current optical controls. */
export function resolveSceneMaterials(state: PlaygroundState): readonly SceneMaterial[] {
  if (state.oracleMode) return resolveOracleMaterials(state.scene);
  const multiple = state.scene === 'S002';

  const primary: SceneMaterial = {
    id: 'primary',
    className: state.scene === 'S003'
      ? 'scene-material material-dom'
      : multiple
        ? 'scene-material material-primary'
        : 'scene-material material-single',
    label: 'MATERIAL 01',
    name: state.scene === 'S003'
      ? 'Captured detail'
      : state.scene === 'S007'
        ? 'Fallback surface'
        : multiple ? 'Primary lens' : 'Optical surface',
    options: {
      radius: state.radius,
      radiusTR: Math.max(8, state.radius - 12),
      radiusBL: Math.min(72, state.radius + 12),
      thickness: state.thickness,
      refractIndex: state.refractIndex,
      refractIntensity: state.refractIntensity,
      dispersion: 0.018,
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

function resolveOracleMaterials(scene: SceneId): readonly SceneMaterial[] {
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

function drawBackdropBase(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  variant: 'single' | 'multiple',
): void {
  const minimumSide = Math.max(1, Math.min(width, height));
  const grid = Math.max(34, Math.round(minimumSide / 12));
  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = variant === 'single' ? '#e6ebe6' : '#e8e9e5';
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#d3e4df';
  context.fillRect(0, 0, width * 0.24, height);
  context.fillStyle = variant === 'single' ? '#e4a78f' : '#c7d3ef';
  context.fillRect(width * 0.68, 0, width * 0.32, height);
  context.fillStyle = '#243837';
  context.fillRect(width * 0.78, height * 0.64, width * 0.22, height * 0.36);

  context.lineWidth = 1;
  context.strokeStyle = 'rgba(36, 56, 55, 0.16)';
  for (let x = 0; x <= width; x += grid) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += grid) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }

  context.save();
  context.translate(width * 0.46, height * 0.45);
  context.rotate(variant === 'single' ? -0.23 : 0.18);
  context.fillStyle = '#f0cf5b';
  context.fillRect(-width * 0.36, -grid * 0.52, width * 0.72, grid * 1.04);
  context.fillStyle = '#e97f66';
  context.fillRect(-width * 0.18, grid * 0.62, width * 0.48, grid * 0.24);
  context.restore();

  context.strokeStyle = '#2c8a7b';
  context.lineWidth = Math.max(7, minimumSide * 0.012);
  context.beginPath();
  context.moveTo(-grid, height * 0.78);
  context.bezierCurveTo(
    width * 0.22,
    height * 0.54,
    width * 0.54,
    height * 0.95,
    width + grid,
    height * 0.38,
  );
  context.stroke();

  const dotRadius = Math.max(3, minimumSide * 0.006);
  context.fillStyle = '#f7f4ec';
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const x = width * 0.055 + column * grid * 0.44;
      const y = height * 0.12 + row * grid * 0.44;
      context.beginPath();
      context.arc(x, y, dotRadius, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.strokeStyle = 'rgba(247, 244, 236, 0.88)';
  context.lineWidth = Math.max(2, minimumSide * 0.004);
  context.beginPath();
  context.arc(width * 0.88, height * 0.78, minimumSide * 0.11, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(width * 0.88, height * 0.78, minimumSide * 0.055, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}
