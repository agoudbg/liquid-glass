import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  calculateOriginShift,
  calculateStretch,
  createButtonEngine,
  createCustomEngine,
  InteractionEngine,
  isSpringAtRest,
  springStep,
} from '../../src/interaction';

afterEach(() => {
  vi.useRealTimers();
});

describe('interaction math', () => {
  it('uses the legacy semi-implicit spring step', () => {
    expect(springStep(0, 1, 0, {
      stiffness: 180,
      damping: 18,
      mass: 1,
    }, 1 / 60)).toEqual({
      value: 0.05,
      velocity: 3,
    });
    expect(isSpringAtRest(1.0005, 1, 0.0005)).toBe(true);
    expect(isSpringAtRest(1.002, 1, 0)).toBe(false);
  });

  it('normalizes and clamps stretch independently per axis', () => {
    expect(calculateStretch(50, -20, 0.01, 0.3, 100, 100)).toEqual({
      stretchX: 0.3,
      stretchY: 0.2,
    });
    expect(calculateStretch(2, -3, 0.1, 1, 0, 0)).toEqual({
      stretchX: 1,
      stretchY: 1,
    });
  });

  it('moves and clamps transform origins opposite the drag', () => {
    expect(calculateOriginShift(60, -60, 240, 120, 0.5)).toEqual({
      originX: 37.5,
      originY: 75,
    });
    expect(calculateOriginShift(2_000, -2_000, 100, 100, 1)).toEqual({
      originX: -100,
      originY: 200,
    });
  });
});

describe('interaction factories', () => {
  it('applies preset overrides without mutating the preset', () => {
    const engine = createButtonEngine({ activeScale: 1.2 });
    const untouched = createButtonEngine();

    expect(engine.getConfig().activeScale).toBe(1.2);
    expect(engine.getConfig().preset).toBe('button');
    expect(untouched.getConfig().activeScale).toBe(1.05);
  });

  it('isolates nested spring configs from inputs and returned snapshots', () => {
    const activeSpring = { stiffness: 240, damping: 16, mass: 1 };
    const releaseSpring = { stiffness: 180, damping: 12, mass: 1 };
    const engine = createButtonEngine({ activeSpring });

    activeSpring.stiffness = 1;
    engine.setConfig({ releaseSpring });
    releaseSpring.damping = 1;
    const snapshot = engine.getConfig();
    snapshot.activeSpring.stiffness = 2;
    snapshot.releaseSpring.damping = 2;

    expect(engine.getConfig().activeSpring).toEqual({
      stiffness: 240,
      damping: 16,
      mass: 1,
    });
    expect(engine.getConfig().releaseSpring).toEqual({
      stiffness: 180,
      damping: 12,
      mass: 1,
    });
    expect(createButtonEngine().getConfig().activeSpring.stiffness).toBe(180);
    engine.destroy();
  });

  it('preserves the legacy custom factory and custom preset lookup behavior', () => {
    expect(createCustomEngine({ preset: 'custom' }).getConfig().preset).toBe('custom');
    expect(new InteractionEngine('custom').getConfig().preset).toBe('button');
  });

  it('distinguishes release while hovered from leaving the material', () => {
    const engine = createButtonEngine();
    engine.onPointerEnter({
      clientX: 20,
      clientY: 10,
      pointerType: 'mouse',
    });
    engine.onPointerDown({ clientX: 20, clientY: 10, pointerId: 1 });
    engine.onPointerUp();

    expect(engine.getState()).toMatchObject({
      isPointerDown: false,
      isHovering: true,
      phase: 'releasing',
    });
    expect(engine.isAtRest()).toBe(false);

    engine.onPointerLeave();
    expect(engine.getState()).toMatchObject({
      isPointerDown: false,
      isHovering: false,
      phase: 'releasing',
    });
    engine.destroy();
  });

  it('accepts active updates only from the pointer that owns the gesture', () => {
    const engine = createButtonEngine();
    engine.setElementSize(200, 100);
    engine.onPointerDown({ clientX: 40, clientY: 30, pointerId: 11 });
    const externalState = engine.getState();
    if (!externalState.pointerOrigin) {
      throw new Error('Expected an active pointer origin.');
    }
    externalState.pointerOrigin.x = 999;
    expect(engine.getState().pointerOrigin).toEqual({ x: 40, y: 30 });
    const ownedTargets = engine.getState();

    engine.onPointerDown({ clientX: 180, clientY: 80, pointerId: 12 });
    engine.onPointerEnter({
      clientX: 180,
      clientY: 80,
      pointerId: 12,
      pointerType: 'mouse',
    });
    engine.onPointerMove({ clientX: 180, clientY: 80, pointerId: 12 });
    expect(engine.getState()).toMatchObject({
      pointerId: 11,
      pointerOrigin: { x: 40, y: 30 },
      targetScaleX: ownedTargets.targetScaleX,
      targetScaleY: ownedTargets.targetScaleY,
      targetTranslateX: ownedTargets.targetTranslateX,
      targetTranslateY: ownedTargets.targetTranslateY,
    });

    engine.onPointerUp(12);
    expect(engine.getState().isPointerDown).toBe(true);

    engine.onPointerUp(11);
    expect(engine.getState()).toMatchObject({
      isPointerDown: false,
      pointerId: undefined,
      phase: 'releasing',
    });
    engine.destroy();
  });

  it('keeps button hover scale while idle return recenters translation', () => {
    vi.useFakeTimers();
    const engine = createButtonEngine();
    engine.onPointerEnter({
      clientX: 10,
      clientY: 10,
      pointerType: 'mouse',
    });
    engine.onPointerMove({
      clientX: 110,
      clientY: 60,
      pointerType: 'mouse',
    });

    expect(engine.getState()).toMatchObject({
      targetScaleX: 1.02,
      targetScaleY: 1.02,
      targetTranslateX: 8,
      targetTranslateY: 4,
    });
    vi.advanceTimersByTime(500);
    expect(engine.getState()).toMatchObject({
      targetScaleX: 1.02,
      targetScaleY: 1.02,
      targetTranslateX: 0,
      targetTranslateY: 0,
    });
    engine.destroy();
  });

  it('partially returns context-menu targets while the pointer remains held', () => {
    vi.useFakeTimers();
    const engine = new InteractionEngine('context-menu');
    engine.setElementSize(240, 120);
    engine.onPointerDown({ clientX: 100, clientY: 60, pointerId: 1 });
    engine.onPointerMove({ clientX: 180, clientY: 20, pointerId: 1 });
    const active = engine.getState();

    vi.advanceTimersByTime(500);
    const returning = engine.getState();
    expect(returning.isPointerDown).toBe(true);
    expect(returning.targetScaleX).toBe(
      1.01 + (active.targetScaleX - 1.01) * 0.5,
    );
    expect(returning.targetScaleY).toBe(
      1.01 + (active.targetScaleY - 1.01) * 0.5,
    );
    expect(returning.targetTranslateX).toBe(active.targetTranslateX * 0.5);
    expect(returning.targetTranslateY).toBe(active.targetTranslateY * 0.5);
    expect(returning.targetOriginX).toBe(
      50 + (active.targetOriginX - 50) * 0.5,
    );
    expect(returning.targetOriginY).toBe(
      50 + (active.targetOriginY - 50) * 0.5,
    );
    engine.destroy();
  });

  it('applies and releases active opacity and background targets', () => {
    const engine = createButtonEngine({
      activeOpacity: 0.4,
      enableOpacityTransition: true,
      activeBackgroundColor: 'transparent',
      enableBackgroundTransition: true,
    });
    engine.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1 });

    expect(engine.getState()).toMatchObject({
      targetOpacity: 0.4,
      backgroundColor: 'transparent',
      targetBackgroundColor: 'transparent',
    });
    expect(engine.step(0)).toMatchObject({
      opacity: 1,
      backgroundColor: 'transparent',
      isActive: true,
    });

    engine.onPointerUp();
    expect(engine.getState()).toMatchObject({
      targetOpacity: 1,
      backgroundColor: null,
      targetBackgroundColor: null,
    });
    expect(engine.step(1000)).toMatchObject({
      backgroundColor: null,
      isActive: false,
    });
    engine.destroy();
  });

  it('keeps animating until an opacity transition has settled', () => {
    const engine = createButtonEngine({
      activeOpacity: 0.4,
      activeScale: 1,
      enableOpacityTransition: true,
      enableOriginShift: false,
      maxTranslate: 0,
      maxTranslateY: 0,
      stretchFactor: 0,
      stretchLimit: 0,
      translateFactor: 0,
    });
    engine.setElementSize(200, 100);
    engine.onPointerDown({ clientX: 20, clientY: 20, pointerId: 1 });
    engine.step(0);
    engine.step(16);
    engine.onPointerUp(1);

    const releasing = engine.step(32);
    expect(releasing.opacity).toBeLessThan(1);
    expect(engine.getPhase()).toBe('releasing');
    expect(engine.isAtRest()).toBe(false);
    engine.destroy();
  });
});
