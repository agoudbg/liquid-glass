/**
 * Constraint accepted by `TypedEventEmitter` without requiring an index
 * signature on concrete event-map interfaces.
 */
export type TypedEventMap<Events> = {
  [Event in keyof Events]: (...args: never[]) => unknown;
};

/**
 * Synchronous, type-safe event emitter with the reference implementation's
 * chainable subscription semantics.
 *
 * Listener errors intentionally propagate to the caller. This makes callback
 * failures observable rather than silently corrupting renderer state.
 */
export class TypedEventEmitter<Events extends TypedEventMap<Events>> {
  private readonly events: {
    [Event in keyof Events]?: Events[Event][];
  } = {};

  /**
   * Subscribe a listener. Registering the same function twice creates two
   * subscriptions, matching the reference implementation.
   *
   * @param event - Event name.
   * @param listener - Typed event listener.
   * @returns This emitter for chaining.
   */
  public on<Event extends keyof Events>(event: Event, listener: Events[Event]): this {
    const listeners = this.events[event];

    if (listeners) {
      listeners.push(listener);
    } else {
      this.events[event] = [listener];
    }

    return this;
  }

  /**
   * Remove every registration of a specific listener for an event.
   *
   * @param event - Event name.
   * @param listener - Listener reference to remove.
   * @returns This emitter for chaining.
   */
  public off<Event extends keyof Events>(event: Event, listener: Events[Event]): this {
    const listeners = this.events[event];

    if (!listeners) {
      return this;
    }

    const remaining = listeners.filter((candidate) => candidate !== listener);
    if (remaining.length === 0) {
      delete this.events[event];
    } else {
      this.events[event] = remaining;
    }

    return this;
  }

  /**
   * Invoke listeners synchronously in registration order.
   *
   * The listener array is snapshotted so subscriptions changed by a callback do
   * not alter the current dispatch. A thrown listener error stops dispatch and
   * propagates unchanged to the emitter's caller.
   *
   * @param event - Event name.
   * @param args - Arguments defined by the event-map callback.
   * @returns `true`, retained for compatibility with the reference emitter.
   */
  public emit<Event extends keyof Events>(
    event: Event,
    ...args: Parameters<Events[Event]>
  ): boolean {
    const listeners = this.events[event];

    if (listeners) {
      for (const listener of [...listeners]) {
        Reflect.apply(listener, this, args);
      }
    }

    return true;
  }

  /**
   * Count listeners registered for one event.
   *
   * @param event - Event name.
   * @returns Number of active registrations.
   */
  public listenerCount<Event extends keyof Events>(event: Event): number {
    return this.events[event]?.length ?? 0;
  }

  /**
   * Remove all listeners for one event, or for the entire emitter.
   *
   * @param event - Optional event to clear.
   * @returns This emitter for chaining.
   */
  public removeAllListeners<Event extends keyof Events>(event?: Event): this {
    if (event !== undefined) {
      delete this.events[event];
      return this;
    }

    for (const eventName of Reflect.ownKeys(this.events) as (keyof Events)[]) {
      delete this.events[eventName];
    }

    return this;
  }
}
