import type { ContextFrameDiagnosticsState } from './diagnostics-internal';
import type { GlassEngineRuntime } from './runtime';

interface AnimationFrameRequest {
  kind: 'animation-frame';
  handle: number;
  token: symbol;
}

interface TimerFrameRequest {
  kind: 'timer';
  handle: ReturnType<typeof setTimeout>;
  token: symbol;
}

type PendingFrameRequest = AnimationFrameRequest | TimerFrameRequest;

function currentTimestamp(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

/** Schedules one context frame with a timer fallback for hosts without RAF. */
export class ContextFrameScheduler {
  private pending: PendingFrameRequest | null = null;

  /** Create a scheduler around an injected browser runtime. */
  public constructor(private readonly runtime: GlassEngineRuntime) {}

  /** Whether one callback is waiting to run. */
  public get scheduled(): boolean {
    return this.pending !== null;
  }

  /** Return the kind of pending frame without exposing its host handle. */
  public getDiagnosticsState(): ContextFrameDiagnosticsState {
    return {
      pendingAnimationFrame: this.pending?.kind === 'animation-frame',
      pendingTimer: this.pending?.kind === 'timer',
    };
  }

  /** Request one callback while coalescing duplicate requests. */
  public request(callback: FrameRequestCallback): void {
    if (this.pending) return;
    const requestFrame = this.runtime.requestAnimationFrame
      ?? (typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : null);
    if (requestFrame) {
      const token = Symbol('animation-frame');
      const handle = requestFrame((timestamp) => {
        if (this.pending?.token !== token) return;
        this.pending = null;
        callback(timestamp);
      });
      this.pending = { kind: 'animation-frame', handle, token };
      return;
    }

    const token = Symbol('timer-frame');
    const handle = setTimeout(() => {
      if (this.pending?.token !== token) return;
      this.pending = null;
      callback(currentTimestamp());
    }, 16);
    this.pending = { kind: 'timer', handle, token };
  }

  /** Cancel the pending callback and reject a stale callback that still fires. */
  public cancel(): void {
    const request = this.pending;
    if (!request) return;
    this.pending = null;
    if (request.kind === 'timer') {
      clearTimeout(request.handle);
      return;
    }
    const cancelFrame = this.runtime.cancelAnimationFrame
      ?? (typeof globalThis.cancelAnimationFrame === 'function'
        ? globalThis.cancelAnimationFrame.bind(globalThis)
        : null);
    cancelFrame?.(request.handle);
  }
}
