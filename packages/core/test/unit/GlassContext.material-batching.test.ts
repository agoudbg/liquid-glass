import { describe, expect, it, vi } from 'vitest';

import type { MaterialChanges } from '../../src/types';
import { callsNamed } from '../fixtures/fake-webgl2';
import {
  addHarnessMaterial,
  latestUniformValue,
  mountMaterialContext,
} from '../fixtures/material-context';

describe('GlassContext material update batching', () => {
  it('coalesces fifty optical updates into one event and cached-texture draw', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const updates = vi.fn();
    const renders = vi.fn();
    context.on('materialUpdated', updates);
    context.on('materialsRendered', renders);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;
    const uploads = callsNamed(gl, 'texImage2D').length;
    const mipmaps = callsNamed(gl, 'generateMipmap').length;

    for (let index = 0; index < 50; index += 1) {
      handle.update({ radius: 13 + index });
    }

    expect(updates).not.toHaveBeenCalled();
    expect(harness.frames.size).toBe(1);
    harness.flushFrame();

    expect(updates).toHaveBeenCalledOnce();
    expect(updates).toHaveBeenCalledWith(handle.id, { radius: 62 });
    expect(renders).toHaveBeenCalledOnce();
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws + 1);
    expect(callsNamed(gl, 'texImage2D')).toHaveLength(uploads);
    expect(callsNamed(gl, 'generateMipmap')).toHaveLength(mipmaps);
    context.destroy();
  });

  it('keeps first-dirty material order and final own undefined values', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const first = addHarnessMaterial(
      mounted,
      { x: 30, y: 30, width: 120, height: 70 },
    );
    const second = addHarnessMaterial(
      mounted,
      { x: 190, y: 40, width: 110, height: 80 },
    );
    const updates: Array<readonly [string, MaterialChanges]> = [];
    const renders = vi.fn();
    context.on('materialUpdated', (id, changes) => updates.push([id, changes]));
    context.on('materialsRendered', renders);

    first.update({
      interactionConfig: { hoverFollowFactor: 0.5 },
      radius: 13,
    });
    second.update({ blur: 2 });
    first.update({ interactionConfig: undefined, radius: 12 });
    harness.flushFrame();

    expect(updates).toEqual([
      [first.id, { interactionConfig: undefined, radius: 12 }],
      [second.id, { blur: 2 }],
    ]);
    expect(Object.prototype.hasOwnProperty.call(
      updates[0]?.[1] ?? {},
      'interactionConfig',
    )).toBe(true);
    expect(renders).toHaveBeenCalledOnce();
    context.destroy();
  });

  it('keeps a valid batch unchanged after a no-op and invalid update', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const updates = vi.fn();
    const renders = vi.fn();
    context.on('materialUpdated', updates);
    context.on('materialsRendered', renders);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    handle.update({ radius: 13 });
    handle.update({ blur: undefined, radius: 13 });
    expect(() => handle.update({ dispersion: 9, radius: -1 })).toThrowError(
      expect.objectContaining({ code: 'INVALID_CONFIG' }),
    );

    expect(harness.frames.size).toBe(1);
    harness.flushFrame();
    expect(updates).toHaveBeenCalledOnce();
    expect(updates).toHaveBeenCalledWith(handle.id, { radius: 13 });
    expect(renders).toHaveBeenCalledOnce();
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws + 1);
    context.destroy();
  });

  it('drops a pending event when its material is destroyed before the frame', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const updates = vi.fn();
    context.on('materialUpdated', updates);

    handle.update({ radius: 13 });
    expect(harness.frames.size).toBe(1);
    handle.destroy();

    expect(harness.frames.size).toBe(0);
    expect(updates).not.toHaveBeenCalled();
    context.destroy();
  });

  it('uses true commit order when presentation publication reenters update', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const updates: MaterialChanges[] = [];
    const renders = vi.fn();
    let presentationCalls = 0;
    handle.onPresentation(() => {
      presentationCalls += 1;
      if (presentationCalls === 2) {
        handle.update({ interactionPreset: 'context-menu' });
      }
    });
    context.on('materialUpdated', (_id, changes) => updates.push(changes));
    context.on('materialsRendered', renders);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    handle.update({ blur: 2, interactionPreset: 'slider' });

    expect(handle.getPresentation().interactionConfig.preset).toBe('context-menu');
    expect(harness.frames.size).toBe(1);
    harness.flushFrame();
    expect(updates).toEqual([{
      blur: 2,
      interactionPreset: 'context-menu',
    }]);
    expect(renders).toHaveBeenCalledOnce();
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws + 1);
    expect(latestUniformValue(gl, 'uBlur')).toBe(2);
    context.destroy();
  });

  it('emits event-reentrant updates on two frames with one live-config draw', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const updates: MaterialChanges[] = [];
    const renders = vi.fn();
    context.on('materialUpdated', (_id, changes) => {
      updates.push(changes);
      if (changes.radius === 13) handle.update({ radius: 14 });
    });
    context.on('materialsRendered', renders);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    handle.update({ radius: 13 });
    harness.flushFrame();
    expect(harness.frames.size).toBe(1);
    harness.flushFrame();

    expect(updates).toEqual([{ radius: 13 }, { radius: 14 }]);
    expect(renders).toHaveBeenCalledOnce();
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws + 1);
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });

  it('does not cover an update committed by the render completion event', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const updates: MaterialChanges[] = [];
    let renderCalls = 0;
    context.on('materialUpdated', (_id, changes) => updates.push(changes));
    context.on('materialsRendered', () => {
      renderCalls += 1;
      if (renderCalls === 1) handle.update({ radius: 14 });
    });
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    handle.update({ radius: 13 });
    harness.flushFrame();
    harness.flushFrame();

    expect(updates).toEqual([{ radius: 13 }, { radius: 14 }]);
    expect(renderCalls).toBe(2);
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws + 2);
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });

  it('skips a peer retired by an update listener without a frame-end draw', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const first = addHarnessMaterial(
      mounted,
      { x: 30, y: 30, width: 120, height: 70 },
    );
    const second = addHarnessMaterial(
      mounted,
      { x: 190, y: 40, width: 110, height: 80 },
    );
    const updatedIds: string[] = [];
    const renders = vi.fn();
    context.on('materialUpdated', (id) => {
      updatedIds.push(id);
      if (id === first.id) second.destroy();
    });
    context.on('materialsRendered', renders);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    first.update({ radius: 13 });
    second.update({ radius: 14 });
    harness.flushFrame();

    expect(updatedIds).toEqual([first.id]);
    expect(second.destroyed).toBe(true);
    expect(renders).toHaveBeenCalledOnce();
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws + 1);
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });

  it('does not redraw after an update listener retires its own material', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const renders = vi.fn();
    context.on('materialUpdated', () => handle.destroy());
    context.on('materialsRendered', renders);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    handle.update({ radius: 13 });
    harness.flushFrame();

    expect(handle.destroyed).toBe(true);
    expect(renders).toHaveBeenCalledOnce();
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws);
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });

  it('cancels a layout frame consumed by a successful structural draw', () => {
    const mounted = mountMaterialContext();
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const renders = vi.fn();
    context.on('materialsRendered', renders);
    const gl = harness.canvases[0]?.gl;
    if (!gl) throw new Error('Missing presentation WebGL context.');
    const draws = callsNamed(gl, 'drawArrays').length;

    handle.refreshLayout();
    expect(harness.frames.size).toBe(1);
    handle.destroy();

    expect(renders).toHaveBeenCalledOnce();
    expect(callsNamed(gl, 'drawArrays')).toHaveLength(draws);
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });

  it('keeps a presentation error ahead of initial RAF scheduling failure', () => {
    const scheduleError = new Error('schedule failed');
    const mounted = mountMaterialContext(() => {
      throw scheduleError;
    });
    const { context, harness } = mounted;
    const handle = addHarnessMaterial(
      mounted,
      { x: 40, y: 30, width: 140, height: 80 },
    );
    const presentationError = new Error('presentation failed');
    let presentationCalls = 0;
    handle.onPresentation(() => {
      presentationCalls += 1;
      if (presentationCalls > 1) throw presentationError;
    });

    expect(() => handle.update({ interactionPreset: 'slider' }))
      .toThrow(presentationError);
    expect(handle.getPresentation().interactionConfig.preset).toBe('slider');
    expect(harness.frames.size).toBe(0);
    context.destroy();
  });
});
