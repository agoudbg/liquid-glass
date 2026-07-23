import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { bindLabControls } from '../src/shell/lab-controller';
import { PLAYGROUND_MARKUP } from '../src/shell/markup';
import {
  createInitialState,
  transitionPlaygroundScene,
  transitionPlaygroundState,
} from '../src/shell/state';
import { bindWorkbenchTabs } from '../src/shell/tab-controller';
import { PlaygroundShellView } from '../src/shell/view';

describe('Lab shell controls', () => {
  let root: HTMLElement;
  let view: PlaygroundShellView;
  let clipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );
    root = document.createElement('div');
    root.innerHTML = PLAYGROUND_MARKUP;
    document.body.replaceChildren(root);
    view = new PlaygroundShellView(root);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (clipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
    document.body.replaceChildren();
  });

  it('renders derived tabs and the complete compact control inventory', () => {
    const lab = createInitialState(new URL('https://example.test/?scene=S001'));
    view.renderState(lab, false);

    expect(root.querySelector('[data-workbench-tab="lab"]')?.getAttribute(
      'aria-selected',
    )).toBe('true');
    expect(root.querySelector('#workspace')?.getAttribute('role'))
      .toBe('tabpanel');
    expect(root.querySelector('#workspace')?.getAttribute('aria-labelledby'))
      .toBe('workbench-tab-lab');
    expect(requireElement<HTMLElement>(root, '[data-lab-panel]').hidden).toBe(false);
    expect(requireElement<HTMLElement>(root, '[data-fixed-panel]').hidden).toBe(true);
    expect(root.querySelectorAll('[data-lab-number]')).toHaveLength(18);
    expect(root.querySelectorAll('[data-lab-boolean]')).toHaveLength(4);
    expect(root.querySelectorAll('[data-lab-color]')).toHaveLength(4);
    expect(root.querySelectorAll(
      '[data-lab-color][aria-pressed="true"]',
    )).toHaveLength(0);

    const frameworkHost = requireElement<HTMLElement>(
      root,
      '#framework-host',
    );
    const mountedContext = document.createElement('div');
    mountedContext.dataset.labSource = 'canvas';
    frameworkHost.append(mountedContext);

    const materials = transitionPlaygroundScene(lab, 'S004');
    view.renderState(materials, false);
    expect(root.querySelector('[data-workbench-tab="materials"]')?.getAttribute(
      'aria-selected',
    )).toBe('true');
    expect(root.querySelector('#workspace')?.getAttribute('aria-labelledby'))
      .toBe('workbench-tab-materials');
    expect(requireElement<HTMLElement>(root, '[data-lab-panel]').hidden).toBe(true);
    expect(requireElement<HTMLElement>(root, '[data-fixed-panel]').hidden).toBe(false);
    expect(frameworkHost.hasAttribute('aria-pressed')).toBe(false);
    expect(mountedContext.hasAttribute('aria-pressed')).toBe(false);

    const composition = transitionPlaygroundScene(materials, 'S003');
    view.renderState(composition, true);
    expect(root.querySelector('[data-workbench-tab="composition"]')?.getAttribute(
      'aria-selected',
    )).toBe('true');
    expect(root.querySelector('#workspace')?.getAttribute('aria-labelledby'))
      .toBe('workbench-tab-composition');
    expect(requireElement<HTMLButtonElement>(
      root,
      '[data-action="refresh-backdrop"]',
    ).disabled).toBe(false);
  });

  it('supports automatic tab activation with horizontal arrow keys', () => {
    const selected: string[] = [];
    const dispose = bindWorkbenchTabs(root, (tab) => selected.push(tab));
    const lab = requireElement<HTMLButtonElement>(
      root,
      '[data-workbench-tab="lab"]',
    );
    lab.focus();
    lab.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'ArrowLeft',
    }));

    expect(selected).toEqual(['materials']);
    expect(document.activeElement).toBe(root.querySelector(
      '[data-workbench-tab="materials"]',
    ));
    dispose();
  });

  it('binds optics, appearance, interaction, source, reset, and copy actions', async () => {
    let state = createInitialState(new URL('https://example.test/?scene=S001'));
    const render = (): void => view.renderState(state, true);
    const writeText = vi.fn<(value: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    const refreshBackdrop = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const dispose = bindLabControls({
      root,
      getState: () => state,
      updateLab: (lab) => {
        state = transitionPlaygroundState(state, { lab });
        render();
      },
      refreshBackdrop,
      setCopyStatus: (message, status) => view.setCopyStatus(message, status),
    });
    render();

    requireElement<HTMLButtonElement>(
      root,
      '[data-action="refresh-lab-backdrop"]',
    ).click();
    expect(refreshBackdrop).toHaveBeenCalledOnce();

    setRangeValue(root, 'thickness', 62);
    expect(state.lab.optics.thickness).toBe(62);

    const tint = requireElement<HTMLInputElement>(
      root,
      '[data-lab-boolean="useCustomColor"]',
    );
    tint.checked = true;
    tint.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.lab.appearance.useCustomColor).toBe(true);

    requireElement<HTMLButtonElement>(
      root,
      '[data-lab-color="#f5c9ba29"]',
    ).click();
    expect(state.lab.appearance.backgroundColor).toBe('#f5c9ba29');
    expect(root.querySelector(
      '[data-lab-color="#f5c9ba29"]',
    )?.getAttribute('aria-pressed')).toBe('true');

    const preset = requireElement<HTMLSelectElement>(
      root,
      '[data-lab-interaction]',
    );
    preset.value = 'custom';
    preset.dispatchEvent(new Event('change', { bubbles: true }));
    expect(state.lab.interaction.preset).toBe('custom');
    expect(requireElement<HTMLElement>(root, '[data-lab-custom]').hidden).toBe(false);

    requireElement<HTMLButtonElement>(root, '[data-lab-source="dom"]').click();
    expect(state.lab.source.kind).toBe('dom');

    requireElement<HTMLButtonElement>(root, '[data-action="copy-url"]').click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(requireElement<HTMLOutputElement>(root, '[data-copy-status]').value)
      .toBe('URL copied');

    requireElement<HTMLButtonElement>(root, '[data-action="reset-lab"]').click();
    expect(state.lab.optics.thickness).toBe(36);
    expect(state.lab.source.kind).toBe('canvas');

    const fixedState = transitionPlaygroundScene(state, 'S004');
    state = fixedState;
    setRangeValue(root, 'thickness', 75);
    expect(state.lab.optics.thickness).toBe(36);

    dispose();
    state = transitionPlaygroundScene(state, 'S001');
    setRangeValue(root, 'thickness', 71);
    expect(state.lab.optics.thickness).toBe(36);
  });

  it('invalidates delayed copy feedback after edits and newer copies', async () => {
    let state = createInitialState(new URL('https://example.test/?scene=S001'));
    const pendingWrites: Array<{
      reject(reason?: unknown): void;
      resolve(): void;
    }> = [];
    const writeText = vi.fn(() => new Promise<void>((resolve, reject) => {
      pendingWrites.push({ resolve, reject });
    }));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const dispose = bindLabControls({
      root,
      getState: () => state,
      updateLab: (lab) => {
        state = transitionPlaygroundState(state, { lab });
        view.renderState(state, true);
      },
      refreshBackdrop: vi.fn(),
      setCopyStatus: (message, status) => view.setCopyStatus(message, status),
    });
    view.renderState(state, true);
    const copy = requireElement<HTMLButtonElement>(
      root,
      '[data-action="copy-url"]',
    );
    const copyStatus = requireElement<HTMLOutputElement>(
      root,
      '[data-copy-status]',
    );

    copy.click();
    expect(pendingWrites).toHaveLength(1);
    setRangeValue(root, 'thickness', 47);
    requirePendingWrite(pendingWrites, 0).resolve();
    await Promise.resolve();
    expect(copyStatus.value).toBe('');

    copy.click();
    copy.click();
    expect(pendingWrites).toHaveLength(3);
    requirePendingWrite(pendingWrites, 1).reject(new Error('Older copy failed'));
    await Promise.resolve();
    expect(copyStatus.value).toBe('');

    requirePendingWrite(pendingWrites, 2).resolve();
    await vi.waitFor(() => expect(copyStatus.value).toBe('URL copied'));
    dispose();
  });
});

function setRangeValue(
  root: HTMLElement,
  control: string,
  value: number,
): void {
  const input = requireElement<HTMLInputElement>(
    root,
    `[data-lab-number="${control}"]`,
  );
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function requireElement<ElementType extends Element>(
  root: HTMLElement,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

function requirePendingWrite(
  writes: Array<{
    reject(reason?: unknown): void;
    resolve(): void;
  }>,
  index: number,
): {
  reject(reason?: unknown): void;
  resolve(): void;
} {
  const write = writes[index];
  if (!write) throw new Error(`Missing pending clipboard write: ${String(index)}`);
  return write;
}
