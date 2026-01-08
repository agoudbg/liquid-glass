/**
 * @fileoverview Simple EventEmitter implementation for Liquid Glass components.
 *
 * This is a lightweight pub/sub event system used by Manager and Element classes
 * to communicate state changes without tight coupling.
 *
 * Usage:
 * ```typescript
 * const emitter = new EventEmitter();
 * emitter.on('myEvent', (data) => console.log(data));
 * emitter.emit('myEvent', { foo: 'bar' });
 * ```
 *
 * @module EventEmitter
 */

/**
 * Simple EventEmitter class for pub/sub event handling.
 *
 * Features:
 * - Subscribe to events with on()
 * - Unsubscribe with off()
 * - Emit events with emit()
 * - Chainable API (methods return `this`)
 *
 * Note: This is a minimal implementation. For production use with many events,
 * consider using a library like EventEmitter3 or mitt for better performance.
 */
export class EventEmitter {
  // ============================================================================
  // PRIVATE PROPERTIES
  // ============================================================================

  /**
   * Storage for all event listeners.
   * Key is the event name, value is an array of listener functions.
   */
  private _events: Record<string, Function[]>;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor() {
    this._events = {};
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Subscribe to an event.
   *
   * @param event - The event name to subscribe to
   * @param listener - The callback function to invoke when the event is emitted
   * @returns `this` for chaining
   *
   * @example
   * emitter.on('backdropCaptured', (data) => {
   *   console.log('Backdrop captured:', data);
   * });
   */
  on(event: string, listener: Function) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(listener);
    return this;
  }

  /**
   * Unsubscribe from an event.
   *
   * @param event - The event name to unsubscribe from
   * @param listener - The specific listener function to remove
   * @returns `this` for chaining
   *
   * @example
   * const handler = (data) => console.log(data);
   * emitter.on('myEvent', handler);
   * emitter.off('myEvent', handler);
   */
  off(event: string | number, listener: Function) {
    if (!this._events[event]) {
      return this;
    }
    this._events[event] = this._events[event].filter(
      (l) => l !== listener,
    );
    if (this._events[event].length === 0) {
      delete this._events[event];
    }
    return this;
  }

  /**
   * Emit an event to all subscribed listeners.
   *
   * @param event - The event name to emit
   * @param args - Arguments to pass to the listener functions
   * @returns `true` (always, for compatibility)
   *
   * @example
   * emitter.emit('backdropCaptured', { canvas, width, height });
   */
  emit(event: string, ...args: any[]) {
    const listeners = this._events[event];

    if (listeners) {
      listeners.forEach((listener) => {
        listener.apply(this, args);
      });
    }
    return true;
  }
}
