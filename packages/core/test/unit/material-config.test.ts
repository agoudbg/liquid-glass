import { describe, expect, it } from 'vitest';

import {
  cloneMaterialConfig,
  prepareMaterialUpdate,
  snapshotMaterialConfig,
} from '../../src/engine/material-config';
import { GlassError } from '../../src/errors/GlassError';
import type { MaterialConfig } from '../../src/types';

function element(): HTMLElement {
  return {
    getAttribute: () => null,
    getBoundingClientRect: () => ({} as DOMRect),
    removeAttribute: () => undefined,
    setAttribute: () => undefined,
  } as unknown as HTMLElement;
}

function config(overrides: Partial<MaterialConfig> = {}): MaterialConfig {
  return { element: element(), ...overrides };
}

describe('material config boundary', () => {
  it('canonicalizes outer undefined fields and deeply owns interaction input', () => {
    const spring = { stiffness: 180, damping: 18, mass: 1 };
    const input = config({
      blur: undefined,
      interactionConfig: {
        activeBackgroundColor: 'transparent',
        activeSpring: spring,
      },
      radius: 12,
    });
    const snapshot = snapshotMaterialConfig(input);

    expect(Object.prototype.hasOwnProperty.call(snapshot, 'blur')).toBe(false);
    expect(snapshot.element).toBe(input.element);
    spring.stiffness = 1;
    if (input.interactionConfig) {
      input.interactionConfig.activeBackgroundColor = 'red';
    }
    expect(snapshot.interactionConfig).toEqual({
      activeSpring: { stiffness: 180, damping: 18, mass: 1 },
      activeBackgroundColor: 'transparent',
    });
    const clone = cloneMaterialConfig(snapshot);
    expect(clone).toEqual(snapshot);
    expect(clone).not.toBe(snapshot);
    expect(clone.interactionConfig).not.toBe(snapshot.interactionConfig);
    expect(clone.interactionConfig?.activeSpring)
      .not.toBe(snapshot.interactionConfig?.activeSpring);
  });

  it.each([
    ['radius', -1],
    ['radiusTR', Number.NaN],
    ['radiusBR', Number.POSITIVE_INFINITY],
    ['radiusBL', -1],
    ['radiusTL', -1],
    ['thickness', -1],
    ['refractIndex', 0],
    ['refractIndex', Number.MIN_VALUE],
    ['refractIndex', Number.EPSILON / 2],
    ['refractIntensity', -1],
    ['blur', -1],
    ['dispersion', -1],
    ['renderOrder', Number.NEGATIVE_INFINITY],
  ])('rejects invalid top-level numeric %s=%s', (field, value) => {
    expect(() => snapshotMaterialConfig(config({ [field]: value })))
      .toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
  });

  it('accepts zero optical boundaries, positive IOR, and signed render order', () => {
    expect(snapshotMaterialConfig(config({
      blur: 0,
      dispersion: 0,
      isMoveable: true,
      radius: 0,
      refractIndex: Number.EPSILON,
      refractIntensity: 0,
      renderOrder: -2,
      thickness: 0,
    }))).toMatchObject({
      blur: 0,
      isMoveable: true,
      refractIndex: Number.EPSILON,
      renderOrder: -2,
    });
  });

  it('accepts presentation modes and rejects invalid enums or unknown fields', () => {
    expect(() => snapshotMaterialConfig(config({
      disableInteractions: 1 as unknown as boolean,
    }))).toThrow(GlassError);
    expect(() => snapshotMaterialConfig(config({
      isMoveable: 1 as unknown as boolean,
    }))).toThrow(GlassError);
    expect(() => snapshotMaterialConfig(config({
      onlyClickInteractions: 'yes' as unknown as boolean,
    }))).toThrow(GlassError);
    expect(() => snapshotMaterialConfig(config({
      interactionPreset: 'unknown' as 'button',
    }))).toThrow(GlassError);
    expect(snapshotMaterialConfig(config({ renderMode: 'dedicated' })))
      .toMatchObject({ renderMode: 'dedicated' });
    expect(() => snapshotMaterialConfig(config({
      renderMode: 'other' as MaterialConfig['renderMode'],
    }))).toThrow(GlassError);
    expect(() => snapshotMaterialConfig(config({
      proxyTarget: {} as MaterialConfig['proxyTarget'],
    }))).toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(() => snapshotMaterialConfig({
      ...config(),
      typo: true,
    } as unknown as MaterialConfig)).toThrow(GlassError);
  });

  it('rejects invalid elements and runtime element replacement', () => {
    expect(() => snapshotMaterialConfig({} as MaterialConfig)).toThrow(GlassError);
    expect(() => snapshotMaterialConfig({ element: {} } as MaterialConfig))
      .toThrow(GlassError);
    expect(() => prepareMaterialUpdate(
      snapshotMaterialConfig(config()),
      { element: element() } as unknown as Parameters<typeof prepareMaterialUpdate>[1],
    )).toThrow(GlassError);
  });

  it('detects empty, scalar-equal, deep-equal, and absent clear no-ops', () => {
    const current = snapshotMaterialConfig(config({
      interactionConfig: {
        activeSpring: { stiffness: 180, damping: 18, mass: 1 },
      },
      radius: 12,
    }));
    expect(prepareMaterialUpdate(current, {})).toBeNull();
    expect(prepareMaterialUpdate(current, { radius: 12 })).toBeNull();
    expect(prepareMaterialUpdate(current, {
      interactionConfig: {
        activeSpring: { mass: 1, stiffness: 180, damping: 18 },
      },
    })).toBeNull();
    expect(prepareMaterialUpdate(
      snapshotMaterialConfig(config()),
      { radius: undefined },
    )).toBeNull();
  });

  it('retains owned undefined in events while clearing canonical overrides', () => {
    const current = snapshotMaterialConfig(config({
      interactionConfig: { maxTranslateY: 40 },
      radius: 12,
    }));
    const prepared = prepareMaterialUpdate(current, {
      interactionConfig: undefined,
      radius: undefined,
    });
    if (!prepared) throw new Error('Expected a material update.');

    expect(Object.prototype.hasOwnProperty.call(prepared.changes, 'radius')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(
      prepared.changes,
      'interactionConfig',
    )).toBe(true);
    expect(prepared.changes.radius).toBeUndefined();
    expect(prepared.changes.interactionConfig).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(prepared.next, 'radius')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(
      prepared.next,
      'interactionConfig',
    )).toBe(false);
  });

  it('keeps event changes, next state, and consumer changes mutually detached', () => {
    const current = snapshotMaterialConfig(config());
    const spring = { stiffness: 200, damping: 20, mass: 1 };
    const changes = {
      interactionConfig: { activeSpring: spring },
    };
    const prepared = prepareMaterialUpdate(current, changes);
    if (!prepared) throw new Error('Expected a material update.');

    spring.stiffness = 1;
    const eventSpring = prepared.changes.interactionConfig?.activeSpring;
    if (eventSpring) eventSpring.stiffness = 2;
    expect(prepared.next.interactionConfig?.activeSpring?.stiffness).toBe(200);
    expect(changes.interactionConfig.activeSpring.stiffness).toBe(1);
  });

  it('preserves optional owned undefined but ignores required undefined overrides', () => {
    const current = snapshotMaterialConfig(config());
    const prepared = prepareMaterialUpdate(current, {
      interactionConfig: {
        baseScale: undefined,
        maxTranslateY: undefined,
      },
    });
    if (!prepared) throw new Error('Expected a material update.');

    expect(Object.prototype.hasOwnProperty.call(
      prepared.next.interactionConfig,
      'baseScale',
    )).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(
      prepared.next.interactionConfig,
      'maxTranslateY',
    )).toBe(true);
  });
});
