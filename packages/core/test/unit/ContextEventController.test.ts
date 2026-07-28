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

interface InactivePageHarness {
  readonly browserDocument: Document;
  readonly browserWindow: Window;
  readonly container: HTMLElement;
  readonly runtime: GlassEngineRuntime;
  emitDocument(type: string): void;
  emitWindow(type: string): void;
  setFocused(focused: boolean): void;
  setHidden(hidden: boolean): void;
}

function createInactivePageHarness(
  initial: { focused?: boolean; hidden?: boolean } = {},
): InactivePageHarness {
  let focused = initial.focused ?? true;
  let hidden = initial.hidden ?? false;
  const browserWindow = new EventTarget();
  const browserDocument = new EventTarget();
  const container = Object.assign(new EventTarget(), target());
  Object.defineProperties(browserDocument, {
    hasFocus: { value: () => focused },
    hidden: { get: () => hidden },
  });
  return {
    browserDocument: browserDocument as unknown as Document,
    browserWindow: browserWindow as unknown as Window,
    container: container as unknown as HTMLElement,
    emitDocument: (type) => browserDocument.dispatchEvent(new Event(type)),
    emitWindow: (type) => browserWindow.dispatchEvent(new Event(type)),
    runtime: {
      createCanvas: vi.fn(),
      createResizeObserver: () => null,
      devicePixelRatio: () => 1,
      getComputedStyle: (element) => ({
        overflow: (element as unknown as FakeTarget).overflow,
        overflowX: 'visible',
        overflowY: 'visible',
      }) as CSSStyleDeclaration,
      getDocument: () => browserDocument as unknown as Document,
      getWindow: () => browserWindow as unknown as Window,
    },
    setFocused: (nextFocused) => {
      focused = nextFocused;
    },
    setHidden: (nextHidden) => {
      hidden = nextHidden;
    },
  };
}

describe('ContextEventController', () => {
  it('coalesces all scroll targets, prioritizes layout, and owns cleanup', () => {
    const container = target();
    const content = target('auto');
    const ancestor = target('auto');
    const outer = target();
    content.parentElement = container as unknown as HTMLElement;
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
    const onBlurredChange = vi.fn();
    const controller = new ContextEventController(
      container as unknown as HTMLElement,
      runtime,
      { onBlurredChange, onLayout, onScroll, onScrollPosition },
      false,
      content as unknown as HTMLElement,
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
      content as unknown as Element,
    ]);
    const scrollListeners = listeners.filter((record) => record.type === 'scroll');
    expect(scrollListeners).toHaveLength(3);
    expect(scrollListeners.every((record) => (
      typeof record.options === 'object' && record.options.capture === true
    ))).toBe(true);

    expect(scrollListeners.some((record) => (
      record.target === content as unknown as EventTarget
    ))).toBe(true);
    expect(scrollListeners.some((record) => (
      record.target === container as unknown as EventTarget
    ))).toBe(false);

    emit(content, 'scroll');
    emit(ancestor, 'scroll');
    emit(browserWindow, 'scroll');
    expect(onScrollPosition).toHaveBeenCalledTimes(3);
    expect(frames.size).toBe(1);
    flush();
    expect(onScroll).toHaveBeenCalledOnce();

    emit(content, 'scroll');
    emit(browserWindow, 'resize');
    flush();
    expect(onLayout).toHaveBeenCalledOnce();
    expect(onScroll).toHaveBeenCalledOnce();

    emit(content, 'scroll');
    expect(frames.size).toBe(1);
    controller.destroy();
    expect(frames.size).toBe(0);
    expect(listeners.every((record) => !record.active)).toBe(true);
    expect(resizeRecords[0]?.disconnected).toBe(true);
    emit(content, 'scroll');
    expect(onScroll).toHaveBeenCalledOnce();
    expect(onScrollPosition).toHaveBeenCalledTimes(5);
    expect(onBlurredChange).not.toHaveBeenCalled();
  });

  it('combines initial visibility and window focus into one blurred state', () => {
    const harness = createInactivePageHarness({ focused: false, hidden: true });
    const onBlurredChange = vi.fn();
    const controller = new ContextEventController(
      harness.container,
      harness.runtime,
      {
        onBlurredChange,
        onLayout: vi.fn(),
        onScroll: vi.fn(),
        onScrollPosition: vi.fn(),
      },
      true,
    );

    expect(onBlurredChange).toHaveBeenLastCalledWith(true);
    harness.setHidden(false);
    harness.setFocused(false);
    harness.emitDocument('visibilitychange');
    expect(onBlurredChange).toHaveBeenCalledTimes(1);

    harness.emitWindow('focus');
    expect(onBlurredChange).toHaveBeenLastCalledWith(false);
    harness.emitWindow('blur');
    expect(onBlurredChange).toHaveBeenLastCalledWith(true);

    harness.setHidden(true);
    harness.emitDocument('visibilitychange');
    harness.emitWindow('focus');
    expect(onBlurredChange).toHaveBeenCalledTimes(3);

    harness.setHidden(false);
    harness.setFocused(false);
    harness.emitDocument('visibilitychange');
    expect(onBlurredChange).toHaveBeenCalledTimes(3);
    harness.setFocused(true);
    harness.emitDocument('visibilitychange');
    expect(onBlurredChange).toHaveBeenLastCalledWith(false);
    controller.destroy();
  });

  it('dynamically owns inactive-page listeners and clears presentation on disable', () => {
    const harness = createInactivePageHarness({ hidden: true });
    const onBlurredChange = vi.fn();
    const controller = new ContextEventController(
      harness.container,
      harness.runtime,
      {
        onBlurredChange,
        onLayout: vi.fn(),
        onScroll: vi.fn(),
        onScrollPosition: vi.fn(),
      },
    );

    harness.emitWindow('blur');
    harness.emitDocument('visibilitychange');
    expect(onBlurredChange).not.toHaveBeenCalled();

    controller.setBlurredEffectEnabled(true);
    controller.setBlurredEffectEnabled(true);
    expect(onBlurredChange).toHaveBeenLastCalledWith(true);
    controller.setBlurredEffectEnabled(false);
    controller.setBlurredEffectEnabled(false);
    expect(onBlurredChange.mock.calls).toEqual([[true], [false]]);

    harness.emitWindow('blur');
    harness.emitDocument('visibilitychange');
    expect(onBlurredChange).toHaveBeenCalledTimes(2);
    controller.destroy();
    controller.destroy();
    controller.setBlurredEffectEnabled(true);
    expect(onBlurredChange).toHaveBeenCalledTimes(2);
  });

  it('does not require browser globals when inactive-page observation is enabled', () => {
    const container = Object.assign(new EventTarget(), target());
    const onBlurredChange = vi.fn();
    const runtime: GlassEngineRuntime = {
      createCanvas: vi.fn(),
      createResizeObserver: () => null,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
      getDocument: () => null,
      getWindow: () => null,
    };

    const controller = new ContextEventController(
      container as unknown as HTMLElement,
      runtime,
      {
        onBlurredChange,
        onLayout: vi.fn(),
        onScroll: vi.fn(),
        onScrollPosition: vi.fn(),
      },
      true,
    );

    expect(onBlurredChange).not.toHaveBeenCalled();
    expect(() => controller.refreshTargets()).not.toThrow();
    expect(() => controller.destroy()).not.toThrow();
  });

  it('disconnects a resize observer when initial observation fails', () => {
    const failure = new Error('observe failed');
    const disconnect = vi.fn();
    const container = Object.assign(new EventTarget(), target());
    const runtime: GlassEngineRuntime = {
      createCanvas: vi.fn(),
      createResizeObserver: () => ({
        disconnect,
        observe: () => {
          throw failure;
        },
        takeRecords: () => [],
        unobserve: vi.fn(),
      }),
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
      getWindow: () => null,
    };

    expect(() => new ContextEventController(
      container as unknown as HTMLElement,
      runtime,
      {
        onBlurredChange: vi.fn(),
        onLayout: vi.fn(),
        onScroll: vi.fn(),
        onScrollPosition: vi.fn(),
      },
    )).toThrow(failure);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('runs every listener cleanup after the first cleanup failure', () => {
    const firstFailure = new Error('listener cleanup failed');
    const cleanupCalls: string[] = [];
    let listenerIndex = 0;
    const container = Object.assign(new EventTarget(), target());
    const browserWindow = new EventTarget();
    const runtime: GlassEngineRuntime = {
      addEventListener: () => {
        const currentIndex = listenerIndex;
        listenerIndex += 1;
        return () => {
          cleanupCalls.push(String(currentIndex));
          if (currentIndex === 0) throw firstFailure;
        };
      },
      createCanvas: vi.fn(),
      createResizeObserver: () => null,
      devicePixelRatio: () => 1,
      getComputedStyle: () => ({}) as CSSStyleDeclaration,
      getWindow: () => browserWindow as unknown as Window,
    };
    const controller = new ContextEventController(
      container as unknown as HTMLElement,
      runtime,
      {
        onBlurredChange: vi.fn(),
        onLayout: vi.fn(),
        onScroll: vi.fn(),
        onScrollPosition: vi.fn(),
      },
    );

    expect(() => controller.destroy()).toThrow(firstFailure);
    expect(cleanupCalls).toEqual(['0', '1', '2']);
    expect(controller.getDiagnosticsState()).toMatchObject({
      pendingFrame: false,
      resources: {
        eventListeners: 0,
        resizeObservers: 0,
      },
    });
    expect(() => controller.destroy()).not.toThrow();
  });
});
