import { describe, expect, it, vi } from 'vitest';

import { MaterialObserverRegistry } from '../../src/engine/MaterialObserverRegistry';
import type { MaterialRegistration } from '../../src/engine/registrations';
import type { GlassEngineRuntime } from '../../src/engine/runtime';

interface TestNode {
  parent: TestNode | null;
  value: Node;
}

interface MutationObserverRecord {
  callback: MutationCallback;
  disconnected: boolean;
  observed: Array<{ options?: MutationObserverInit; target: Node }>;
  observer: MutationObserver;
}

interface ResizeObserverRecord {
  callback: ResizeObserverCallback;
  disconnected: boolean;
  observed: Element[];
  observer: ResizeObserver;
  unobserved: Element[];
}

function testNode(parent: TestNode | null = null): TestNode {
  const node = { parent } as TestNode;
  node.value = {
    contains: (candidate: Node | null) => {
      let current = candidate as (Node & { testNode?: TestNode }) | null;
      while (current) {
        if (current === node.value) return true;
        current = current.testNode?.parent?.value as typeof current;
      }
      return false;
    },
    testNode: node,
  } as unknown as Node;
  return node;
}

function registration(id: string, node: TestNode): MaterialRegistration {
  return {
    id,
    config: { element: node.value as HTMLElement },
    destroyed: false,
    initialFallbackAttribute: null,
    interactionState: null,
  };
}

function mutation(type: 'attributes' | 'childList', target: TestNode): MutationRecord {
  return { target: target.value, type } as MutationRecord;
}

function runtime(
  overrides: Partial<GlassEngineRuntime> = {},
): GlassEngineRuntime {
  return {
    createCanvas: () => {
      throw new Error('Canvas creation is not used by material observer tests.');
    },
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({}) as CSSStyleDeclaration,
    ...overrides,
  };
}

function createMutationRecord(callback: MutationCallback): MutationObserverRecord {
  const record = {
    callback,
    disconnected: false,
    observed: [],
  } as unknown as MutationObserverRecord;
  record.observer = {
    disconnect: () => {
      record.disconnected = true;
    },
    observe: (target: Node, options?: MutationObserverInit) => {
      record.observed.push({ options, target });
    },
    takeRecords: () => [],
  } as MutationObserver;
  return record;
}

function createResizeRecord(callback: ResizeObserverCallback): ResizeObserverRecord {
  const record = {
    callback,
    disconnected: false,
    observed: [],
    unobserved: [],
  } as unknown as ResizeObserverRecord;
  record.observer = {
    disconnect: () => {
      record.disconnected = true;
    },
    observe: (target: Element) => record.observed.push(target),
    takeRecords: () => [],
    unobserve: (target: Element) => record.unobserved.push(target),
  } as ResizeObserver;
  return record;
}

describe('MaterialObserverRegistry', () => {
  it('shares observers, reference-counts elements, and filters descendant noise', () => {
    const mutationRecords: MutationObserverRecord[] = [];
    const resizeRecords: ResizeObserverRecord[] = [];
    const container = testNode();
    const ancestor = testNode(container);
    const firstMaterial = testNode(ancestor);
    const descendant = testNode(firstMaterial);
    const secondMaterial = testNode(container);
    const unrelated = testNode();
    const onInvalidate = vi.fn();
    const registry = new MaterialObserverRegistry(
      container.value as HTMLElement,
      runtime({
        createMutationObserver: (callback) => {
          const record = createMutationRecord(callback);
          mutationRecords.push(record);
          return record.observer;
        },
        createResizeObserver: (callback) => {
          const record = createResizeRecord(callback);
          resizeRecords.push(record);
          return record.observer;
        },
      }),
      onInvalidate,
    );
    const first = registration('first', firstMaterial);
    const duplicate = registration('duplicate', firstMaterial);
    const second = registration('second', secondMaterial);

    registry.track(first);
    registry.track(duplicate);
    registry.track(second);

    expect(mutationRecords).toHaveLength(1);
    expect(resizeRecords).toHaveLength(1);
    expect(resizeRecords[0]?.observed).toEqual([
      firstMaterial.value,
      secondMaterial.value,
    ]);
    expect(mutationRecords[0]?.observed).toEqual([{
      target: container.value,
      options: {
        attributeFilter: ['style', 'class', 'hidden'],
        attributes: true,
        childList: true,
        subtree: true,
      },
    }]);

    resizeRecords[0]?.callback([], resizeRecords[0].observer);
    mutationRecords[0]?.callback(
      [mutation('attributes', descendant), mutation('attributes', unrelated)],
      mutationRecords[0].observer,
    );
    expect(onInvalidate).toHaveBeenCalledOnce();

    for (const target of [firstMaterial, ancestor, container]) {
      mutationRecords[0]?.callback(
        [mutation('attributes', target)],
        mutationRecords[0].observer,
      );
    }
    mutationRecords[0]?.callback(
      [mutation('childList', descendant)],
      mutationRecords[0].observer,
    );
    expect(onInvalidate).toHaveBeenCalledTimes(5);

    registry.untrack(first);
    expect(resizeRecords[0]?.unobserved).toEqual([]);
    registry.untrack(duplicate);
    expect(resizeRecords[0]?.unobserved).toEqual([firstMaterial.value]);
    registry.untrack(second);
    expect(resizeRecords[0]?.disconnected).toBe(true);
    expect(mutationRecords[0]?.disconnected).toBe(true);

    resizeRecords[0]?.callback([], resizeRecords[0].observer);
    mutationRecords[0]?.callback(
      [mutation('childList', container)],
      mutationRecords[0].observer,
    );
    expect(onInvalidate).toHaveBeenCalledTimes(5);
  });

  it('degrades when observer factories are unavailable', () => {
    const createMutationObserver = vi.fn(() => null);
    const createResizeObserver = vi.fn(() => null);
    const container = testNode();
    const registry = new MaterialObserverRegistry(
      container.value as HTMLElement,
      runtime({ createMutationObserver, createResizeObserver }),
      vi.fn(),
    );

    registry.track(registration('first', testNode(container)));
    registry.track(registration('second', testNode(container)));

    expect(createMutationObserver).toHaveBeenCalledOnce();
    expect(createResizeObserver).toHaveBeenCalledOnce();
    expect(() => registry.destroy()).not.toThrow();
  });

  it('preserves an observe failure when rollback disconnect also fails', () => {
    const container = testNode();
    const mutationRecords: MutationObserverRecord[] = [];
    const resizeRecords: ResizeObserverRecord[] = [];
    let resizeAttempt = 0;
    const onInvalidate = vi.fn();
    const registry = new MaterialObserverRegistry(
      container.value as HTMLElement,
      runtime({
        createMutationObserver: (callback) => {
          const record = createMutationRecord(callback);
          mutationRecords.push(record);
          return record.observer;
        },
        createResizeObserver: (callback) => {
          resizeAttempt += 1;
          if (resizeAttempt === 1) {
            return {
              disconnect: () => {
                throw new Error('disconnect failed');
              },
              observe: () => {
                throw new Error('observe failed');
              },
              takeRecords: () => [],
              unobserve: vi.fn(),
            } as ResizeObserver;
          }
          const record = createResizeRecord(callback);
          resizeRecords.push(record);
          return record.observer;
        },
      }),
      onInvalidate,
    );

    expect(() => registry.track(registration('failed', testNode(container))))
      .toThrow('observe failed');
    expect(mutationRecords[0]?.disconnected).toBe(true);

    registry.track(registration('working', testNode(container)));
    resizeRecords[0]?.callback([], resizeRecords[0].observer);
    expect(onInvalidate).toHaveBeenCalledOnce();
    registry.destroy();
  });

  it('rebuilds existing observation when failed unobserve leaves ownership unclear', () => {
    const container = testNode();
    const firstMaterial = testNode(container);
    const failedMaterial = testNode(container);
    const resizeRecords: ResizeObserverRecord[] = [];
    let resizeAttempt = 0;
    const onInvalidate = vi.fn();
    const registry = new MaterialObserverRegistry(
      container.value as HTMLElement,
      runtime({
        createMutationObserver: (callback) => createMutationRecord(callback).observer,
        createResizeObserver: (callback) => {
          resizeAttempt += 1;
          const record = createResizeRecord(callback);
          if (resizeAttempt === 1) {
            record.observer.observe = (target) => {
              if (target === failedMaterial.value) throw new Error('observe failed');
              record.observed.push(target);
            };
            record.observer.unobserve = () => {
              throw new Error('unobserve failed');
            };
          }
          resizeRecords.push(record);
          return record.observer;
        },
      }),
      onInvalidate,
    );

    registry.track(registration('first', firstMaterial));
    expect(() => registry.track(registration('failed', failedMaterial)))
      .toThrow('observe failed');
    expect(resizeRecords[0]?.disconnected).toBe(true);
    expect(resizeRecords[1]?.observed).toEqual([firstMaterial.value]);

    resizeRecords[0]?.callback([], resizeRecords[0].observer);
    expect(onInvalidate).not.toHaveBeenCalled();
    resizeRecords[1]?.callback([], resizeRecords[1].observer);
    expect(onInvalidate).toHaveBeenCalledOnce();
    registry.destroy();
  });

  it('rebuilds remaining elements when normal untrack cannot unobserve', () => {
    const container = testNode();
    const firstMaterial = testNode(container);
    const secondMaterial = testNode(container);
    const resizeRecords: ResizeObserverRecord[] = [];
    let resizeAttempt = 0;
    const onInvalidate = vi.fn();
    const registry = new MaterialObserverRegistry(
      container.value as HTMLElement,
      runtime({
        createMutationObserver: (callback) => createMutationRecord(callback).observer,
        createResizeObserver: (callback) => {
          resizeAttempt += 1;
          const record = createResizeRecord(callback);
          if (resizeAttempt === 1) {
            record.observer.unobserve = () => {
              throw new Error('unobserve failed');
            };
          }
          resizeRecords.push(record);
          return record.observer;
        },
      }),
      onInvalidate,
    );
    const first = registration('first', firstMaterial);
    const second = registration('second', secondMaterial);
    registry.track(first);
    registry.track(second);

    expect(() => registry.untrack(first)).not.toThrow();
    expect(resizeRecords[0]?.disconnected).toBe(true);
    expect(resizeRecords[1]?.observed).toEqual([secondMaterial.value]);
    resizeRecords[0]?.callback([], resizeRecords[0].observer);
    expect(onInvalidate).not.toHaveBeenCalled();
    resizeRecords[1]?.callback([], resizeRecords[1].observer);
    expect(onInvalidate).toHaveBeenCalledOnce();
    registry.untrack(second);
  });

  it('attempts every disconnect and clears late callbacks when teardown throws', () => {
    const container = testNode();
    const resizeDisconnected = vi.fn();
    const mutationDisconnected = vi.fn();
    const resizeCallbacks: ResizeObserverCallback[] = [];
    const mutationCallbacks: MutationCallback[] = [];
    const onInvalidate = vi.fn();
    const registry = new MaterialObserverRegistry(
      container.value as HTMLElement,
      runtime({
        createMutationObserver: (callback) => {
          mutationCallbacks.push(callback);
          return {
            disconnect: () => {
              mutationDisconnected();
              throw new Error('mutation disconnect failed');
            },
            observe: vi.fn(),
            takeRecords: () => [],
          } as MutationObserver;
        },
        createResizeObserver: (callback) => {
          resizeCallbacks.push(callback);
          return {
            disconnect: () => {
              resizeDisconnected();
              throw new Error('resize disconnect failed');
            },
            observe: vi.fn(),
            takeRecords: () => [],
            unobserve: vi.fn(),
          } as ResizeObserver;
        },
      }),
      onInvalidate,
    );
    registry.track(registration('material', testNode(container)));

    expect(() => registry.destroy()).not.toThrow();
    expect(resizeDisconnected).toHaveBeenCalledOnce();
    expect(mutationDisconnected).toHaveBeenCalledOnce();
    resizeCallbacks[0]?.([], {} as ResizeObserver);
    mutationCallbacks[0]?.(
      [mutation('childList', container)],
      {} as MutationObserver,
    );
    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it('preserves mutation observe and factory failures without retaining callbacks', () => {
    const container = testNode();
    let mutationAttempt = 0;
    const mutationRecords: MutationObserverRecord[] = [];
    const onInvalidate = vi.fn();
    const registry = new MaterialObserverRegistry(
      container.value as HTMLElement,
      runtime({
        createMutationObserver: (callback) => {
          mutationAttempt += 1;
          if (mutationAttempt === 1) throw new Error('factory failed');
          if (mutationAttempt === 2) {
            return {
              disconnect: () => {
                throw new Error('disconnect failed');
              },
              observe: () => {
                throw new Error('mutation observe failed');
              },
              takeRecords: () => [],
            } as MutationObserver;
          }
          const record = createMutationRecord(callback);
          mutationRecords.push(record);
          return record.observer;
        },
        createResizeObserver: () => null,
      }),
      onInvalidate,
    );

    expect(() => registry.track(registration('factory', testNode(container))))
      .toThrow('factory failed');
    expect(() => registry.track(registration('observe', testNode(container))))
      .toThrow('mutation observe failed');
    registry.track(registration('working', testNode(container)));
    mutationRecords[0]?.callback(
      [mutation('childList', container)],
      mutationRecords[0].observer,
    );
    expect(onInvalidate).toHaveBeenCalledOnce();
    registry.destroy();
  });
});
