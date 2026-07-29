import type {
  CustomDrawCallback,
  ProxyTargetInterface,
} from '@agou/liquid-glass-core';

import type { SceneId } from './scene-catalog';
import type { SceneMaterial } from './scene-material-types';

/** Canonical advanced scenes rendered by the Composition workbench. */
export type CompositionSceneId = Extract<
  SceneId,
  'S008' | 'S009' | 'S010' | 'S011' | 'S012'
>;

const BASE_OPTIONS = {
  blur: 0.016,
  disableInteractions: true,
  dispersion: 0.018,
  illuminationAngle: 36,
  illuminationIntensity: 0.62,
  radius: 30,
  refractIndex: 1.2,
  refractIntensity: 0.72,
  thickness: 34,
} as const;

const DEDICATED_MATERIALS: readonly SceneMaterial[] = [
  material('dedicated-wide', 'composition-material dedicated-wide', 'CLIP 01', 'Wide aperture', {
    radiusTR: 14,
    renderMode: 'dedicated',
    renderOrder: 10,
  }),
  material('dedicated-compact', 'composition-material dedicated-compact', 'CLIP 02', 'Compact aperture', {
    dispersion: 0.032,
    radius: 42,
    radiusBL: 12,
    renderMode: 'dedicated',
    renderOrder: 20,
    thickness: 46,
  }),
];

const NESTED_MATERIALS: readonly SceneMaterial[] = [
  material('nested-parent', 'composition-material nested-parent-material', 'PARENT', 'Outer refraction', {
    radius: 38,
    renderOrder: 20,
    thickness: 44,
  }),
  material('nested-child', 'composition-material nested-child-material', 'CHILD', 'Full canvas source', {
    dispersion: 0.028,
    radius: 24,
    renderOrder: 10,
    thickness: 30,
  }),
];

const THEME_MATERIALS: readonly SceneMaterial[] = [
  themeMaterial('ultra-dark', 'Ultra dark', 1),
  themeMaterial('dark', 'Dark', 2),
  themeMaterial('light', 'Light', 3),
  themeMaterial('ultra-light', 'Ultra light', 4),
];

const LIFECYCLE_MATERIALS: readonly SceneMaterial[] = [
  material('lifecycle', 'composition-material lifecycle-material', 'DIAGNOSTICS', 'Context lifecycle', {
    radius: 36,
    thickness: 40,
  }),
];

/** Narrow a scene to the five advanced Composition fixtures. */
export function isCompositionScene(scene: SceneId): scene is CompositionSceneId {
  return scene === 'S008'
    || scene === 'S009'
    || scene === 'S010'
    || scene === 'S011'
    || scene === 'S012';
}

/** Resolve the fixed framework-neutral materials represented by a scene. */
export function resolveCompositionMaterials(
  scene: CompositionSceneId,
): readonly SceneMaterial[] {
  if (scene === 'S008') return DEDICATED_MATERIALS;
  if (scene === 'S009') return NESTED_MATERIALS;
  if (scene === 'S010') return [createProxyMaterial()];
  if (scene === 'S011') return THEME_MATERIALS;
  return LIFECYCLE_MATERIALS;
}

/** Build the delegated material with an optional live target interface. */
export function createProxyMaterial(
  proxyTarget?: ProxyTargetInterface,
): SceneMaterial {
  return material(
    'proxy',
    'composition-material proxy-material',
    'DELEGATED',
    'External material',
    {
      dispersion: 0.036,
      proxyTarget,
      radius: 44,
      radiusTR: 16,
      thickness: 48,
    },
  );
}

/** Resolve a stable deterministic canvas fixture for one Composition scene. */
export function getCompositionBackdropDraw(
  scene: CompositionSceneId,
): CustomDrawCallback {
  if (scene === 'S011') return drawThemeBackdrop;
  if (scene === 'S009') return drawNestedOuterBackdrop;
  return drawCompositionBackdrop;
}

/** Stable child backdrop used to prove full-canvas nesting. */
export const drawNestedChildBackdrop: CustomDrawCallback = (
  context,
  width,
  height,
) => {
  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#213c39';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#f0cf5b';
  context.fillRect(width * 0.08, height * 0.12, width * 0.84, height * 0.22);
  context.fillStyle = '#da806d';
  context.fillRect(width * 0.24, height * 0.54, width * 0.68, height * 0.2);
  context.strokeStyle = 'rgba(238, 247, 243, 0.72)';
  context.lineWidth = Math.max(2, Math.min(width, height) * 0.012);
  context.beginPath();
  context.arc(width * 0.32, height * 0.62, height * 0.22, 0, Math.PI * 2);
  context.stroke();
  context.restore();
};

function material(
  id: string,
  className: string,
  label: string,
  name: string,
  options: SceneMaterial['options'],
): SceneMaterial {
  return {
    id,
    className,
    label,
    name,
    options: { ...BASE_OPTIONS, ...options },
  };
}

function themeMaterial(
  id: string,
  name: string,
  index: number,
): SceneMaterial {
  return material(
    `theme-${id}`,
    `composition-material theme-material theme-material-${String(index)}`,
    `SAMPLE 0${String(index)}`,
    name,
    {
      radius: 22,
      renderOrder: index,
      thickness: 28,
    },
  );
}

const drawCompositionBackdrop: CustomDrawCallback = (
  context,
  width,
  height,
) => {
  context.save();
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#dce4df';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#1f4f49';
  context.fillRect(width * 0.64, 0, width * 0.36, height);
  context.fillStyle = '#efcf5d';
  context.fillRect(0, height * 0.18, width * 0.72, height * 0.18);
  context.fillStyle = '#df806f';
  context.fillRect(width * 0.16, height * 0.68, width * 0.68, height * 0.14);
  drawGrid(context, width, height);
  context.restore();
};

const drawNestedOuterBackdrop: CustomDrawCallback = (
  context,
  width,
  height,
) => {
  drawCompositionBackdrop(context, width, height);
  context.save();
  context.fillStyle = 'rgba(247, 244, 236, 0.84)';
  context.fillRect(width * 0.06, height * 0.08, width * 0.58, height * 0.78);
  context.strokeStyle = '#24776c';
  context.lineWidth = Math.max(2, Math.min(width, height) * 0.008);
  context.strokeRect(width * 0.06, height * 0.08, width * 0.58, height * 0.78);
  context.restore();
};

const drawThemeBackdrop: CustomDrawCallback = (
  context,
  width,
  height,
) => {
  const colors = ['#101716', '#3a4a47', '#bac6c2', '#f3f4ef'];
  context.save();
  context.clearRect(0, 0, width, height);
  for (const [index, color] of colors.entries()) {
    context.fillStyle = color;
    context.fillRect(index * width / 4, 0, width / 4 + 1, height);
  }
  context.restore();
};

function drawGrid(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const spacing = Math.max(34, Math.round(Math.min(width, height) / 10));
  context.strokeStyle = 'rgba(30, 61, 57, 0.14)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += spacing) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += spacing) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
}
