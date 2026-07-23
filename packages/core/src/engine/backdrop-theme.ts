import { GlassError } from '../errors/GlassError';
import type { RendererMaterial } from '../renderer';
import type {
  AutomaticBackgroundColorMode,
  ThemeColorThresholds,
} from '../types/context';
import { validateFiniteNumber } from '../utils/validation';

/** Fully resolved luma thresholds used by backdrop theme sampling. */
export interface ResolvedThemeColorThresholds {
  /** Highest luma classified as ultra dark. */
  readonly ultraDarkMax: number;
  /** Highest luma classified as dark. */
  readonly darkMax: number;
  /** Lowest luma classified as ultra light. */
  readonly ultraLightMin: number;
}

/** Immutable CPU-readable snapshot of one composite backdrop bitmap. */
export interface BackdropPixelData {
  /** Interleaved RGBA channels in top-left canvas order. */
  readonly data: Uint8ClampedArray;
  /** Physical bitmap width. */
  readonly width: number;
  /** Physical bitmap height. */
  readonly height: number;
}

/** Logical dimensions represented by a composite backdrop bitmap. */
export interface BackdropLogicalSize {
  /** Width in CSS pixels. */
  readonly width: number;
  /** Height in CSS pixels. */
  readonly height: number;
}

/** One material's backdrop-derived presentation result. */
export interface BackdropThemeSample {
  /** Rec.709 mean luma in the inclusive 0-255 range. */
  readonly averageLuminance: number;
  /** Theme mode selected by the configured thresholds. */
  readonly themeColorMode: AutomaticBackgroundColorMode;
}

/** Legacy defaults for automatic backdrop theme classification. */
export const DEFAULT_THEME_COLOR_THRESHOLDS: Readonly<
  ResolvedThemeColorThresholds
> = Object.freeze({
  ultraDarkMax: 25,
  darkMax: 85,
  ultraLightMin: 230,
});

/**
 * Merge and validate partial automatic-theme thresholds.
 *
 * @param thresholds - Optional public overrides.
 * @returns A complete threshold snapshot with non-overlapping dark/light bands.
 * @throws GlassError when a threshold is non-finite, outside 0-255, or unordered.
 */
export function resolveThemeColorThresholds(
  thresholds: ThemeColorThresholds | undefined,
): ResolvedThemeColorThresholds {
  const ultraDarkMax = validateFiniteNumber(
    thresholds?.ultraDarkMax ?? DEFAULT_THEME_COLOR_THRESHOLDS.ultraDarkMax,
    'context.themeColorThresholds.ultraDarkMax',
    { minimum: 0, maximum: 255 },
  );
  const darkMax = validateFiniteNumber(
    thresholds?.darkMax ?? DEFAULT_THEME_COLOR_THRESHOLDS.darkMax,
    'context.themeColorThresholds.darkMax',
    { minimum: ultraDarkMax, maximum: 255 },
  );
  const ultraLightMin = validateFiniteNumber(
    thresholds?.ultraLightMin ?? DEFAULT_THEME_COLOR_THRESHOLDS.ultraLightMin,
    'context.themeColorThresholds.ultraLightMin',
    {
      minimum: darkMax,
      maximum: 255,
      exclusiveMinimum: true,
    },
  );

  return { ultraDarkMax, darkMax, ultraLightMin };
}

/**
 * Classify one Rec.709 luma value with the legacy inclusive boundaries.
 *
 * @param averageLuminance - Mean RGB luma in the inclusive 0-255 range.
 * @param thresholds - Complete validated threshold snapshot.
 * @returns The framework-facing automatic background mode.
 */
export function classifyBackdropLuminance(
  averageLuminance: number,
  thresholds: ResolvedThemeColorThresholds,
): AutomaticBackgroundColorMode {
  if (averageLuminance <= thresholds.ultraDarkMax) return 'ultra_dark';
  if (averageLuminance <= thresholds.darkMax) return 'dark';
  if (averageLuminance >= thresholds.ultraLightMin) return 'ultra_light';
  return 'light';
}

/**
 * Read one reusable CPU-side snapshot from the composed backdrop canvas.
 *
 * @param canvas - Core-owned composite canvas after all sources are drawn.
 * @returns Pixel channels and physical dimensions for later material sampling.
 * @throws GlassError when the 2D context or pixel snapshot is unavailable.
 */
export function captureBackdropPixels(
  canvas: HTMLCanvasElement,
): BackdropPixelData {
  const { width, height } = canvas;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new GlassError(
      'CAPTURE_FAILED',
      'Failed to acquire the backdrop composite 2D context for theme sampling.',
      { phase: 'capture' },
    );
  }

  try {
    const imageData = context.getImageData(0, 0, width, height);
    return {
      data: imageData.data,
      width,
      height,
    };
  } catch (error) {
    throw GlassError.fromUnknown(
      error,
      'CAPTURE_FAILED',
      'Failed to read backdrop pixels for automatic theme sampling.',
      { phase: 'capture' },
    );
  }
}

/**
 * Sample every material from its own region of the cached composite backdrop.
 *
 * The region and grid stride intentionally preserve the reference
 * implementation's floor/ceil bounds, inclusive trailing pixel, and
 * approximately 32 samples across the shortest axis.
 *
 * @param pixels - Cached physical backdrop bitmap.
 * @param logicalSize - CSS-pixel dimensions represented by the bitmap.
 * @param materials - Current measured renderer materials.
 * @param thresholds - Complete validated classification thresholds.
 * @returns Samples keyed by stable material identifier.
 */
export function sampleBackdropThemes(
  pixels: BackdropPixelData,
  logicalSize: BackdropLogicalSize,
  materials: readonly RendererMaterial[],
  thresholds: ResolvedThemeColorThresholds,
): Readonly<Record<string, BackdropThemeSample>> {
  if (
    pixels.width <= 0
    || pixels.height <= 0
    || logicalSize.width <= 0
    || logicalSize.height <= 0
  ) {
    return {};
  }
  if (pixels.data.length !== pixels.width * pixels.height * 4) {
    throw new GlassError(
      'CAPTURE_FAILED',
      'Backdrop theme pixel data does not match its declared dimensions.',
      {
        phase: 'capture',
        details: {
          actualChannels: pixels.data.length,
          expectedChannels: pixels.width * pixels.height * 4,
        },
      },
    );
  }

  const pxPerCssX = pixels.width / logicalSize.width;
  const pxPerCssY = pixels.height / logicalSize.height;
  const samples: Record<string, BackdropThemeSample> = {};

  for (const material of materials) {
    const [a, b, c, d] = material.matrix;
    const centerX = (material.rect.x + material.rect.width / 2) * pxPerCssX;
    const centerY = (material.rect.y + material.rect.height / 2) * pxPerCssY;
    // The resolver stores the transformed bounding-box center in `rect`, while
    // its width and height remain the material's untransformed logical size.
    const halfWidth = (
      Math.abs(a) * material.rect.width / 2
      + Math.abs(c) * material.rect.height / 2
    ) * pxPerCssX;
    const halfHeight = (
      Math.abs(b) * material.rect.width / 2
      + Math.abs(d) * material.rect.height / 2
    ) * pxPerCssY;
    const startX = clampPixel(
      Math.floor(centerX - halfWidth),
      pixels.width,
    );
    const endX = clampPixel(
      Math.ceil(centerX + halfWidth),
      pixels.width,
    );
    const startY = clampPixel(
      Math.floor(centerY - halfHeight),
      pixels.height,
    );
    const endY = clampPixel(
      Math.ceil(centerY + halfHeight),
      pixels.height,
    );
    const spanX = endX - startX + 1;
    const spanY = endY - startY + 1;
    const step = Math.max(1, Math.floor(Math.min(spanX, spanY) / 32));
    let luminanceSum = 0;
    let sampleCount = 0;

    for (let y = startY; y <= endY; y += step) {
      for (let x = startX; x <= endX; x += step) {
        const offset = (y * pixels.width + x) * 4;
        luminanceSum += (
          0.2126 * pixels.data[offset]
          + 0.7152 * pixels.data[offset + 1]
          + 0.0722 * pixels.data[offset + 2]
        );
        sampleCount += 1;
      }
    }

    const averageLuminance = sampleCount === 0
      ? 0
      : luminanceSum / sampleCount;
    samples[material.id] = {
      averageLuminance,
      themeColorMode: sampleCount === 0
        ? 'dark'
        : classifyBackdropLuminance(averageLuminance, thresholds),
    };
  }

  return samples;
}

function clampPixel(value: number, dimension: number): number {
  return Math.min(dimension - 1, Math.max(0, value));
}
