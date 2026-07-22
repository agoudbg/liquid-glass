export {
  clampCanvasDimensions,
  detectFeatures,
  type FeatureDetectionEnvironment,
  type FeatureSupport,
  getSafeDevicePixelRatio,
  isMobileDevice,
  isWebGL2Supported,
  isWebGLSupported,
  MAX_CANVAS_DIMENSION_MOBILE,
  MAX_DPR_MOBILE,
  requiresFallback,
} from './feature-detect';
export {
  computeCumulativeOpacity,
  type ComputedVisibility,
  computeElementVisibility,
  isElementHidden,
  type VisibilityState,
  type VisibilityStyle,
  type VisibilityStyleReader,
} from './opacity';
export {
  type BorderRadiusStyle,
  type CornerRadiusOverrides,
  normalizeCornerRadii,
  parseComputedCornerRadii,
  parseCSSBorderRadius,
  resolveCornerRadii,
  toShaderCornerRadii,
} from './radius';
export {
  IDENTITY_MATRIX_2D,
  invertMatrix2D,
  parseCSSTransformMatrix,
  transformPoint2D,
} from './transforms';
export { generateUUID } from './uuid';
export {
  clampFiniteNumber,
  type NumberValidationOptions,
  validateFiniteNumber,
  validateNonNegativeNumber,
  validateOptionalFiniteNumber,
} from './validation';
