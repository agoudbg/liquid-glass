import { describe, expect, it } from 'vitest';

import {
  materialInteractionConfigsEqual,
  snapshotMaterialInteractionConfig,
} from '../../src/engine/material-interaction-config';
import { GlassError } from '../../src/errors/GlassError';

const BOOLEAN_FIELDS = [
  'enableHoverFollow',
  'preserveArea',
  'velocityStretch',
  'ignorePointerPosition',
  'enableOriginShift',
  'enableIdleReturn',
  'idleReturnPartial',
  'keepScaleOnIdleReturn',
  'useAbsoluteValues',
  'showHighlight',
  'enableOpacityTransition',
  'enableBackgroundTransition',
] as const;

describe('material interaction config boundary', () => {
  it('canonicalizes fields in stable order and isolates nested springs', () => {
    const spring = { stiffness: 180, damping: 18, mass: 1 };
    const input = {
      activeBackgroundColor: 'transparent',
      activeSpring: spring,
      baseScale: undefined,
      maxTranslateY: undefined,
      preset: 'button',
      showHighlight: true,
    };

    const snapshot = snapshotMaterialInteractionConfig(input);
    expect(Object.keys(snapshot)).toEqual([
      'preset',
      'maxTranslateY',
      'activeSpring',
      'showHighlight',
      'activeBackgroundColor',
    ]);
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'baseScale')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'maxTranslateY')).toBe(true);
    expect(snapshot.maxTranslateY).toBeUndefined();
    spring.stiffness = 1;
    input.activeBackgroundColor = 'red';
    expect(snapshot.activeSpring).toEqual({
      stiffness: 180,
      damping: 18,
      mass: 1,
    });
    expect(snapshot.activeBackgroundColor).toBe('transparent');
  });

  it.each([
    ['baseScale', 0],
    ['hoverScale', -1],
    ['activeScale', Number.NaN],
    ['maxScale', 0.49],
    ['hoverFollowFactor', Number.POSITIVE_INFINITY],
    ['hoverFollowMaxDistance', -1],
    ['translateFactor', Number.NEGATIVE_INFINITY],
    ['maxTranslate', -1],
    ['maxTranslateY', -1],
    ['stretchFactor', -0.1],
    ['stretchLimit', -0.1],
    ['velocityStretchFactor', -0.1],
    ['originShiftSensitivity', 1.1],
    ['idleReturnDelay', -1],
    ['idleReturnRatio', -0.1],
    ['highlightSize', -1],
    ['highlightOpacity', 1.1],
    ['highlightHDRFactor', -1],
    ['highlightFollowSpeed', -0.1],
    ['activeOpacity', 1.1],
    ['restThreshold', 0],
    ['velocityThreshold', 0],
  ])('rejects invalid numeric %s=%s', (field, value) => {
    expect(() => snapshotMaterialInteractionConfig({ [field]: value }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
  });

  it('accepts inclusive boundaries and signed translation factors', () => {
    expect(snapshotMaterialInteractionConfig({
      activeOpacity: 0,
      highlightFollowSpeed: 1,
      highlightOpacity: 0,
      hoverFollowFactor: -0.5,
      idleReturnRatio: 1,
      maxScale: 0.5,
      originShiftSensitivity: 0,
      translateFactor: -0.25,
    })).toMatchObject({
      activeOpacity: 0,
      highlightFollowSpeed: 1,
      hoverFollowFactor: -0.5,
      maxScale: 0.5,
      translateFactor: -0.25,
    });
  });

  it.each(BOOLEAN_FIELDS)('requires exact boolean field %s', (field) => {
    expect(() => snapshotMaterialInteractionConfig({ [field]: 1 }))
      .toThrow(GlassError);
    expect(snapshotMaterialInteractionConfig({ [field]: false }))
      .toEqual({ [field]: false });
  });

  it('validates preset, active background, and plain known fields', () => {
    expect(() => snapshotMaterialInteractionConfig({ preset: 'unknown' }))
      .toThrow(GlassError);
    expect(() => snapshotMaterialInteractionConfig({ activeBackgroundColor: 3 }))
      .toThrow(GlassError);
    expect(() => snapshotMaterialInteractionConfig({ typo: true }))
      .toThrow(GlassError);
    expect(() => snapshotMaterialInteractionConfig(null)).toThrow(GlassError);
    expect(() => snapshotMaterialInteractionConfig([])).toThrow(GlassError);
    expect(() => snapshotMaterialInteractionConfig(new Date())).toThrow(GlassError);
  });

  it('requires complete, finite, physically safe springs', () => {
    expect(() => snapshotMaterialInteractionConfig({
      activeSpring: { stiffness: 180, damping: 18 },
    })).toThrow(GlassError);
    expect(() => snapshotMaterialInteractionConfig({
      activeSpring: { stiffness: 180, damping: 18, mass: 0 },
    })).toThrow(GlassError);
    expect(() => snapshotMaterialInteractionConfig({
      activeSpring: { stiffness: -1, damping: 18, mass: 1 },
    })).toThrow(GlassError);
    expect(() => snapshotMaterialInteractionConfig({
      activeSpring: { stiffness: 180, damping: 18, mass: 1, extra: 1 },
    })).toThrow(GlassError);
    expect(snapshotMaterialInteractionConfig({
      activeSpring: { stiffness: 0, damping: 0, mass: 0.1 },
    }).activeSpring).toEqual({ stiffness: 0, damping: 0, mass: 0.1 });
  });

  it('compares owned undefined fields and nested spring values', () => {
    const absent = snapshotMaterialInteractionConfig({});
    const cleared = snapshotMaterialInteractionConfig({ maxTranslateY: undefined });
    const first = snapshotMaterialInteractionConfig({
      activeSpring: { stiffness: 180, damping: 18, mass: 1 },
    });
    const equal = snapshotMaterialInteractionConfig({
      activeSpring: { mass: 1, damping: 18, stiffness: 180 },
    });
    const changed = snapshotMaterialInteractionConfig({
      activeSpring: { stiffness: 181, damping: 18, mass: 1 },
    });

    expect(materialInteractionConfigsEqual(absent, cleared)).toBe(false);
    expect(materialInteractionConfigsEqual(first, equal)).toBe(true);
    expect(materialInteractionConfigsEqual(first, changed)).toBe(false);
  });
});
