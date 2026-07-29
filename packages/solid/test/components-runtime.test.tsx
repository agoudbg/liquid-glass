import type {
  CustomDrawCallback,
  ProxyTargetInterface,
} from '@agou/liquid-glass-core';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackdropCanvas } from '../src/BackdropCanvas';
import { LiquidGlass } from '../src/LiquidGlass';
import { LiquidGlassMaterial } from '../src/LiquidGlassMaterial';
import {
  cleanupSolidHarnesses,
  createContextHarness,
  createEngineHarness,
  createPresentation,
  dispatchPointer,
  materialRect,
  mountSolid,
} from './fixtures/component-harness';

afterEach(() => {
  cleanupSolidHarnesses();
});

describe('Solid adapter runtime behavior', () => {
  it('samples a nested context through the nearest parent lifecycle', async () => {
    const parentHarness = createContextHarness();
    const childHarness = createContextHarness();
    const parentEngine = createEngineHarness(parentHarness.context);
    const childEngine = createEngineHarness(childHarness.context);
    const dispose = mountSolid(() => (
      <LiquidGlass engine={parentEngine.engine}>
        <LiquidGlass engine={childEngine.engine} />
      </LiquidGlass>
    ));

    await Promise.resolve();
    await Promise.resolve();

    expect(parentHarness.addBackdropSource).toHaveBeenCalledTimes(1);
    const containers = document.querySelectorAll('.liquid-glass-container');
    expect(parentHarness.addBackdropSource).toHaveBeenCalledWith(
      expect.objectContaining({
        boundsElement: containers[1],
        kind: 'canvas',
        watchPositionChanges: true,
        watchResize: true,
      }),
    );
    expect(childHarness.refresh).toHaveBeenCalledWith('structural');

    dispose();
    expect(parentHarness.backdrop.destroy).toHaveBeenCalledTimes(1);
  });

  it('updates a backdrop draw callback without an additional explicit refresh', async () => {
    const drawingContext = {
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawingContext);
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const firstDraw = vi.fn<CustomDrawCallback>();
    const nextDraw = vi.fn<CustomDrawCallback>();
    let setDraw: ((draw: CustomDrawCallback) => void) | undefined;
    mountSolid(() => {
      const [draw, updateDraw] = createSignal<CustomDrawCallback>(firstDraw);
      setDraw = (next) => updateDraw(() => next);
      return (
        <LiquidGlass engine={engineHarness.engine}>
          <BackdropCanvas draw={draw()} zIndex={3} />
        </LiquidGlass>
      );
    });
    await Promise.resolve();

    expect(contextHarness.addBackdropSource).toHaveBeenCalledTimes(1);
    contextHarness.backdrop.update.mockClear();
    contextHarness.backdrop.refresh.mockClear();
    if (!setDraw) {
      throw new Error('The Solid draw setter was not initialized.');
    }

    setDraw(nextDraw);
    await Promise.resolve();

    expect(contextHarness.backdrop.update).toHaveBeenCalledTimes(1);
    expect(contextHarness.backdrop.update).toHaveBeenLastCalledWith({
      draw: nextDraw,
      zIndex: 3,
    });
    expect(contextHarness.backdrop.refresh).not.toHaveBeenCalled();
  });

  it('forwards native pointers without replacing consumer handlers and syncs policy', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const consumerPointerDown = vi.fn();
    let setDisabled: ((disabled: boolean) => void) | undefined;
    mountSolid(() => {
      const [disabled, updateDisabled] = createSignal(false);
      setDisabled = updateDisabled;
      return (
        <LiquidGlass engine={engineHarness.engine}>
          <LiquidGlassMaterial
            disableInteractions={disabled()}
            isMoveable={disabled()}
            onPointerDown={consumerPointerDown}
            renderMode="dedicated"
          />
        </LiquidGlass>
      );
    });
    await Promise.resolve();
    const material = document.querySelector<HTMLElement>('.liquid-glass-material');
    if (!material || !setDisabled) throw new Error('Material did not mount.');
    material.getBoundingClientRect = materialRect;
    material.setPointerCapture = vi.fn();
    expect(material.getAttribute('disable-interactions')).toBe('false');
    expect(material.getAttribute('only-click-interactions')).toBe('false');
    expect(material.getAttribute('render-mode')).toBe('dedicated');
    expect(contextHarness.addMaterial).toHaveBeenCalledWith(expect.objectContaining({ isMoveable: false }));

    dispatchPointer(material, 'pointerdown');
    expect(consumerPointerDown).toHaveBeenCalledTimes(1);
    expect(contextHarness.material.setInteractionState).toHaveBeenCalledWith(
      expect.objectContaining({
        pointerState: expect.objectContaining({
          isActive: true,
          normalizedX: 0.5,
          normalizedY: 0.5,
        }),
      }),
    );
    setDisabled(true);
    await Promise.resolve();
    expect(material.getAttribute('disable-interactions')).toBe('true');
    dispatchPointer(material, 'pointerdown', { pointerId: 2 });
    expect(consumerPointerDown).toHaveBeenCalledTimes(2);
    expect(contextHarness.material.setInteractionState).toHaveBeenCalledTimes(1);
    expect(contextHarness.material.handle.update).toHaveBeenLastCalledWith(expect.objectContaining({ isMoveable: true }));
    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
  });

  it('preserves proxy target identity across reactive updates and clears it in place', async () => {
    const firstTarget: ProxyTargetInterface = {
      getContainerRect: () => null,
      getScrollPosition: () => ({ x: 0, y: 0 }),
      registerExternalMaterial: () => {
        throw new Error('The adapter harness must not register proxy materials.');
      },
    };
    const secondTarget: ProxyTargetInterface = {
      ...firstTarget,
      getScrollPosition: () => ({ x: 4, y: 8 }),
    };
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    let setTarget: ((target: ProxyTargetInterface | undefined) => void) | undefined;
    mountSolid(() => {
      const [target, updateTarget] = createSignal<
        ProxyTargetInterface | undefined
      >(firstTarget);
      setTarget = updateTarget;
      return (
        <LiquidGlass engine={engineHarness.engine}>
          <LiquidGlassMaterial proxyTarget={target()} />
        </LiquidGlass>
      );
    });
    await Promise.resolve();
    if (!setTarget) throw new Error('The proxy target setter was not initialized.');

    expect(contextHarness.addMaterial).toHaveBeenCalledWith(
      expect.objectContaining({ proxyTarget: firstTarget }),
    );

    setTarget(secondTarget);
    await Promise.resolve();
    expect(contextHarness.material.handle.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ proxyTarget: secondTarget }),
    );

    setTarget(undefined);
    await Promise.resolve();
    expect(contextHarness.material.handle.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ proxyTarget: undefined }),
    );
    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);
  });

  it('applies presentation frames directly and fully cleans up the subscription', async () => {
    const contextHarness = createContextHarness();
    const engineHarness = createEngineHarness(contextHarness.context);
    const childRender = vi.fn(() => <span>Stable child</span>);
    let setColor: ((color: string) => void) | undefined;
    const dispose = mountSolid(() => {
      const [color, updateColor] = createSignal('#123456');
      setColor = updateColor;
      return (
        <LiquidGlass engine={engineHarness.engine}>
          <LiquidGlassMaterial
            backgroundColor={color()}
            blur={12}
            children={childRender}
            radius={20}
            radiusTR={4}
            thickness={14}
            useCustomColor
          />
        </LiquidGlass>
      );
    });
    await Promise.resolve();
    const material = document.querySelector<HTMLElement>('.liquid-glass-material');
    const highlight = material?.querySelector<HTMLElement>('.liquid-glass-highlight');
    if (!material || !highlight || !setColor) throw new Error('Material did not mount.');
    expect(material.style.getPropertyValue('--lg-border-radius')).toBe('20px 4px 20px 20px');
    expect(material.style.getPropertyValue('--lg-fallback-blur')).toBe('6px');
    expect(material.style.getPropertyValue('--lg-background-tint')).toBe('#123456');

    const active = createPresentation();
    for (let frame = 1; frame <= 4; frame += 1) {
      contextHarness.material.emitPresentation({
        ...active,
        blurred: true,
        interactionOutput: {
          ...active.interactionOutput,
          highlightVisible: true,
          scaleX: 1.1,
          translateX: frame * 3,
        },
      });
    }
    expect(material.style.getPropertyValue('--lg-scale-x')).toBe('1.1');
    expect(material.style.getPropertyValue('--lg-translate-x')).toBe('12px');
    expect(material.getAttribute('is-blurred')).toBe('true');
    expect(highlight.classList.contains('visible')).toBe(true);
    expect(childRender).toHaveBeenCalledTimes(1);
    expect(contextHarness.addMaterial).toHaveBeenCalledTimes(1);

    setColor('#abcdef');
    await Promise.resolve();
    expect(material.style.getPropertyValue('--lg-background-tint')).toBe('#abcdef');
    dispose();
    expect(contextHarness.material.unsubscribe).toHaveBeenCalledTimes(1);
    expect(contextHarness.material.listenerCount()).toBe(0);
    expect(contextHarness.material.destroy).toHaveBeenCalledTimes(1);
    expect(material.hasAttribute('is-blurred')).toBe(false);
    expect(highlight.classList.contains('visible')).toBe(false);
  });
});
