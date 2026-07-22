import { describe, expect, it, vi } from 'vitest';

import { orderMaterialRegistrations } from '../../src/engine/material-order';
import type { MaterialRegistration } from '../../src/engine/registrations';
import type { GlassEngineRuntime } from '../../src/engine/runtime';

const DOCUMENT_POSITION_DISCONNECTED = 0x01;
const DOCUMENT_POSITION_PRECEDING = 0x02;
const DOCUMENT_POSITION_FOLLOWING = 0x04;

class OrderedElement {
  public constructor(
    public zIndex: string,
    public order: number,
    public documentId = 'main',
  ) {}

  public compareDocumentPosition(other: Node): number {
    const candidate = other as unknown as OrderedElement;
    if (this.documentId !== candidate.documentId) {
      return DOCUMENT_POSITION_DISCONNECTED;
    }
    if (this.order < candidate.order) return DOCUMENT_POSITION_FOLLOWING;
    if (this.order > candidate.order) return DOCUMENT_POSITION_PRECEDING;
    return 0;
  }
}

function material(
  id: string,
  element: OrderedElement,
  renderOrder?: number,
): MaterialRegistration {
  return {
    config: {
      element: element as unknown as HTMLElement,
      renderOrder,
    },
    destroyed: false,
    id,
    initialFallbackAttribute: null,
    interactionState: null,
  };
}

function runtime(): GlassEngineRuntime {
  return {
    createCanvas: () => ({} as HTMLCanvasElement),
    devicePixelRatio: () => 1,
    getComputedStyle: (element) => ({
      zIndex: (element as unknown as OrderedElement).zIndex,
    } as CSSStyleDeclaration),
  };
}

function ids(registrations: MaterialRegistration[]): string[] {
  return registrations.map(({ id }) => id);
}

describe('orderMaterialRegistrations', () => {
  it('matches legacy base-10 z-index parsing across negative, auto, invalid, and positive values', () => {
    const registrations = [
      material('positive', new OrderedElement('12px', 4)),
      material('auto', new OrderedElement('auto', 3)),
      material('negative', new OrderedElement('-8', 1)),
      material('invalid', new OrderedElement('not-a-number', 2)),
    ];

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'negative',
      'invalid',
      'auto',
      'positive',
    ]);
  });

  it('uses live DOM order for equal auto z-index values', () => {
    const firstRegistered = new OrderedElement('7', 2);
    const secondRegistered = new OrderedElement('7', 1);
    const registrations = [
      material('first-registered', firstRegistered),
      material('second-registered', secondRegistered),
    ];

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'second-registered',
      'first-registered',
    ]);

    firstRegistered.order = 0;
    secondRegistered.order = 3;

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'first-registered',
      'second-registered',
    ]);
  });

  it('renders the entire explicit group after auto materials regardless of numeric value', () => {
    const registrations = [
      material('explicit-negative', new OrderedElement('0', 1), -100),
      material('auto-high', new OrderedElement('999999', 2)),
      material('explicit-positive', new OrderedElement('0', 3), 50),
    ];

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'auto-high',
      'explicit-negative',
      'explicit-positive',
    ]);
  });

  it('preserves registration order for equal explicit values', () => {
    const registrations = [
      material('first', new OrderedElement('0', 2), 4),
      material('second', new OrderedElement('0', 1), 4),
    ];

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'first',
      'second',
    ]);
  });

  it('restores automatic ordering when an update clears renderOrder', () => {
    const explicit = material('explicit', new OrderedElement('-10', 1), -100);
    const automatic = material('automatic', new OrderedElement('5', 2));
    const registrations = [explicit, automatic];

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'automatic',
      'explicit',
    ]);

    explicit.config = { ...explicit.config, renderOrder: undefined };

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'explicit',
      'automatic',
    ]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite explicit renderOrder %s',
    (renderOrder) => {
      const registration = material(
        'invalid',
        new OrderedElement('0', 1),
        renderOrder,
      );

      expect(() => orderMaterialRegistrations([registration], runtime()))
        .toThrowError(/material\.renderOrder/);
    },
  );

  it('falls back to stable registration order for disconnected elements', () => {
    const registrations = [
      material('first', new OrderedElement('0', 2, 'first-document')),
      material('second', new OrderedElement('0', 1, 'second-document')),
    ];

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'first',
      'second',
    ]);
  });

  it('falls back to stable registration order when DOM comparison is unavailable', () => {
    const first = new OrderedElement('0', 2);
    const second = new OrderedElement('0', 1);
    Object.defineProperty(first, 'compareDocumentPosition', { value: undefined });
    const registrations = [
      material('first', first),
      material('second', second),
    ];

    expect(ids(orderMaterialRegistrations(registrations, runtime()))).toEqual([
      'first',
      'second',
    ]);
  });

  it('reads each automatic z-index once before sorting', () => {
    const registrations = [
      material('third', new OrderedElement('3', 3)),
      material('first', new OrderedElement('1', 1)),
      material('explicit', new OrderedElement('100', 4), 0),
      material('second', new OrderedElement('2', 2)),
    ];
    const getComputedStyle = vi.fn(runtime().getComputedStyle);
    const testRuntime = { ...runtime(), getComputedStyle };

    expect(ids(orderMaterialRegistrations(registrations, testRuntime))).toEqual([
      'first',
      'second',
      'third',
      'explicit',
    ]);
    expect(getComputedStyle).toHaveBeenCalledTimes(3);
  });
});
