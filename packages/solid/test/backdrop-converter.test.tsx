import type {
  BackdropSourceHandle,
  DomBackdropSourceConfig,
  GlassContext,
} from '@agou/liquid-glass-core';
import type { JSX } from 'solid-js';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackdropConverter } from '../src/BackdropConverter';
import { LiquidGlassContext } from '../src/LiquidGlassContext';
import type { BackdropConverterHandle } from '../src/types';

function createHarness() {
  let destroyed = false;
  const destroy = vi.fn<BackdropSourceHandle<DomBackdropSourceConfig>['destroy']>(() => {
    destroyed = true;
  });
  const handle: BackdropSourceHandle<DomBackdropSourceConfig> = {
    id: 'dom-backdrop-1',
    get destroyed() {
      return destroyed;
    },
    destroy,
    refresh: vi.fn(),
    update: vi.fn(),
  };
  const addBackdropSource = vi.fn((_config: DomBackdropSourceConfig) => handle);
  const context = { addBackdropSource } as unknown as GlassContext;
  return { addBackdropSource, context, destroy, handle };
}

const disposers: Array<() => void> = [];

function mountSolid(view: () => JSX.Element): { dispose: () => void; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.append(host);
  const disposeRoot = render(view, host);
  const dispose = () => {
    disposeRoot();
    host.remove();
  };
  disposers.push(dispose);
  return { dispose, host };
}

afterEach(() => {
  while (disposers.length > 0) {
    disposers.pop()?.();
  }
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('Solid DOM backdrop converter', () => {
  it('preserves its registration, updates options, refreshes, and cleans up', async () => {
    const harness = createHarness();
    const apis: Array<BackdropConverterHandle | null> = [];
    let setUpdated: ((updated: boolean) => void) | undefined;
    const mounted = mountSolid(() => {
      const [updated, update] = createSignal(false);
      setUpdated = update;
      return (
        <LiquidGlassContext.Provider value={{ context: () => harness.context }}>
          <BackdropConverter
            apiRef={(handle) => apis.push(handle)}
            backgroundColor="#102030"
            captureLibrary={updated() ? 'html-to-image' : 'html2canvas'}
            scale={updated() ? 1 : 2}
            viewportCapture={updated() ? false : { bufferY: 120, enabled: true }}
            watchNodeChanges={updated()}
            watchPositionChanges={updated()}
            watchResize={updated()}
            zIndex={updated() ? 8 : 4}
          >
            <span data-capture-content>Captured content</span>
          </BackdropConverter>
        </LiquidGlassContext.Provider>
      );
    });
    await Promise.resolve();

    const content = mounted.host.querySelector('[data-capture-content]');
    const api = apis.find((handle): handle is BackdropConverterHandle => handle !== null);
    expect(content?.textContent).toBe('Captured content');
    expect(harness.addBackdropSource).toHaveBeenCalledTimes(1);
    expect(harness.addBackdropSource).toHaveBeenCalledWith({
      backgroundColor: '#102030',
      captureLibrary: 'html2canvas',
      element: content?.parentElement,
      kind: 'dom',
      scale: 2,
      viewportCapture: { bufferY: 120, enabled: true },
      watchNodeChanges: false,
      watchPositionChanges: false,
      watchResize: false,
      zIndex: 4,
    });

    api?.refresh();
    expect(harness.handle.refresh).toHaveBeenCalledTimes(1);
    expect(api?.getHandle()).toBe(harness.handle);
    if (!setUpdated) {
      throw new Error('The Solid converter update setter was not initialized.');
    }

    setUpdated(true);
    await Promise.resolve();

    expect(harness.addBackdropSource).toHaveBeenCalledTimes(1);
    expect(harness.handle.update).toHaveBeenCalledTimes(1);
    expect(harness.handle.update).toHaveBeenLastCalledWith({
      backgroundColor: '#102030',
      captureLibrary: 'html-to-image',
      scale: 1,
      viewportCapture: false,
      watchNodeChanges: true,
      watchPositionChanges: true,
      watchResize: true,
      zIndex: 8,
    });
    expect(api?.getHandle()).toBe(harness.handle);

    mounted.dispose();
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(apis[apis.length - 1]).toBeNull();
  });
});
