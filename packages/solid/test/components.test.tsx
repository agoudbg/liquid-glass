import type {
  GlassContextOptions,
} from '@agou/liquid-glass-core';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LiquidGlass } from '../src/LiquidGlass';
import { LiquidGlassMaterial } from '../src/LiquidGlassMaterial';
import type {
  LiquidGlassHandle,
  LiquidGlassMaterialHandle,
} from '../src/types';
import {
  cleanupSolidHarnesses,
  createContextHarness,
  createEngineHarness,
  mountSolid,
} from './fixtures/component-harness';

afterEach(() => {
  cleanupSolidHarnesses();
});

describe('Solid adapter lifecycle', () => {
  it('renders a direct scrollable content layer for core ownership', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    mountSolid(() => (
      <LiquidGlass
        engine={engineHarness.engine}
        options={{ scrollable: true }}
      >
        <span data-testid="content">Content</span>
      </LiquidGlass>
    ));
    await Promise.resolve();

    const container = document.querySelector('.liquid-glass-container');
    const content = container?.querySelector(
      ':scope > .liquid-glass-content.scrollable',
    );
    expect(content).not.toBeNull();
    expect(content?.querySelector('[data-testid="content"]')).not.toBeNull();
    expect(engineHarness.createContext.mock.calls[0]?.[0]).toBe(container);
  });

  it('preserves fallback blur defaults and explicit zero values', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    mountSolid(() => (
      <LiquidGlass engine={engineHarness.engine}>
        <LiquidGlassMaterial>Default blur</LiquidGlassMaterial>
        <LiquidGlassMaterial blur={0}>No blur</LiquidGlassMaterial>
        <LiquidGlassMaterial blur={12}>Capped blur</LiquidGlassMaterial>
      </LiquidGlass>
    ));
    await Promise.resolve();

    const materials = Array.from(
      document.querySelectorAll<HTMLElement>('.liquid-glass-material'),
    );
    expect(materials.map((material) => (
      material.style.getPropertyValue('--lg-fallback-blur')
    ))).toEqual(['6px', '0px', '6px']);
    expect(materials[0]?.querySelector(
      ':scope > .liquid-glass-content',
    )).toBeNull();
    expect(materials[0]?.textContent).toContain('Default blur');

    expect(contextHarness.addMaterial.mock.calls.map(([config]) => config.blur)).toEqual([
      undefined,
      0,
      12,
    ]);
    expect(contextHarness.material.handle.update).toHaveBeenCalledWith(
      expect.objectContaining({ blur: undefined }),
    );
    expect(contextHarness.material.handle.update).toHaveBeenCalledWith(
      expect.objectContaining({ blur: 0 }),
    );
  });

  it('updates options without replacing the context or material registration', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const materialApis: Array<LiquidGlassMaterialHandle | null> = [];
    let setOptions: ((options: GlassContextOptions) => void) | undefined;
    const dispose = mountSolid(() => {
      const [options, updateOptions] = createSignal<GlassContextOptions>({ renderPrecision: 1 });
      setOptions = (nextOptions) => updateOptions(nextOptions);
      return (
        <LiquidGlass engine={engineHarness.engine} options={options()}>
          <LiquidGlassMaterial
            apiRef={(handle) => materialApis.push(handle)}
            radius={20}
          >
            Glass content
          </LiquidGlassMaterial>
        </LiquidGlass>
      );
    });
    await Promise.resolve();

    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
    const materialApi = materialApis.find(
      (handle): handle is LiquidGlassMaterialHandle => handle !== null,
    );
    const initialRegistration = materialApi?.getHandle();
    expect(initialRegistration?.id).toBe('material-1');
    const initialOptionUpdates = contextHarness.updateOptions.mock.calls.length;
    if (!setOptions) {
      throw new Error('The Solid options setter was not initialized.');
    }

    setOptions({ renderPrecision: 0.5 });
    await Promise.resolve();

    expect(contextHarness.updateOptions).toHaveBeenCalledTimes(initialOptionUpdates + 1);
    expect(contextHarness.updateOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ renderPrecision: 0.5 }),
    );
    expect(engineHarness.createContext).toHaveBeenCalledTimes(1);
    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
    expect(materialApi?.getHandle()).toBe(initialRegistration);
    expect(contextHarness.material.destroy).not.toHaveBeenCalled();

    dispose();

    expect(contextHarness.material.destroy).toHaveBeenCalledTimes(1);
    expect(contextHarness.destroy).toHaveBeenCalledTimes(1);
    expect(engineHarness.destroy).not.toHaveBeenCalled();
  });

  it('clears container and material apiRef callbacks during disposal', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const containerApis: Array<LiquidGlassHandle | null> = [];
    const materialApis: Array<LiquidGlassMaterialHandle | null> = [];
    const dispose = mountSolid(() => (
      <LiquidGlass
        apiRef={(handle) => containerApis.push(handle)}
        engine={engineHarness.engine}
      >
        <LiquidGlassMaterial apiRef={(handle) => materialApis.push(handle)} />
      </LiquidGlass>
    ));
    await Promise.resolve();

    expect(containerApis.some((handle) => handle !== null)).toBe(true);
    expect(materialApis.some((handle) => handle !== null)).toBe(true);

    dispose();

    expect(containerApis[containerApis.length - 1]).toBeNull();
    expect(materialApis[materialApis.length - 1]).toBeNull();
  });

  it('propagates onReady exceptions without reporting a context creation error', () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const failure = new Error('consumer onReady failure');
    const onError = vi.fn<(error: unknown) => void>();
    let thrown: unknown;

    try {
      mountSolid(() => (
        <LiquidGlass
          engine={engineHarness.engine}
          onError={onError}
          onReady={() => {
            throw failure;
          }}
        />
      ));
    } catch (error: unknown) {
      thrown = error;
    }

    expect(onError).not.toHaveBeenCalled();
    expect(thrown).toBe(failure);
  });

});
