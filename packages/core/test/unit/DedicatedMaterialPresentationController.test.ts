import { describe, expect, it, vi } from 'vitest';

import { DedicatedMaterialPresentationController } from '../../src/engine/DedicatedMaterialPresentationController';
import type { GlassEngineRuntime } from '../../src/engine/runtime';
import { GlassError } from '../../src/errors/GlassError';
import type { RendererMaterial } from '../../src/renderer/types';
import { FakeCanvas } from '../fixtures/fake-webgl2';

class FakeMaterialElement {
  readonly children: unknown[] = [];

  get firstChild(): Node | null {
    return (this.children[0] ?? null) as Node | null;
  }

  insertBefore<T extends Node>(node: T, child: Node | null): T {
    const canvas = node as unknown as FakeCanvas;
    const index = child === null ? this.children.length : this.children.indexOf(child);
    this.children.splice(index, 0, canvas);
    canvas.parentNode = this;
    return node;
  }

  removeChild<T extends Node>(node: T): T {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    (node as unknown as FakeCanvas).parentNode = null;
    return node;
  }
}

function material(
  overrides: Partial<RendererMaterial> = {},
): RendererMaterial {
  return {
    id: 'material-1',
    rect: { x: 10, y: 20, width: 40, height: 20 },
    matrix: [1, 0, 0, 1, 0, 0],
    radii: [8, 8, 8, 8],
    opacity: 1,
    thickness: 10,
    refractIndex: 1.1,
    refractIntensity: 0.5,
    blur: 0,
    dispersion: 0.01,
    ...overrides,
  };
}

function harness() {
  const canvases: FakeCanvas[] = [];
  const runtime: GlassEngineRuntime = {
    createCanvas: () => {
      const canvas = new FakeCanvas();
      canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    },
    devicePixelRatio: () => 1,
    getComputedStyle: () => ({}) as CSSStyleDeclaration,
  };
  return {
    canvases,
    controller: new DedicatedMaterialPresentationController(runtime),
    runtime,
  };
}

describe('DedicatedMaterialPresentationController', () => {
  it('inserts one configured canvas before existing material content', () => {
    const target = harness();
    const element = new FakeMaterialElement();
    const existingChild = {};
    element.children.push(existingChild);
    const source = new FakeCanvas();
    source.width = 200;
    source.height = 100;

    target.controller.present({
      deviceScale: 2,
      element: element as unknown as HTMLElement,
      material: material(),
      source: source as unknown as HTMLCanvasElement,
    });

    const canvas = target.canvases[0];
    expect(element.children).toEqual([canvas, existingChild]);
    expect(canvas?.className).toBe('liquid-glass-dedicated-canvas');
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.getAttribute('data-liquid-glass-canvas')).toBe('dedicated');
    expect(canvas?.style).toMatchObject({
      borderRadius: 'inherit',
      display: 'block',
      height: '100%',
      inset: '0',
      pointerEvents: 'none',
      position: 'absolute',
      width: '100%',
      zIndex: '-1',
    });
    expect(canvas?.style.visibility).toBe('inherit');
    expect(canvas?.style.opacity).toBe('1');
    expect(canvas?.width).toBe(80);
    expect(canvas?.height).toBe(40);
    expect(target.controller.getDiagnosticsState()).toEqual({
      destroyed: false,
      fallbackMode: false,
      ownedCanvases: 1,
    });
  });

  it('reuses the base-size canvas and copies the transformed material crop', () => {
    const target = harness();
    const element = new FakeMaterialElement();
    const source = new FakeCanvas();
    source.width = 200;
    source.height = 100;
    const resolved = material({
      rect: { x: 10, y: 10, width: 40, height: 20 },
      matrix: [1.5, 0, 0, 2, 0, 0],
    });

    target.controller.present({
      deviceScale: 2,
      element: element as unknown as HTMLElement,
      material: resolved,
      source: source as unknown as HTMLCanvasElement,
    });
    target.controller.present({
      deviceScale: 2,
      element: element as unknown as HTMLElement,
      material: resolved,
      source: source as unknown as HTMLCanvasElement,
    });

    const canvas = target.canvases[0];
    expect(target.canvases).toHaveLength(1);
    expect(element.children).toHaveLength(1);
    expect(canvas?.width).toBe(80);
    expect(canvas?.height).toBe(40);
    expect(canvas?.context2d.calls.filter(({ name }) => name === 'drawImage')).toEqual([
      {
        name: 'drawImage',
        args: [
          source,
          0,
          0,
          121,
          80,
          0,
          40 / 81,
          80,
          3_200 / 81,
        ],
      },
      {
        name: 'drawImage',
        args: [
          source,
          0,
          0,
          121,
          80,
          0,
          40 / 81,
          80,
          3_200 / 81,
        ],
      },
    ]);
  });

  it('clamps offscreen source pixels and maps them proportionally', () => {
    const target = harness();
    const element = new FakeMaterialElement();
    const source = new FakeCanvas();
    source.width = 200;
    source.height = 100;

    target.controller.present({
      deviceScale: 2,
      element: element as unknown as HTMLElement,
      material: material({
        rect: { x: -10, y: 10, width: 40, height: 20 },
      }),
      source: source as unknown as HTMLCanvasElement,
    });

    const calls = target.canvases[0]?.context2d.calls;
    expect(calls?.at(-1)).toEqual({
      name: 'drawImage',
      args: [source, 0, 20, 60, 40, 20, 0, 60, 40],
    });
  });

  it('clears without drawing when the material is fully outside the source', () => {
    const target = harness();
    const element = new FakeMaterialElement();
    const source = new FakeCanvas();
    source.width = 100;
    source.height = 100;

    target.controller.present({
      deviceScale: 1,
      element: element as unknown as HTMLElement,
      material: material({
        rect: { x: 200, y: 200, width: 40, height: 20 },
      }),
      source: source as unknown as HTMLCanvasElement,
    });

    expect(target.canvases[0]?.context2d.calls).toEqual([
      { name: 'clearRect', args: [0, 0, 40, 20] },
    ]);
  });

  it('hides canvases in fallback mode and reveals retained pixels afterward', () => {
    const target = harness();
    const element = new FakeMaterialElement();
    const source = new FakeCanvas();
    source.width = 100;
    source.height = 100;

    target.controller.setFallbackMode(true);
    target.controller.present({
      deviceScale: 1,
      element: element as unknown as HTMLElement,
      material: material(),
      source: source as unknown as HTMLCanvasElement,
    });
    expect(target.canvases[0]?.style.visibility).toBe('hidden');
    expect(target.canvases[0]?.style.opacity).toBe('0');

    target.controller.setFallbackMode(false);
    expect(target.canvases[0]?.style.visibility).toBe('inherit');
    expect(target.canvases[0]?.style.opacity).toBe('1');
  });

  it('removes individual canvases and releases all backing stores on destroy', () => {
    const target = harness();
    const firstElement = new FakeMaterialElement();
    const secondElement = new FakeMaterialElement();
    const source = new FakeCanvas();
    source.width = 200;
    source.height = 100;

    target.controller.present({
      deviceScale: 1,
      element: firstElement as unknown as HTMLElement,
      material: material(),
      source: source as unknown as HTMLCanvasElement,
    });
    target.controller.present({
      deviceScale: 1,
      element: secondElement as unknown as HTMLElement,
      material: material({ id: 'material-2' }),
      source: source as unknown as HTMLCanvasElement,
    });
    target.controller.remove('material-1');

    expect(firstElement.children).toHaveLength(0);
    expect(target.canvases[0]?.width).toBe(0);
    expect(target.canvases[0]?.height).toBe(0);
    expect(target.controller.getDiagnosticsState().ownedCanvases).toBe(1);

    target.controller.destroy();
    target.controller.destroy();
    expect(secondElement.children).toHaveLength(0);
    expect(target.canvases[1]?.width).toBe(0);
    expect(target.canvases[1]?.height).toBe(0);
    expect(target.controller.getDiagnosticsState()).toEqual({
      destroyed: true,
      fallbackMode: false,
      ownedCanvases: 0,
    });
  });

  it('surfaces draw failures as contextual render errors', () => {
    const target = harness();
    const element = new FakeMaterialElement();
    const source = new FakeCanvas();
    source.width = 100;
    source.height = 100;
    const cause = new Error('draw failed');
    target.runtime.createCanvas = () => {
      const canvas = new FakeCanvas();
      canvas.context2d.drawImage = vi.fn(() => {
        throw cause;
      });
      target.canvases.push(canvas);
      return canvas as unknown as HTMLCanvasElement;
    };

    expect(() => target.controller.present({
      deviceScale: 1,
      element: element as unknown as HTMLElement,
      material: material(),
      source: source as unknown as HTMLCanvasElement,
    })).toThrowError(expect.objectContaining<Partial<GlassError>>({
      cause,
      code: 'RENDER_FAILED',
      materialId: 'material-1',
      phase: 'render',
    }));
    expect(element.children).toHaveLength(0);
    expect(target.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(target.controller.getDiagnosticsState().ownedCanvases).toBe(0);
  });
});
