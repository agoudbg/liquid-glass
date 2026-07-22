/** Create a stable abort error without requiring DOMException support. */
function createAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error('The backdrop capture was aborted.');
  error.name = 'AbortError';
  return error;
}

/**
 * Release an owned async wait when its context is retired.
 *
 * The underlying rasterizer may continue internally, but its eventual result
 * is observed and ignored while the core scheduler can settle immediately.
 */
export function raceWithAbort<Value>(
  task: Promise<Value>,
  signal: AbortSignal | undefined,
): Promise<Value> {
  if (!signal) {
    return task;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError(signal));
  }
  return new Promise<Value>((resolve, reject) => {
    const handleAbort = (): void => {
      signal.removeEventListener('abort', handleAbort);
      reject(createAbortError(signal));
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    void task.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', handleAbort);
    });
  });
}
