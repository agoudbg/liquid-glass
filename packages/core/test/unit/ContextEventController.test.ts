import { describe, expect, it, vi } from 'vitest';

import { ContextEventController } from '../../src/engine/ContextEventController';
import type { GlassEngineRuntime } from '../../src/engine/runtime';

interface FakeTarget {
  overflow: string;
  parentElement: HTMLElement | null;
}

interface ListenerRecord {
  active: boolean;
  listener: EventListener;
  options?: boolean | AddEventListenerOptions;
  target: EventTarget;
  type: string;
}

interface ResizeRecord {
  callback: ResizeObserverCallback;
  disconnected: boolean;
  observed: Element[];
}

function target(overflow = 'visible'): FakeTarget {
  return { overflow, parentElement: null };
}

describe('ContextEventController', () => {
  it('coalesces all scroll targets, prioritizes layout, and owns cleanup', () => {
    const container = target();
    const ancestor = target('auto');
    const outer = target();
    container.parentElement = ancestor as unknown as HTMLElement;
    ancestor.parentElement = outer as unknown as HTMLElement;
    const browserWindow = target();
    const listeners: ListenerRecord[] = [];
    const resizeRecords: ResizeRecord[] = [];
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 1;
    const runtime: GlassEngineRuntime = {
      addEventListener: (eventTarget, type, listener, options) => {
        const record: ListenerRecord = {
          active: true,
          listener,
          options,
          target: eventTarget,
          type,
        };
        listeners.push(record);
        return () => {
          record.active = false;
        };
      },
      cancelAnimationFrame: (handle) => {
        frames.delete(handle);
      },
      createCanvas: vi.fn(),
      createResizeObserver: (callback) => {
        const record: ResizeRecord = {
          callback,
          disconnected: false,
          observed: [],
        };
        resizeRecords.push(record);
        return {
          disconnect: () => {
            record.disconnected = true;
          },
          observe: (element: Element) => {
            record.observed.push(element);
          },
          takeRecords: () => [],
          unobserve: vi.fn(),
        } as ResizeObserver;
      },
      devicePixelRatio: () => 1,
      getComputedStyle: (element) => ({
        overflow: (element as unknown as FakeTarget).overflow,
        overflowX: 'visible',
        overflowY: 'visible',
      }) as CSSStyleDeclaration,
      getWindow: () => browserWindow as unknown as Window,
      requestAnimationFrame: (callback) => {
        const handle = nextFrameId++;
        frames.set(handle, callback);
        return handle;
      },
    };
    const onLayout = vi.fn();
    const onScroll = vi.fn();
    const onScrollPosition = vi.fn();
    const controller = new ContextEventController(
      container as unknown as HTMLElement,
      runtime,
      { onLayout, onScroll, onScrollPosition },
    );
    const emit = (eventTarget: FakeTarget, type: string): void => {
      for (const record of listeners) {
        if (
          record.active
          && record.target === eventTarget as unknown as EventTarget
          && record.type === type
        ) {
          record.listener({ type } as Event);
        }
      }
    };
    const flush = (): void => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) {
        callback(16);
      }
    };

    expect(resizeRecords[0]?.observed).toEqual([
      container as unknown as Element,
    ]);
    const scrollListeners = listeners.filter((record) => record.type === 'scroll');
    expect(scrollListeners).toHaveLength(3);
    expect(scrollListeners.every((record) => (
      typeof record.options === 'object' && record.options.capture === true
    ))).toBe(true);

    emit(container, 'scroll');
    emit(ancestor, 'scroll');
    emit(browserWindow, 'scroll');
    expect(onScrollPosition).toHaveBeenCalledTimes(3);
    expect(frames.size).toBe(1);
    flush();
    expect(onScroll).toHaveBeenCalledOnce();

    emit(container, 'scroll');
    emit(browserWindow, 'resize');
    flush();
    expect(onLayout).toHaveBeenCalledOnce();
    expect(onScroll).toHaveBeenCalledOnce();

    emit(container, 'scroll');
    expect(frames.size).toBe(1);
    controller.destroy();
    expect(frames.size).toBe(0);
    expect(listeners.every((record) => !record.active)).toBe(true);
    expect(resizeRecords[0]?.disconnected).toBe(true);
    emit(container, 'scroll');
    expect(onScroll).toHaveBeenCalledOnce();
    expect(onScrollPosition).toHaveBeenCalledTimes(5);
  });
});
