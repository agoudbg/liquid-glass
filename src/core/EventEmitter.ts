export class EventEmitter {
  // 存储所有事件监听器
  private _events: Record<string, Function[]>;

  constructor() {
    this._events = {};
  }

  // 订阅事件
  on(event: string, listener: Function) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(listener);
    return this;
  }

  // 移除事件
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

  // 发布事件
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
