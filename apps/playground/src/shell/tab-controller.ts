import {
  isWorkbenchTab,
  type WorkbenchTab,
} from '../shared/workbench-tabs';

/** Bind click and horizontal arrow-key activation for the workbench tablist. */
export function bindWorkbenchTabs(
  root: HTMLElement,
  onSelect: (tab: WorkbenchTab) => void,
): () => void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>(
    '[data-workbench-tab]',
  )];
  const disposers: Array<() => void> = [];
  const select = (button: HTMLButtonElement): void => {
    const tab = button.dataset.workbenchTab;
    if (isWorkbenchTab(tab)) onSelect(tab);
  };

  for (const [index, button] of buttons.entries()) {
    const click = (): void => select(button);
    const keydown = (event: KeyboardEvent): void => {
      const nextIndex = resolveNextIndex(event.key, index, buttons.length);
      if (nextIndex === null) return;
      event.preventDefault();
      const next = buttons[nextIndex];
      if (!next) return;
      next.focus();
      select(next);
    };
    button.addEventListener('click', click);
    button.addEventListener('keydown', keydown);
    disposers.push(() => {
      button.removeEventListener('click', click);
      button.removeEventListener('keydown', keydown);
    });
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const dispose of disposers.splice(0)) dispose();
  };
}

function resolveNextIndex(
  key: string,
  current: number,
  count: number,
): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  return null;
}
