import {
  formatLabRangeValue,
  LAB_RANGE_GROUPS,
  readLabNumericControl,
} from '../shared/lab-control-model';
import { resolveLabColorInputValue } from '../shared/lab-state';
import { isLabSceneEditable } from '../shared/scene-render-options';
import type { PlaygroundState } from '../shared/types';
import { resolveWorkbenchTab } from '../shared/workbench-tabs';

/** Render the derived tab and complete focused Lab inspector state. */
export function renderLabWorkbench(
  root: HTMLElement,
  state: PlaygroundState,
): void {
  const activeTab = resolveWorkbenchTab(state.scene);
  const workspace = requireElement<HTMLElement>(root, '#workspace');
  workspace.setAttribute('aria-labelledby', `workbench-tab-${activeTab}`);
  for (const button of query<HTMLButtonElement>(root, '[data-workbench-tab]')) {
    const active = button.dataset.workbenchTab === activeTab;
    button.dataset.active = String(active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }

  const editable = isLabSceneEditable(state);
  requireElement<HTMLElement>(root, '[data-lab-panel]').hidden = !editable;
  requireElement<HTMLElement>(root, '[data-fixed-panel]').hidden = editable;
  root.dataset.workbenchTab = activeTab;
  if (!editable) return;

  for (const group of LAB_RANGE_GROUPS) {
    for (const control of group.controls) {
      const value = readLabNumericControl(state.lab, control.id);
      requireElement<HTMLInputElement>(
        root,
        `[data-lab-number="${control.id}"]`,
      ).value = String(value);
      requireElement<HTMLOutputElement>(
        root,
        `[data-lab-output="${control.id}"]`,
      ).value = formatLabRangeValue(control, value);
    }
  }

  for (const input of query<HTMLInputElement>(root, '[data-lab-boolean]')) {
    const control = input.dataset.labBoolean;
    if (control === 'useCustomColor') {
      input.checked = state.lab.appearance.useCustomColor;
    } else if (control === 'disableInteractions') {
      input.checked = state.lab.interaction.disableInteractions;
    } else if (control === 'onlyClickInteractions') {
      input.checked = state.lab.interaction.onlyClickInteractions;
    } else if (control === 'isMoveable') {
      input.checked = state.lab.interaction.isMoveable;
    }
  }

  requireElement<HTMLSelectElement>(root, '[data-lab-interaction]').value =
    state.lab.interaction.preset;
  requireElement<HTMLElement>(root, '[data-lab-custom]').hidden =
    state.lab.interaction.preset !== 'custom';

  for (const button of query<HTMLButtonElement>(
    root,
    'button[data-lab-source]',
  )) {
    const active = button.dataset.labSource === state.lab.source.kind;
    button.dataset.active = String(active);
    button.setAttribute('aria-pressed', String(active));
  }

  const colorInput = requireElement<HTMLInputElement>(
    root,
    '[data-lab-color-input]',
  );
  colorInput.value = resolveLabColorInputValue(
    state.lab.appearance.backgroundColor,
  );
  colorInput.disabled = !state.lab.appearance.useCustomColor;
  for (const button of query<HTMLButtonElement>(root, '[data-lab-color]')) {
    button.setAttribute(
      'aria-pressed',
      String(
        state.lab.appearance.useCustomColor
        && button.dataset.labColor === state.lab.appearance.backgroundColor,
      ),
    );
  }
}

/** Publish accessible copy feedback without coupling clipboard work to the view. */
export function renderCopyStatus(
  root: HTMLElement,
  message: string,
  status: 'error' | 'success' | 'idle',
): void {
  const output = requireElement<HTMLOutputElement>(root, '[data-copy-status]');
  output.value = message;
  output.dataset.status = status;
}

function query<ElementType extends Element>(
  root: HTMLElement,
  selector: string,
): ElementType[] {
  return [...root.querySelectorAll<ElementType>(selector)];
}

function requireElement<ElementType extends Element>(
  root: HTMLElement,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Missing Lab workbench element: ${selector}`);
  return element;
}
