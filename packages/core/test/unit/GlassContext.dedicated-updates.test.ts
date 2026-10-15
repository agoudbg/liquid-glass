import { describe, expect, it, vi } from 'vitest';

import type { DomCaptureResult } from '../../src/backdrop/dom-capture';
import { FakeCanvas } from '../fixtures/fake-webgl2';
import { deferred } from '../fixtures/glass-engine';
import {
  FakeMaterialElement,
  mountMaterialContext,
} from '../fixtures/material-context';

describe('GlassContext dedicated material updates', () => {
  it('releases a culled canvas and presents a fresh frame when its owner returns', () => {
    const mounted = mountMaterialContext();
    const material = new FakeMaterialElement({ x: 36, y: 28, width: 120, height: 56 });
    material.parentElement = mounted.container as unknown as HTMLElement;
    const readStyle = mounted.harness.runtime.getComputedStyle;
    let hidden = false;
    mounted.harness.runtime.getComputedStyle = (element) => ({
      ...readStyle(element),
      visibility: element === (material as unknown as HTMLElement) && hidden
        ? 'hidden'
        : 'visible',
    }) as CSSStyleDeclaration;
    const handle = mounted.context.addMaterial({
      element: material as unknown as HTMLElement,
      renderMode: 'dedicated',
    });
    const firstCanvas = material.children[0];

    hidden = true;
    mounted.context.refresh('visibility');
    expect(material.children).toHaveLength(0);
    expect(firstCanvas).toMatchObject({ width: 0, height: 0 });
    expect(handle.destroyed).toBe(false);

    hidden = false;
    mounted.context.refresh('visibility');
    expect(material.children).toHaveLength(1);
    expect(material.children[0]).not.toBe(firstCanvas);
    mounted.context.destroy();
  });

  it('switches a material override without replacing its registration handle', () => {
    const mounted = mountMaterialContext();
    const material = new FakeMaterialElement({
      x: 36,
      y: 28,
      width: 120,
      height: 56,
    });
    material.parentElement = mounted.container as unknown as HTMLElement;
    const handle = mounted.context.addMaterial({
      element: material as unknown as HTMLElement,
      renderMode: 'dedicated',
    });
    const materialId = handle.id;
    const firstCanvas = material.children[0];

    expect(firstCanvas?.getAttribute('data-liquid-glass-canvas')).toBe(
      'dedicated',
    );
    expect(mounted.context.getDiagnostics().resources.ownedCanvases).toBe(7);

    handle.update({ renderMode: 'uniform' });
    mounted.harness.flushFrame();

    expect(handle).toMatchObject({ id: materialId, destroyed: false });
    expect(material.children).toHaveLength(0);
    expect(firstCanvas).toMatchObject({ width: 0, height: 0 });
    expect(mounted.context.getDiagnostics().resources.ownedCanvases).toBe(6);

    handle.update({ renderMode: 'dedicated' });
    mounted.harness.flushFrame();

    expect(handle).toMatchObject({ id: materialId, destroyed: false });
    expect(material.children).toHaveLength(1);
    expect(material.children[0]).not.toBe(firstCanvas);
    expect(mounted.context.getDiagnostics().resources.ownedCanvases).toBe(7);

    mounted.context.destroy();
  });

  it('removes stale dedicated canvases while a DOM capture is active', async () => {
    const mounted = mountMaterialContext();
    const capture = deferred<DomCaptureResult>();
    mounted.harness.runtime.captureDomElement = vi.fn(() => capture.promise);
    mounted.context.updateOptions({ renderMode: 'dedicated' });
    const material = new FakeMaterialElement({
      x: 36,
      y: 28,
      width: 120,
      height: 56,
    });
    material.parentElement = mounted.container as unknown as HTMLElement;
    mounted.context.addMaterial({
      element: material as unknown as HTMLElement,
    });
    const firstCanvas = material.children[0];
    const source = new FakeMaterialElement({
      x: 0,
      y: 0,
      width: 360,
      height: 220,
    });
    source.parentElement = mounted.container as unknown as HTMLElement;
    mounted.context.addBackdropSource({
      element: source as unknown as HTMLElement,
      kind: 'dom',
    });
    mounted.harness.flushFrame();
    await vi.waitFor(() => {
      expect(mounted.harness.runtime.captureDomElement).toHaveBeenCalledOnce();
    });

    mounted.context.updateOptions({ renderMode: 'uniform' });

    expect(material.children).toHaveLength(0);
    expect(firstCanvas).toMatchObject({ width: 0, height: 0 });
    expect(mounted.context.getDiagnostics()).toMatchObject({
      mode: { renderMode: 'uniform' },
      resources: { ownedCanvases: 6 },
    });

    capture.resolve({
      canvas: new FakeCanvas() as unknown as HTMLCanvasElement,
      viewportRect: { x: 0, y: 0, width: 360, height: 220 },
    });
    await vi.waitFor(() => {
      expect(mounted.context.getDiagnostics().scheduling.capture.running)
        .toBe(false);
    });
    mounted.context.destroy();
  });
});
