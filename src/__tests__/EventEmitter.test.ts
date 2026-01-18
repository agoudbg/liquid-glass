/**
 * Tests for EventEmitter class.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EventEmitter } from '../core/EventEmitter';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('on()', () => {
    it('should subscribe to an event', () => {
      const listener = vi.fn();
      emitter.on('test', listener);
      emitter.emit('test');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should return this for chaining', () => {
      const result = emitter.on('test', () => {});
      expect(result).toBe(emitter);
    });

    it('should allow multiple listeners for the same event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      emitter.on('test', listener1);
      emitter.on('test', listener2);
      emitter.emit('test');
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should allow the same listener to be added multiple times', () => {
      const listener = vi.fn();
      emitter.on('test', listener);
      emitter.on('test', listener);
      emitter.emit('test');
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('off()', () => {
    it('should unsubscribe from an event', () => {
      const listener = vi.fn();
      emitter.on('test', listener);
      emitter.off('test', listener);
      emitter.emit('test');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should return this for chaining', () => {
      const listener = vi.fn();
      emitter.on('test', listener);
      const result = emitter.off('test', listener);
      expect(result).toBe(emitter);
    });

    it('should only remove the specified listener', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      emitter.on('test', listener1);
      emitter.on('test', listener2);
      emitter.off('test', listener1);
      emitter.emit('test');
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should handle removing listener that was never added', () => {
      const listener = vi.fn();
      // Should not throw
      expect(() => emitter.off('test', listener)).not.toThrow();
    });

    it('should handle removing from non-existent event', () => {
      const listener = vi.fn();
      emitter.on('other', listener);
      // Should not throw
      expect(() => emitter.off('test', listener)).not.toThrow();
    });
  });

  describe('emit()', () => {
    it('should call listeners with provided arguments', () => {
      const listener = vi.fn();
      emitter.on('test', listener);
      emitter.emit('test', 'arg1', 'arg2', 123);
      expect(listener).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });

    it('should return true', () => {
      const result = emitter.emit('test');
      expect(result).toBe(true);
    });

    it('should return true even when no listeners exist', () => {
      const result = emitter.emit('nonexistent');
      expect(result).toBe(true);
    });

    it('should call listeners in order of registration', () => {
      const callOrder: number[] = [];
      emitter.on('test', () => callOrder.push(1));
      emitter.on('test', () => callOrder.push(2));
      emitter.on('test', () => callOrder.push(3));
      emitter.emit('test');
      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('should not call listeners for different events', () => {
      const listener = vi.fn();
      emitter.on('event1', listener);
      emitter.emit('event2');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('chaining', () => {
    it('should support method chaining for on and off', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      // Note: emit() returns true (for compatibility), not `this`, so we can't chain after emit
      emitter
        .on('event1', listener1)
        .on('event2', listener2);

      emitter.emit('event1');
      emitter.off('event1', listener1);

      expect(listener1).toHaveBeenCalledTimes(1);

      // After off(), listener1 should not be called again
      emitter.emit('event1');
      expect(listener1).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle events with special characters', () => {
      const listener = vi.fn();
      emitter.on('my:special.event', listener);
      emitter.emit('my:special.event', 'data');
      expect(listener).toHaveBeenCalledWith('data');
    });

    it('should handle numeric event names (coerced to string)', () => {
      const listener = vi.fn();
      emitter.on('123', listener);
      emitter.emit('123');
      expect(listener).toHaveBeenCalled();
    });

    it('should handle async listeners', async () => {
      const results: number[] = [];
      emitter.on('test', async () => {
        await new Promise((resolve) => { setTimeout(resolve, 10); });
        results.push(1);
      });
      emitter.emit('test');
      // emit() doesn't wait for async
      expect(results).toEqual([]);
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      expect(results).toEqual([1]);
    });
  });
});
