import type {
  CustomDrawCallback,
  ViewportCaptureConfig,
} from '@agou/liquid-glass-core';

import { getSceneDefinition, type SceneId } from './scene-catalog';
import type { PlaygroundState } from './types';

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

/** One deterministic color band shared by the body and internal scroll scenes. */
export interface ScrollBand {
  /** Stable band identifier. */
  id: string;
  /** Compact visual category. */
  tone: 'coral' | 'ink' | 'mist' | 'sun' | 'teal';
  /** Primary band label. */
  title: string;
  /** Secondary edge label. */
  detail: string;
}

/** Long-form DOM content used to exercise coordinate mapping while scrolling. */
export const SCROLL_BANDS: readonly ScrollBand[] = [
  { id: '01', tone: 'mist', title: 'Glacial field', detail: 'NORTH / 01' },
  { id: '02', tone: 'sun', title: 'High noon', detail: 'EAST / 02' },
  { id: '03', tone: 'ink', title: 'Slate current', detail: 'SOUTH / 03' },
  { id: '04', tone: 'coral', title: 'Signal coral', detail: 'WEST / 04' },
  { id: '05', tone: 'teal', title: 'Tectonic blue', detail: 'NORTH / 05' },
  { id: '06', tone: 'mist', title: 'Cloud shelf', detail: 'EAST / 06' },
  { id: '07', tone: 'ink', title: 'Deep contour', detail: 'SOUTH / 07' },
  { id: '08', tone: 'sun', title: 'Solar marker', detail: 'WEST / 08' },
  { id: '09', tone: 'teal', title: 'Lake interval', detail: 'NORTH / 09' },
  { id: '10', tone: 'coral', title: 'Last light', detail: 'EAST / 10' },
];

const VIEWPORT_CAPTURE_POLICY: ViewportCaptureConfig = {
  bufferX: 80,
  bufferY: 180,
  enabled: true,
};

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

/** Return whether a scene uses a real DOM backdrop converter. */
export function isDomCaptureScene(scene: SceneId): boolean {
  return getSceneDefinition(scene).captureKind !== 'canvas';
}

/** Return whether current state selects a real DOM backdrop converter. */
export function isDomCaptureState(state: PlaygroundState): boolean {
  return isDomCaptureScene(state.scene)
    || (
      state.scene === 'S001'
      && !state.oracleMode
      && state.lab.source.kind === 'dom'
    );
}

/** Return whether a DOM source uses the editorial image-and-copy layout. */
export function isEditorialDomCaptureState(state: PlaygroundState): boolean {
  return state.scene === 'S003'
    || (
      state.scene === 'S001'
      && !state.oracleMode
      && state.lab.source.kind === 'dom'
    );
}

/** Resolve the fill supplied to the active DOM backdrop converter. */
export function resolveBackdropBackgroundColor(state: PlaygroundState): string {
  return state.scene === 'S001' && !state.oracleMode
    ? state.lab.source.backgroundColor
    : '#dce4df';
}

/** Resolve the current source label shown over the stage. */
export function resolveStageSource(state: PlaygroundState): string {
  if (
    state.scene === 'S001'
    && !state.oracleMode
    && state.lab.source.kind === 'dom'
  ) {
    return '01 / DOM SOURCE';
  }
  return getSceneDefinition(state.scene).stageSource;
}

/** Return whether a scene exercises body or internal scrolling. */
export function isScrollCaptureScene(scene: SceneId): boolean {
  const captureKind = getSceneDefinition(scene).captureKind;
  return captureKind === 'body-scroll' || captureKind === 'internal-scroll';
}

/** Resolve the bounded source policy without recreating option objects. */
export function resolveViewportCapture(
  state: PlaygroundState,
): boolean | ViewportCaptureConfig {
  return getSceneDefinition(state.scene).captureKind === 'internal-scroll'
    && state.viewportEnabled
    ? VIEWPORT_CAPTURE_POLICY
    : false;
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

/** Return the stable deterministic backdrop callback for one scene. */
export function getBackdropDraw(
  scene: SceneId,
  oracleMode = false,
): CustomDrawCallback {
  if (oracleMode) return drawOracleBackdrop;
  return scene === 'S002' ? drawMultipleBackdrop : drawSingleBackdrop;
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
