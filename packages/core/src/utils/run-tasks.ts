/**
 * Execute every task while preserving the first observed failure.
 *
 * Lifecycle teardown must not strand later resources merely because one
 * browser cleanup throws. The first failure remains the most useful caller
 * signal, while all remaining ownership transitions still run.
 */
export function runTasksPreservingFirstFailure(
  tasks: readonly (() => void)[],
): void {
  let failed = false;
  let firstFailure: unknown;
  for (const task of tasks) {
    try {
      task();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstFailure = error;
      }
    }
  }
  if (failed) {
    throw firstFailure;
  }
}

/**
 * Run rollback tasks and then rethrow the failure that triggered rollback.
 *
 * Cleanup failures are still exercised, but they cannot obscure the operation
 * failure that caused rollback to begin.
 */
export function rethrowAfterRunningTasks(
  failure: unknown,
  tasks: readonly (() => void)[],
): never {
  runTasksPreservingFirstFailure([
    () => {
      throw failure;
    },
    ...tasks,
  ]);
  throw failure;
}
