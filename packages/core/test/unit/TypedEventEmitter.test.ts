import { describe, expect, it, vi } from 'vitest';

import { TypedEventEmitter } from '../../src/events/TypedEventEmitter';

interface TestEvents {
  value: (value: number) => void;
  empty: () => void;
}

describe('TypedEventEmitter', () => {
  it('dispatches synchronously in registration order and remains chainable', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const calls: string[] = [];
    const first = (value: number): void => {
      calls.push(`first:${value}`);
    };
    const second = (value: number): void => {
      calls.push(`second:${value}`);
    };

    expect(emitter.on('value', first)).toBe(emitter);
    expect(emitter.on('value', second)).toBe(emitter);
    expect(emitter.emit('value', 7)).toBe(true);
    expect(calls).toEqual(['first:7', 'second:7']);
  });

  it('keeps duplicate subscriptions and removes every matching reference', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const listener = vi.fn<(value: number) => void>();

    emitter.on('value', listener).on('value', listener);
    expect(emitter.listenerCount('value')).toBe(2);
    emitter.emit('value', 1);
    expect(listener).toHaveBeenCalledTimes(2);

    expect(emitter.off('value', listener)).toBe(emitter);
    expect(emitter.listenerCount('value')).toBe(0);
  });

  it('uses a stable listener snapshot during a dispatch', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const calls: string[] = [];
    const added = (): void => {
      calls.push('added');
    };
    const second = (): void => {
      calls.push('second');
    };
    const first = (): void => {
      calls.push('first');
      emitter.off('empty', second);
      emitter.on('empty', added);
    };

    emitter.on('empty', first).on('empty', second);
    emitter.emit('empty');
    expect(calls).toEqual(['first', 'second']);

    calls.length = 0;
    emitter.emit('empty');
    expect(calls).toEqual(['first', 'added']);
  });

  it('propagates listener failures unchanged and stops dispatch', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const originalError = new Error('listener failed');
    const after = vi.fn<() => void>();

    emitter.on('empty', () => {
      throw originalError;
    });
    emitter.on('empty', after);

    expect(() => emitter.emit('empty')).toThrow(originalError);
    expect(after).not.toHaveBeenCalled();
  });

  it('clears one event or all events', () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    emitter.on('empty', () => undefined);
    emitter.on('value', () => undefined);

    expect(emitter.removeAllListeners('empty')).toBe(emitter);
    expect(emitter.listenerCount('empty')).toBe(0);
    expect(emitter.listenerCount('value')).toBe(1);

    emitter.removeAllListeners();
    expect(emitter.listenerCount('value')).toBe(0);
  });
});
