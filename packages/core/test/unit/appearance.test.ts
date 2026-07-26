import { describe, expect, it } from 'vitest';

import {
  type MaterialAppearanceInput,
  resolveMaterialAppearance,
} from '../../src/index';

const THEME_EXPECTATIONS = [
  ['ultra_dark', '#00000022', '#ffffff', '#00000033'],
  ['dark', '#00000066', '#ffffff', '#00000033'],
  ['light', '#ffffff99', '#000000', '#ffffff33'],
  ['ultra_light', '#ffffff33', '#000000', '#ffffff33'],
] as const;

describe('material appearance resolver', () => {
  it.each(THEME_EXPECTATIONS)(
    'maps %s to the legacy tint, foreground, and repaired inset hue',
    (themeColorMode, backgroundTint, foregroundColor, insetShadowColor) => {
      const tokens = resolveMaterialAppearance({ themeColorMode });

      expect(tokens).toMatchObject({
        '--lg-background-tint': backgroundTint,
        '--lg-effective-background-tint': backgroundTint,
        '--lg-foreground-color': foregroundColor,
        '--lg-inset-shadow-color': insetShadowColor,
        '--lg-inset-shadow-size': '10px',
        '--lg-outer-shadow-color': '#00000033',
        '--lg-outer-shadow-size': '10px',
      });
    },
  );

  it('defaults to the light theme and clamps the inset blur to five pixels', () => {
    expect(resolveMaterialAppearance({ thickness: 2 })).toMatchObject({
      '--lg-background-tint': '#ffffff99',
      '--lg-foreground-color': '#000000',
      '--lg-inset-shadow-color': '#ffffff33',
      '--lg-inset-shadow-size': '5px',
    });
  });

  it('keeps explicit colors authoritative and repairs hex alpha to 0x33', () => {
    expect(resolveMaterialAppearance({
      backgroundColor: '#F00A',
      themeColorMode: 'dark',
      useCustomColor: false,
    })).toMatchObject({
      '--lg-background-tint': '#F00A',
      '--lg-effective-background-tint': '#F00A',
      '--lg-foreground-color': 'initial',
      '--lg-inset-shadow-color': '#ff000033',
    });

    expect(resolveMaterialAppearance({
      backgroundColor: 'oklch(70% 0.2 25)',
    })['--lg-inset-shadow-color']).toBe(
      'rgb(from oklch(70% 0.2 25) r g b / 20%)',
    );
  });

  it('uses the legacy initial presentation for a custom mode without a color', () => {
    expect(resolveMaterialAppearance({ useCustomColor: true })).toMatchObject({
      '--lg-background-tint': 'initial',
      '--lg-effective-background-tint': 'initial',
      '--lg-foreground-color': 'initial',
      '--lg-inset-shadow-color': 'transparent',
    });
  });

  it('resolves transform, active background, and visible HDR highlight tokens', () => {
    const input: MaterialAppearanceInput = {
      interactionConfig: {
        showHighlight: true,
        highlightSize: 180,
        highlightOpacity: 0.4,
        highlightHDRFactor: 1.1,
      },
      interactionOutput: {
        scaleX: 1.1,
        scaleY: 0.9,
        translateX: 12,
        translateY: -8,
        originX: 42,
        originY: 61,
        opacity: 0.75,
        backgroundColor: 'transparent',
        highlightX: 0.25,
        highlightY: 0.8,
        highlightVisible: true,
      },
    };

    expect(resolveMaterialAppearance(input)).toMatchObject({
      '--lg-effective-background-tint': 'transparent',
      '--lg-scale-x': '1.1',
      '--lg-scale-y': '0.9',
      '--lg-translate-x': '12px',
      '--lg-translate-y': '-8px',
      '--lg-origin-x': '42%',
      '--lg-origin-y': '61%',
      '--lg-material-opacity': '0.75',
      '--lg-highlight-size': '180px',
      '--lg-highlight-opacity': '0.4',
      '--lg-highlight-left': '25%',
      '--lg-highlight-top': '80%',
      '--lg-highlight-scale': '1',
      '--lg-highlight-filter': 'brightness(1.1) saturate(1.1)',
      '--lg-highlight-gradient': `radial-gradient(circle at 50% 50%,
      rgba(255, 255, 255, 0.44000000000000006) 0%,
      rgba(255, 255, 255, 0.41800000000000004) 15%,
      rgba(255, 255, 255, 0.013200000000000002) 65%,
      rgba(255, 255, 255, 0) 100%)`,
    });
  });

  it('suppresses the highlight in fallback mode without changing its position', () => {
    const tokens = resolveMaterialAppearance({
      fallbackMode: true,
      interactionOutput: {
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
        originX: 50,
        originY: 50,
        opacity: 1,
        backgroundColor: null,
        highlightX: 0.3,
        highlightY: 0.7,
        highlightVisible: true,
      },
    });

    expect(tokens).toMatchObject({
      '--lg-highlight-opacity': '0',
      '--lg-highlight-left': '30%',
      '--lg-highlight-top': '70%',
      '--lg-highlight-scale': '5',
    });
  });

  it('builds the legacy illumination stops from validated angle and intensity', () => {
    expect(resolveMaterialAppearance({
      illuminationAngle: 45,
      illuminationIntensity: 0.5,
    })).toMatchObject({
      '--lg-illumination-angle': '45deg',
      '--lg-illumination-intensity': '0.5',
      '--lg-illumination-gradient': 'conic-gradient('
        + 'rgba(255, 255, 255, 0.29375) 0deg, '
        + 'rgba(255, 255, 255, 0.5) 45deg, '
        + 'rgba(255, 255, 255, 0.5) 45deg, '
        + 'rgba(255, 255, 255, 0.225) 105deg, '
        + 'rgba(255, 255, 255, 0.1) 135deg, '
        + 'rgba(255, 255, 255, 0.225) 165deg, '
        + 'rgba(255, 255, 255, 0.5) 225deg, '
        + 'rgba(255, 255, 255, 0.225) 285deg, '
        + 'rgba(255, 255, 255, 0.1) 315deg, '
        + 'rgba(255, 255, 255, 0.225) 345deg, '
        + 'rgba(255, 255, 255, 0.29375) 360deg)',
    });
  });

  it('rejects non-finite and out-of-range appearance inputs', () => {
    expect(() => resolveMaterialAppearance({ thickness: Number.NaN })).toThrow(
      'Invalid numeric configuration for "materialAppearance.thickness"',
    );
    expect(() => resolveMaterialAppearance({ illuminationIntensity: 1.1 })).toThrow(
      'Invalid numeric configuration for "materialAppearance.illuminationIntensity"',
    );
    expect(() => resolveMaterialAppearance({
      interactionConfig: { highlightOpacity: -0.1 },
    })).toThrow(
      'Invalid numeric configuration for "materialAppearance.highlightOpacity"',
    );
  });
});
