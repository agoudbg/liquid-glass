import { describe, expect, it } from 'vitest';

import {
  classifyBackdropLuminance,
  DEFAULT_THEME_COLOR_THRESHOLDS,
  resolveThemeColorThresholds,
  sampleBackdropThemes,
} from '../../src/engine/backdrop-theme';
import type { RendererMaterial } from '../../src/renderer';

function material(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  matrix: RendererMaterial['matrix'] = [1, 0, 0, 1, 0, 0],
): RendererMaterial {
  return {
    id,
    rect: { x, y, width, height },
    matrix,
    radii: [0, 0, 0, 0],
    opacity: 1,
    thickness: 10,
    refractIndex: 1.1,
    refractIntensity: 0.5,
    blur: 0,
    dispersion: 0.01,
  };
}

function pixels(
  width: number,
  height: number,
  draw: (
    data: Uint8ClampedArray,
    x: number,
    y: number,
  ) => void,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      draw(data, x, y);
    }
  }
  return data;
}

function setRgb(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
): void {
  const offset = (y * width + x) * 4;
  data[offset] = red;
  data[offset + 1] = green;
  data[offset + 2] = blue;
  data[offset + 3] = 255;
}

describe('backdrop theme sampling', () => {
  it('normalizes partial thresholds and rejects overlapping or invalid bands', () => {
    expect(resolveThemeColorThresholds(undefined)).toEqual(
      DEFAULT_THEME_COLOR_THRESHOLDS,
    );
    expect(resolveThemeColorThresholds({ darkMax: 96 })).toEqual({
      ultraDarkMax: 25,
      darkMax: 96,
      ultraLightMin: 230,
    });

    expect(() => resolveThemeColorThresholds({
      ultraDarkMax: Number.NaN,
    })).toThrow(
      'Invalid numeric configuration for "context.themeColorThresholds.ultraDarkMax"',
    );
    expect(() => resolveThemeColorThresholds({
      ultraDarkMax: 90,
      darkMax: 85,
    })).toThrow(
      'Invalid numeric configuration for "context.themeColorThresholds.darkMax"',
    );
    expect(() => resolveThemeColorThresholds({
      darkMax: 230,
      ultraLightMin: 230,
    })).toThrow(
      'Invalid numeric configuration for "context.themeColorThresholds.ultraLightMin"',
    );
  });

  it.each([
    [25, 'ultra_dark'],
    [25.01, 'dark'],
    [85, 'dark'],
    [85.01, 'light'],
    [229.99, 'light'],
    [230, 'ultra_light'],
  ] as const)(
    'classifies luma %s with inclusive legacy boundaries',
    (averageLuminance, expected) => {
      expect(classifyBackdropLuminance(
        averageLuminance,
        DEFAULT_THEME_COLOR_THRESHOLDS,
      )).toBe(expected);
    },
  );

  it('uses Rec.709 RGB coefficients independently for each material', () => {
    const width = 3;
    const data = pixels(width, 1, (target, x, y) => {
      if (x === 0) setRgb(target, width, x, y, 255, 0, 0);
      if (x === 1) setRgb(target, width, x, y, 0, 255, 0);
      if (x === 2) setRgb(target, width, x, y, 0, 0, 255);
    });
    const samples = sampleBackdropThemes(
      { data, width, height: 1 },
      { width, height: 1 },
      [
        material('red', 0, 0, 0, 0),
        material('green', 1, 0, 0, 0),
        material('blue', 2, 0, 0, 0),
      ],
      DEFAULT_THEME_COLOR_THRESHOLDS,
    );

    expect(samples.red).toEqual({
      averageLuminance: 0.2126 * 255,
      themeColorMode: 'dark',
    });
    expect(samples.green).toEqual({
      averageLuminance: 0.7152 * 255,
      themeColorMode: 'light',
    });
    expect(samples.blue).toEqual({
      averageLuminance: 0.0722 * 255,
      themeColorMode: 'ultra_dark',
    });
  });

  it('maps DPR-scaled inclusive regions and material scale before sampling', () => {
    const width = 8;
    const height = 6;
    const data = pixels(width, height, (target, x, y) => {
      const inIdentityRegion = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      setRgb(
        target,
        width,
        x,
        y,
        inIdentityRegion ? 255 : 0,
        inIdentityRegion ? 255 : 0,
        inIdentityRegion ? 255 : 0,
      );
    });
    const samples = sampleBackdropThemes(
      { data, width, height },
      { width: 4, height: 3 },
      [
        material('identity', 1, 1, 1, 1),
        material('scaled', 1, 1, 1, 1, [2, 0, 0, 1, 0, 0]),
      ],
      DEFAULT_THEME_COLOR_THRESHOLDS,
    );

    expect(samples.identity?.averageLuminance).toBeCloseTo(255, 10);
    expect(samples.identity?.themeColorMode).toBe('ultra_light');
    expect(samples.scaled?.averageLuminance).toBeCloseTo(153, 10);
    expect(samples.scaled?.themeColorMode).toBe('light');
  });

  it('samples a 90-degree rotation around the resolved rect center', () => {
    const width = 11;
    const height = 11;
    const data = pixels(width, height, (target, x, y) => {
      const inRotatedAabb = x >= 4 && x <= 6 && y >= 3 && y <= 7;
      const value = inRotatedAabb ? 255 : 0;
      setRgb(target, width, x, y, value, value, value);
    });
    const samples = sampleBackdropThemes(
      { data, width, height },
      { width, height },
      [
        material(
          'rotated',
          3,
          4,
          4,
          2,
          [0, 1, -1, 0, 0, 0],
        ),
      ],
      DEFAULT_THEME_COLOR_THRESHOLDS,
    );

    expect(samples.rotated?.averageLuminance).toBeCloseTo(255, 10);
    expect(samples.rotated?.themeColorMode).toBe('ultra_light');
  });

  it('samples the transformed AABB of a skewed material', () => {
    const width = 17;
    const height = 17;
    const data = pixels(width, height, (target, x, y) => {
      const inSkewedAabb = x >= 3 && x <= 13 && y >= 6 && y <= 10;
      const value = inSkewedAabb ? 255 : 0;
      setRgb(target, width, x, y, value, value, value);
    });
    const samples = sampleBackdropThemes(
      { data, width, height },
      { width, height },
      [
        material(
          'skewed',
          5,
          6,
          6,
          4,
          [1, 0, 1, 1, 0, 0],
        ),
      ],
      DEFAULT_THEME_COLOR_THRESHOLDS,
    );

    expect(samples.skewed?.averageLuminance).toBeCloseTo(255, 10);
    expect(samples.skewed?.themeColorMode).toBe('ultra_light');
  });

  it('clips partially outside regions and preserves the legacy grid stride', () => {
    const clippedWidth = 4;
    const clippedData = pixels(clippedWidth, 4, (target, x, y) => {
      const sampled = x <= 1 && y <= 1;
      const value = sampled ? 85 : 255;
      setRgb(target, clippedWidth, x, y, value, value, value);
    });
    const clipped = sampleBackdropThemes(
      { data: clippedData, width: clippedWidth, height: 4 },
      { width: 4, height: 4 },
      [material('clipped', -0.5, -0.5, 1, 1)],
      DEFAULT_THEME_COLOR_THRESHOLDS,
    );
    expect(clipped.clipped).toEqual({
      averageLuminance: 85,
      themeColorMode: 'dark',
    });

    const gridSize = 65;
    const gridData = pixels(gridSize, gridSize, (target, x, y) => {
      const sampledByStepTwo = x % 2 === 0 && y % 2 === 0;
      const value = sampledByStepTwo ? 255 : 0;
      setRgb(target, gridSize, x, y, value, value, value);
    });
    const grid = sampleBackdropThemes(
      { data: gridData, width: gridSize, height: gridSize },
      { width: gridSize, height: gridSize },
      [material('grid', 0, 0, 64, 64)],
      DEFAULT_THEME_COLOR_THRESHOLDS,
    );
    expect(grid.grid?.averageLuminance).toBeCloseTo(255, 10);
    expect(grid.grid?.themeColorMode).toBe('ultra_light');
  });
});
