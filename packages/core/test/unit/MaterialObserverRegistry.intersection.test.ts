import { describe, expect, it, vi } from 'vitest';

import { MaterialObserverRegistry } from '../../src/engine/MaterialObserverRegistry';
import type { MaterialRegistration } from '../../src/engine/registrations';
import type { GlassEngineRuntime } from '../../src/engine/runtime';

interface IntersectionObserverRecord {
  callback: IntersectionObserverCallback;
  disconnected: boolean;
  observed: Element[];
  observer: IntersectionObserver;
  options: IntersectionObserverInit;
  unobserved: Element[];
}

function element(): HTMLElement {
  return {} as HTMLElement;
}

function registration(id: string, target: HTMLElement): MaterialRegistration {
  return {
    id,
    config: { element: target },
    destroyed: false,
    initialFallbackAttribute: null,
    interactionState: null,
  };
}

function entry(target: HTMLElement, isIntersecting: boolean): IntersectionObserverEntry {
  const bounds = {} as DOMRectReadOnly;
  return {
    boundingClientRect: bounds,
    intersectionRect: bounds,
    intersectionRatio: isIntersecting ? 1 : 0,
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  };
}

function runtime(
  overrides: Partial<GlassEngineRuntime> = {},
): GlassEngineRuntime {
  return {
    createCanvas: () => {
      throw new Error('Canvas creation is not used by material observer tests.');
    },
    createMutationObserver: () => null,
    createResizeObserver: () => null,
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({}) as CSSStyleDeclaration,
    ...overrides,
  };
}

function createIntersectionRecord(
  callback: IntersectionObserverCallback,
  options: IntersectionObserverInit,
): IntersectionObserverRecord {
  const record = {
    callback,
    disconnected: false,
    observed: [],
    options,
    unobserved: [],
  } as unknown as IntersectionObserverRecord;
  record.observer = {
    disconnect: () => {
      record.disconnected = true;
    },
    observe: (target: Element) => record.observed.push(target),
    root: null,
    rootMargin: options.rootMargin ?? '0px',
    takeRecords: () => [],
    thresholds: [0],
    unobserve: (target: Element) => record.unobserved.push(target),
  } as IntersectionObserver;
  return record;
}

describe('MaterialObserverRegistry intersection observation', () => {
  it('shares exact options, reference-counts elements, and rejects late callbacks', () => {
    const records: IntersectionObserverRecord[] = [];
    const container = element();
    const firstElement = element();
    const secondElement = element();
    const viewportChanges = vi.fn();
    const registry = new MaterialObserverRegistry(
      container,
      runtime({
        createIntersectionObserver: (callback, options) => {
          const record = createIntersectionRecord(callback, options);
          records.push(record);
          return record.observer;
        },
      }),
      vi.fn(),
      viewportChanges,
    );
    const first = registration('first', firstElement);
    const duplicate = registration('duplicate', firstElement);
    const second = registration('second', secondElement);

    registry.track(first);
    registry.track(duplicate);
    registry.track(second);

    expect(records).toHaveLength(1);
    expect(records[0]?.options).toEqual({
      root: null,
      rootMargin: '50px',
      threshold: 0,
    });
    expect(records[0]?.observed).toEqual([firstElement, secondElement]);
    records[0]?.callback(
      [entry(firstElement, false)],
      records[0].observer,
    );
    expect(viewportChanges.mock.calls).toEqual([
      [first, false],
      [duplicate, false],
    ]);

    registry.untrack(first);
    records[0]?.callback(
      [entry(firstElement, true)],
      records[0].observer,
    );
    expect(viewportChanges).toHaveBeenLastCalledWith(duplicate, true);
    registry.untrack(duplicate);
    expect(records[0]?.unobserved).toEqual([firstElement]);
    records[0]?.callback(
      [entry(firstElement, false)],
      records[0].observer,
    );
    expect(viewportChanges).toHaveBeenCalledTimes(3);

    registry.untrack(second);
    expect(records[0]?.disconnected).toBe(true);
    const third = registration('third', element());
    registry.track(third);
    expect(records).toHaveLength(2);
    records[0]?.callback(
      [entry(secondElement, false)],
      records[0].observer,
    );
    expect(viewportChanges).toHaveBeenCalledTimes(3);
    records[1]?.callback(
      [entry(third.config.element, false)],
      records[1].observer,
    );
    expect(viewportChanges).toHaveBeenLastCalledWith(third, false);

    registry.destroy();
    expect(records[1]?.disconnected).toBe(true);
    records[1]?.callback(
      [entry(third.config.element, true)],
      records[1].observer,
    );
    expect(viewportChanges).toHaveBeenCalledTimes(4);
  });

  it('fails open when the intersection factory is unavailable', () => {
    const createIntersectionObserver = vi.fn(() => null);
    const registry = new MaterialObserverRegistry(
      element(),
      runtime({ createIntersectionObserver }),
      vi.fn(),
      vi.fn(),
    );

    registry.track(registration('first', element()));
    registry.track(registration('second', element()));

    expect(createIntersectionObserver).toHaveBeenCalledOnce();
    expect(() => registry.destroy()).not.toThrow();
  });

  it('rolls all first-registration observers back without masking IO failures', () => {
    const mutationDisconnects: ReturnType<typeof vi.fn>[] = [];
    const resizeDisconnects: ReturnType<typeof vi.fn>[] = [];
    const intersectionDisconnects: ReturnType<typeof vi.fn>[] = [];
    let attempt = 0;
    const registry = new MaterialObserverRegistry(
      element(),
      runtime({
        createIntersectionObserver: (callback, options) => {
          attempt += 1;
          if (attempt === 1) throw new Error('intersection factory failed');
          const record = createIntersectionRecord(callback, options);
          const disconnect = vi.fn(() => {
            record.disconnected = true;
            if (attempt === 2) throw new Error('intersection disconnect failed');
          });
          intersectionDisconnects.push(disconnect);
          record.observer.disconnect = disconnect;
          if (attempt === 2) {
            record.observer.observe = () => {
              throw new Error('intersection observe failed');
            };
          }
          return record.observer;
        },
        createMutationObserver: () => {
          const disconnect = vi.fn();
          mutationDisconnects.push(disconnect);
          return {
            disconnect,
            observe: vi.fn(),
            takeRecords: () => [],
          } as MutationObserver;
        },
        createResizeObserver: () => {
          const disconnect = vi.fn();
          resizeDisconnects.push(disconnect);
          return {
            disconnect,
            observe: vi.fn(),
            takeRecords: () => [],
            unobserve: vi.fn(),
          } as ResizeObserver;
        },
      }),
      vi.fn(),
      vi.fn(),
    );

    expect(() => registry.track(registration('factory', element())))
      .toThrow('intersection factory failed');
    expect(mutationDisconnects[0]).toHaveBeenCalledOnce();
    expect(resizeDisconnects[0]).toHaveBeenCalledOnce();
    expect(() => registry.track(registration('observe', element())))
      .toThrow('intersection observe failed');
    expect(mutationDisconnects[1]).toHaveBeenCalledOnce();
    expect(resizeDisconnects[1]).toHaveBeenCalledOnce();
    expect(intersectionDisconnects[0]).toHaveBeenCalledOnce();

    const working = registration('working', element());
    expect(() => registry.track(working)).not.toThrow();
    registry.destroy();
    expect(intersectionDisconnects[1]).toHaveBeenCalledOnce();
  });

  it('rebuilds remaining IO ownership when unobserve throws', () => {
    const records: IntersectionObserverRecord[] = [];
    const container = element();
    const firstElement = element();
    const secondElement = element();
    const viewportChanges = vi.fn();
    const registry = new MaterialObserverRegistry(
      container,
      runtime({
        createIntersectionObserver: (callback, options) => {
          const record = createIntersectionRecord(callback, options);
          if (records.length === 0) {
            record.observer.unobserve = () => {
              throw new Error('intersection unobserve failed');
            };
          }
          records.push(record);
          return record.observer;
        },
      }),
      vi.fn(),
      viewportChanges,
    );
    const first = registration('first', firstElement);
    const second = registration('second', secondElement);
    registry.track(first);
    registry.track(second);

    expect(() => registry.untrack(first)).not.toThrow();
    expect(records[0]?.disconnected).toBe(true);
    expect(records[1]?.observed).toEqual([secondElement]);
    records[0]?.callback([entry(secondElement, false)], records[0].observer);
    expect(viewportChanges).not.toHaveBeenCalled();
    records[1]?.callback([entry(secondElement, false)], records[1].observer);
    expect(viewportChanges).toHaveBeenCalledWith(second, false);
    registry.destroy();
  });
});
