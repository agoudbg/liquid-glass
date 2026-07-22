/**
 * Portable visual options shared by framework material adapters.
 *
 * Core rendering remains responsible for optics. Adapters map these values to
 * the shared CSS appearance contract without coupling core to a framework.
 */
export interface MaterialAppearanceOptions {
  /** Use an explicit tint instead of backdrop-derived theme colors. */
  useCustomColor?: boolean;
  /** Explicit CSS color used for the material tint. */
  backgroundColor?: string;
  /** Direction of the rim illumination in degrees. */
  illuminationAngle?: number;
  /** Rim illumination strength in the inclusive 0-1 range. */
  illuminationIntensity?: number;
}
