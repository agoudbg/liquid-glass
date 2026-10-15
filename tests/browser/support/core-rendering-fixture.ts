import { GlassEngine } from '../../../packages/core/src/engine';
import type { GlassContext, GlassContextOptions } from '../../../packages/core/src/types/context';

/** Browser-owned resources used by the core rendering regression tests. */
export interface RenderingFixture {
  /** Source whose position may be changed independently of the material. */
  backdrop: HTMLCanvasElement;
  /** Real rendering context under test. */
  context: GlassContext;
  /** Material owner with a known layout box. */
  element: HTMLDivElement;
  /** Container whose CSS coordinate space may be transformed. */
  root: HTMLDivElement;
  /** Release the engine and remove the fixture DOM. */
  destroy(): void;
}

/** Create a real core context with a deterministic, independently sampled backdrop. */
export function createRenderingFixture(
  options: GlassContextOptions = {},
): RenderingFixture {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;z-index:99999;background:white;transform-origin:top left';
  const backdrop = document.createElement('canvas');
  backdrop.style.cssText = 'position:absolute;left:0;top:0;width:400px;height:300px';
  const element = document.createElement('div');
  element.style.cssText = 'position:absolute;left:100px;top:80px;width:100px;height:80px;z-index:2';
  root.append(backdrop, element);
  document.body.append(root);
  const engine = new GlassEngine();
  const context = engine.createContext(root, options);
  context.addBackdropSource({
    kind: 'canvas',
    element: backdrop,
    mirrorToElement: false,
    draw: (drawing, width, height) => {
      drawing.fillStyle = '#ff0000';
      drawing.fillRect(0, 0, width, height);
    },
  });

  return {
    backdrop,
    context,
    element,
    root,
    destroy: (): void => {
      engine.destroy();
      root.remove();
    },
  };
}

/** Measure the opaque aperture in the actual browser-rendered presentation bitmap. */
export function readOpaqueBounds(canvas: HTMLCanvasElement): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Missing presentation context.');
  const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 200) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const rect = canvas.getBoundingClientRect();
  return {
    left: rect.left + minX / canvas.width * rect.width,
    top: rect.top + minY / canvas.height * rect.height,
    width: (maxX - minX + 1) / canvas.width * rect.width,
    height: (maxY - minY + 1) / canvas.height * rect.height,
  };
}
