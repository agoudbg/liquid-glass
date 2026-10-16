import {
  createDefaultLabState,
  isLabBooleanControl,
  isLabEdgeStyle,
  isLabInteractionPreset,
  isLabNumericControl,
  isLabSourceKind,
  updateLabBooleanControl,
  updateLabColor,
  updateLabEdgeStyle,
  updateLabInteractionPreset,
  updateLabNumericControl,
  updateLabSourceKind,
} from '../shared/lab-state';
import { isLabSceneEditable } from '../shared/scene-render-options';
import type {
  LabState,
  PlaygroundState,
} from '../shared/types';

/** Shell seams required by the isolated Lab control binder. */
export interface LabControlBindings {
  /** Static shell root containing Lab controls. */
  root: HTMLElement;
  /** Read the latest immutable state at event time. */
  getState(): PlaygroundState;
  /** Commit a complete immutable Lab replacement. */
  updateLab(lab: LabState): void;
  /** Refresh the active backdrop source when available. */
  refreshBackdrop(): void;
  /** Publish accessible copy feedback. */
  setCopyStatus(
    message: string,
    status: 'error' | 'success' | 'idle',
  ): void;
}

/** Bind every Lab control and return one idempotent listener disposer. */
export function bindLabControls(bindings: LabControlBindings): () => void {
  const disposers: Array<() => void> = [];
  let copyRequestVersion = 0;
  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ): void => {
    target.addEventListener(type, listener);
    disposers.push(() => target.removeEventListener(type, listener));
  };
  const updateWhenEditable = (
    transition: (state: Readonly<LabState>) => LabState,
  ): void => {
    const state = bindings.getState();
    if (!isLabSceneEditable(state)) return;
    copyRequestVersion += 1;
    bindings.setCopyStatus('', 'idle');
    bindings.updateLab(transition(state.lab));
  };
  const copyCurrentUrl = async (): Promise<void> => {
    const requestVersion = copyRequestVersion + 1;
    copyRequestVersion = requestVersion;
    bindings.setCopyStatus('', 'idle');
    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API is unavailable.');
      }
      await navigator.clipboard.writeText(window.location.href);
      if (requestVersion !== copyRequestVersion) return;
      bindings.setCopyStatus('URL copied', 'success');
    } catch {
      if (requestVersion !== copyRequestVersion) return;
      bindings.setCopyStatus('Copy failed', 'error');
    }
  };

  for (const input of query<HTMLInputElement>(
    bindings.root,
    '[data-lab-number]',
  )) {
    listen(input, 'input', () => {
      const control = input.dataset.labNumber;
      const value = Number(input.value);
      if (!control || !isLabNumericControl(control) || !Number.isFinite(value)) {
        return;
      }
      updateWhenEditable((lab) => updateLabNumericControl(lab, control, value));
    });
  }

  for (const input of query<HTMLInputElement>(
    bindings.root,
    '[data-lab-boolean]',
  )) {
    listen(input, 'change', () => {
      const control = input.dataset.labBoolean;
      if (!control || !isLabBooleanControl(control)) return;
      updateWhenEditable(
        (lab) => updateLabBooleanControl(lab, control, input.checked),
      );
    });
  }

  const interaction = requireElement<HTMLSelectElement>(
    bindings.root,
    '[data-lab-interaction]',
  );
  listen(interaction, 'change', () => {
    const preset = interaction.value;
    if (!isLabInteractionPreset(preset)) return;
    updateWhenEditable(
      (lab) => updateLabInteractionPreset(lab, preset),
    );
  });

  const edgeStyle = requireElement<HTMLSelectElement>(
    bindings.root,
    '[data-lab-edge-style]',
  );
  listen(edgeStyle, 'change', () => {
    const value = edgeStyle.value;
    if (!isLabEdgeStyle(value)) return;
    updateWhenEditable((lab) => updateLabEdgeStyle(lab, value));
  });

  for (const button of query<HTMLButtonElement>(
    bindings.root,
    'button[data-lab-source]',
  )) {
    listen(button, 'click', () => {
      const kind = button.dataset.labSource;
      if (!kind || !isLabSourceKind(kind)) return;
      updateWhenEditable((lab) => updateLabSourceKind(lab, kind));
    });
  }

  for (const button of query<HTMLButtonElement>(
    bindings.root,
    '[data-lab-color]',
  )) {
    listen(button, 'click', () => {
      const color = button.dataset.labColor;
      if (!color) return;
      updateWhenEditable((lab) => updateLabColor(lab, color));
    });
  }

  const colorInput = requireElement<HTMLInputElement>(
    bindings.root,
    '[data-lab-color-input]',
  );
  listen(colorInput, 'input', () => {
    updateWhenEditable((lab) => updateLabColor(lab, colorInput.value));
  });

  listen(
    requireElement<HTMLButtonElement>(bindings.root, '[data-action="reset-lab"]'),
    'click',
    () => updateWhenEditable(() => createDefaultLabState()),
  );
  listen(
    requireElement<HTMLButtonElement>(
      bindings.root,
      '[data-action="refresh-lab-backdrop"]',
    ),
    'click',
    () => bindings.refreshBackdrop(),
  );
  listen(
    requireElement<HTMLButtonElement>(bindings.root, '[data-action="copy-url"]'),
    'click',
    () => void copyCurrentUrl(),
  );

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    copyRequestVersion += 1;
    for (const dispose of disposers.splice(0)) dispose();
  };
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
  if (!element) throw new Error(`Missing Lab control: ${selector}`);
  return element;
}
