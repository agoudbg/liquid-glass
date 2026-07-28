/** Resolve the framework-owned content layer used for canvas attachment. */
export function resolveContextContent(container: HTMLElement): HTMLElement {
  if (typeof container.querySelector !== 'function') {
    return container;
  }
  return container.querySelector<HTMLElement>(
    ':scope > .liquid-glass-content',
  ) ?? container;
}
