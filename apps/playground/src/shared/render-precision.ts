/** Default backing-canvas scale used by every playground scene. */
export const DEFAULT_RENDER_PRECISION = 1;

/** Lowest backing-canvas scale exposed by the global control. */
export const MINIMUM_RENDER_PRECISION = 0.5;

/** Highest backing-canvas scale exposed by the global control. */
export const MAXIMUM_RENDER_PRECISION = 2.5;

/** Increment used by the global backing-canvas scale control. */
export const RENDER_PRECISION_STEP = 0.05;

/** Clamp an arbitrary numeric precision to the supported playground range. */
export function normalizeRenderPrecision(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RENDER_PRECISION;
  return Math.min(
    MAXIMUM_RENDER_PRECISION,
    Math.max(MINIMUM_RENDER_PRECISION, value),
  );
}

/** Parse a URL precision value without allowing non-finite renderer options. */
export function parseRenderPrecision(value: string | null): number {
  if (value === null || value.trim() === '') return DEFAULT_RENDER_PRECISION;
  return normalizeRenderPrecision(Number(value));
}
