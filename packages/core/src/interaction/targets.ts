import type { InteractionConfig } from '../types/interaction';
import { calculateOriginShift } from './origin';
import { calculateStretch } from './stretch';
import type {
  InteractionElementSize,
  InteractionEngineState,
} from './types';

const ABSOLUTE_REFERENCE_SIZE = 100;
const CROSS_AXIS_COMPRESSION_RATIO = 0.6;

function softClamp(value: number, limit: number): number {
  if (limit <= 0) {
    return 0;
  }

  return Math.tanh((value / limit) * 0.8) * limit;
}

/**
 * Updates hover scale and translation targets from pointer displacement.
 *
 * @param state - Engine state to mutate.
 * @param config - Resolved interaction configuration.
 * @param dx - Horizontal displacement from the hover origin.
 * @param dy - Vertical displacement from the hover origin.
 */
export function updateHoverTargets(
  state: InteractionEngineState,
  config: InteractionConfig,
  dx: number,
  dy: number,
): void {
  const { hoverScale, hoverFollowFactor, hoverFollowMaxDistance } = config;
  state.targetScaleX = hoverScale;
  state.targetScaleY = hoverScale;
  state.targetTranslateX = Math.max(
    -hoverFollowMaxDistance,
    Math.min(hoverFollowMaxDistance, dx * hoverFollowFactor),
  );
  state.targetTranslateY = Math.max(
    -hoverFollowMaxDistance,
    Math.min(hoverFollowMaxDistance, dy * hoverFollowFactor),
  );
  state.targetOriginX = 50;
  state.targetOriginY = 50;
}

/**
 * Updates active transform targets using the legacy stretch and pull formulas.
 *
 * @param state - Engine state to mutate.
 * @param config - Resolved interaction configuration.
 * @param elementSize - Current material dimensions.
 * @param dx - Horizontal displacement from the press origin.
 * @param dy - Vertical displacement from the press origin.
 */
export function updateActiveTargets(
  state: InteractionEngineState,
  config: InteractionConfig,
  elementSize: InteractionElementSize,
  dx: number,
  dy: number,
): void {
  const {
    activeScale,
    maxScale,
    translateFactor,
    maxTranslate,
    maxTranslateY,
    stretchFactor,
    stretchLimit,
    preserveArea,
    velocityStretch,
    velocityStretchFactor,
    enableOriginShift,
    originShiftSensitivity,
    activeOpacity,
    enableOpacityTransition,
    ignorePointerPosition,
    useAbsoluteValues,
  } = config;
  const hasValidDimensions = elementSize.width > 0 && elementSize.height > 0;
  const stretchWidth = useAbsoluteValues
    ? ABSOLUTE_REFERENCE_SIZE
    : (hasValidDimensions ? elementSize.width : 1);
  const stretchHeight = useAbsoluteValues
    ? ABSOLUTE_REFERENCE_SIZE
    : (hasValidDimensions ? elementSize.height : 1);

  let scaleX = activeScale;
  let scaleY = activeScale;
  let stretchX = 0;
  let stretchY = 0;

  if (velocityStretch || ignorePointerPosition) {
    const factor = velocityStretchFactor ?? stretchFactor * 50;
    const stretch = calculateStretch(
      state.pointerVelocityX,
      state.pointerVelocityY,
      factor,
      stretchLimit,
      stretchWidth,
      stretchHeight,
    );
    stretchX = stretch.stretchX;
    stretchY = stretch.stretchY;
  } else {
    const stretch = calculateStretch(
      dx,
      dy,
      stretchFactor,
      stretchLimit,
      stretchWidth,
      stretchHeight,
    );
    stretchX = stretch.stretchX;
    stretchY = stretch.stretchY;
  }

  scaleX += stretchX;
  scaleX -= stretchY * CROSS_AXIS_COMPRESSION_RATIO;
  scaleY += stretchY;
  scaleY -= stretchX * CROSS_AXIS_COMPRESSION_RATIO;

  if (preserveArea) {
    const area = scaleX * scaleY;
    const targetArea = activeScale * activeScale;
    if (area > targetArea) {
      const factor = Math.sqrt(targetArea / area);
      scaleX *= factor;
      scaleY *= factor;
    }
  }

  state.targetScaleX = Math.max(0.5, Math.min(maxScale, scaleX));
  state.targetScaleY = Math.max(0.5, Math.min(maxScale, scaleY));
  state.targetTranslateX = softClamp(dx * translateFactor, maxTranslate);
  state.targetTranslateY = softClamp(
    dy * translateFactor,
    maxTranslateY ?? maxTranslate,
  );

  if (enableOriginShift && elementSize.width > 0 && elementSize.height > 0) {
    const origin = calculateOriginShift(
      dx,
      dy,
      elementSize.width,
      elementSize.height,
      originShiftSensitivity,
    );
    state.targetOriginX = origin.originX;
    state.targetOriginY = origin.originY;
  }

  if (enableOpacityTransition && activeOpacity !== undefined) {
    state.targetOpacity = activeOpacity;
  }

  if (
    config.enableBackgroundTransition
    && config.activeBackgroundColor !== undefined
  ) {
    state.targetBackgroundColor = config.activeBackgroundColor;
    state.backgroundColor = config.activeBackgroundColor;
  }
}
