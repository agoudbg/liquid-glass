import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureDomElement,
  type DomCaptureRuntime,
} from '../../src/backdrop/dom-capture';
import { GlassError } from '../../src/errors/GlassError';
import { FakeCanvas } from '../fixtures/fake-webgl2';

function createElement(): HTMLElement {
  return {
    classList: { contains: () => false },
    scrollHeight: 1200,
    scrollWidth: 800,
  } as unknown as HTMLElement;
}

describe('captureDomElement', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses bounded html-to-image options without full-size rasterization', async () => {
    const canvas = new FakeCanvas();
    canvas.width = 600;
    canvas.height = 400;
    const captureHtmlToImage = vi.fn(async () => (
      canvas as unknown as HTMLCanvasElement
    ));
    const runtime: DomCaptureRuntime = {
      captureHtmlToImage,
      clearTimeout,
      loadHtml2Canvas: vi.fn(),
      setTimeout,
    };

    const result = await captureDomElement({
      backdropId: 'dom-1',
      captureRect: { x: 50, y: 80, width: 300, height: 200 },
      element: createElement(),
      library: 'html-to-image',
      pixelRatio: 2,
      timeoutMs: 1000,
    }, runtime);

    expect(result).toEqual({
      canvas,
      viewportRect: { x: 50, y: 80, width: 300, height: 200 },
    });
    expect(captureHtmlToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        canvasHeight: 200,
        canvasWidth: 300,
        height: 200,
        pixelRatio: 2,
        style: expect.objectContaining({
          transform: 'translate(-50px, -80px)',
          transformOrigin: 'top left',
        }),
        width: 300,
      }),
    );
  });

  it('loads html2canvas lazily with direct viewport bounds', async () => {
    const canvas = new FakeCanvas();
    const html2canvas = vi.fn(async () => canvas as unknown as HTMLCanvasElement);
    const loadHtml2Canvas = vi.fn(async () => html2canvas);

    await captureDomElement({
      backdropId: 'dom-2',
      captureRect: { x: 20, y: 30, width: 100, height: 80 },
      element: createElement(),
      library: 'html2canvas',
      pixelRatio: 1.5,
      timeoutMs: 1000,
    }, {
      captureHtmlToImage: vi.fn(),
      clearTimeout,
      loadHtml2Canvas,
      setTimeout,
    });

    expect(loadHtml2Canvas).toHaveBeenCalledOnce();
    expect(html2canvas).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      height: 80,
      scale: 1.5,
      width: 100,
      x: 20,
      y: 30,
    }));
  });

  it('times out contextually and permits a later successful capture', async () => {
    vi.useFakeTimers();
    const canvas = new FakeCanvas();
    const captureHtmlToImage = vi.fn()
      .mockImplementationOnce(() => new Promise<HTMLCanvasElement>(() => undefined))
      .mockResolvedValueOnce(canvas as unknown as HTMLCanvasElement);
    const runtime: DomCaptureRuntime = {
      captureHtmlToImage,
      clearTimeout,
      loadHtml2Canvas: vi.fn(),
      setTimeout,
    };
    const request = {
      backdropId: 'dom-timeout',
      captureRect: null,
      element: createElement(),
      library: 'html-to-image' as const,
      pixelRatio: 1,
      timeoutMs: 50,
    };

    const firstCapture = captureDomElement(request, runtime);
    const failure = expect(firstCapture).rejects.toMatchObject({
      code: 'CAPTURE_FAILED',
      backdropId: 'dom-timeout',
      details: expect.objectContaining({ timedOut: true }),
    });
    await vi.advanceTimersByTimeAsync(51);
    await failure;
    await expect(captureDomElement(request, runtime)).resolves.toMatchObject({ canvas });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a contextual setup error when optional html2canvas is absent', async () => {
    const missingModule = new Error('Cannot find package html2canvas');
    await expect(captureDomElement({
      backdropId: 'dom-optional',
      captureRect: null,
      element: createElement(),
      library: 'html2canvas',
      pixelRatio: 1,
      timeoutMs: 100,
    }, {
      captureHtmlToImage: vi.fn(),
      clearTimeout,
      loadHtml2Canvas: async () => {
        throw missingModule;
      },
      setTimeout,
    })).rejects.toEqual(expect.objectContaining<Partial<GlassError>>({
      code: 'CAPTURE_FAILED',
      cause: missingModule,
      backdropId: 'dom-optional',
    }));
  });
});
