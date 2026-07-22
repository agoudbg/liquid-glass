import type {
  BackdropSourceHandle,
  DomBackdropSourceConfig,
  GlassContext,
} from '@agou/liquid-glass-core';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('React DOM backdrop converter', () => {
  it('preserves its registration, updates options, refreshes, and cleans up', async () => {
    const harness = createHarness();
    const apiRef = createRef<BackdropConverterHandle>();
    const view = (updated: boolean) => (
      <LiquidGlassContext.Provider value={{ context: harness.context }}>
        <BackdropConverter
          ref={apiRef}
          backgroundColor="#102030"
          captureLibrary={updated ? 'html-to-image' : 'html2canvas'}
          scale={updated ? 1 : 2}
          viewportCapture={updated ? false : { bufferY: 120, enabled: true }}
          watchNodeChanges={updated}
          watchPositionChanges={updated}
          watchResize={updated}
          zIndex={updated ? 8 : 4}
        >
          <span data-testid="capture-content">Captured content</span>
        </BackdropConverter>
      </LiquidGlassContext.Provider>
    );
    const mounted = render(view(false));

    await waitFor(() => {
      expect(harness.addBackdropSource).toHaveBeenCalledTimes(1);
    });
    expect(mounted.getByTestId('capture-content').textContent).toBe('Captured content');
    expect(harness.addBackdropSource).toHaveBeenCalledWith({
      backgroundColor: '#102030',
      captureLibrary: 'html2canvas',
      element: mounted.getByTestId('capture-content').parentElement,
      kind: 'dom',
      scale: 2,
      viewportCapture: { bufferY: 120, enabled: true },
      watchNodeChanges: false,
      watchPositionChanges: false,
      watchResize: false,
      zIndex: 4,
    });

    apiRef.current?.refresh();
    expect(harness.handle.refresh).toHaveBeenCalledTimes(1);
    expect(apiRef.current?.getHandle()).toBe(harness.handle);

    mounted.rerender(view(true));
    await waitFor(() => {
      expect(harness.handle.update).toHaveBeenCalledTimes(1);
    });
    expect(harness.addBackdropSource).toHaveBeenCalledTimes(1);
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
    expect(apiRef.current?.getHandle()).toBe(harness.handle);

    mounted.unmount();
    expect(harness.destroy).toHaveBeenCalledTimes(1);
    expect(apiRef.current).toBeNull();
  });
});
