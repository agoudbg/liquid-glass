import { toCanvas } from 'html-to-image';

import { GlassError } from '../errors/GlassError';
import type {
  DomCaptureLibrary,
  ViewportCaptureRect,
} from '../types/context';
import { raceWithAbort } from './abort';

type HtmlToImageOptions = NonNullable<Parameters<typeof toCanvas>[1]>;

/** Options accepted by the optional html2canvas runtime. */
export interface Html2CanvasOptions {
  /** Optional color painted behind transparent captured content. */
  backgroundColor?: string;
  /** Captured source height in CSS pixels. */
  height: number;
  /** Capture scale multiplier. */
  scale: number;
  /** Captured source width in CSS pixels. */
  width: number;
  /** Horizontal source offset. */
  x: number;
  /** Vertical source offset. */
  y: number;
  /** Ignore core-owned glass presentation nodes. */
  ignoreElements(element: Element): boolean;
}

/** Callable shape of the optional html2canvas package. */
export type Html2CanvasCapture = (
  element: HTMLElement,
  options: Html2CanvasOptions,
) => Promise<HTMLCanvasElement>;

/** Browser operations injected for deterministic DOM capture tests. */
export interface DomCaptureRuntime {
  /** Primary html-to-image capture operation. */
  captureHtmlToImage(
    element: HTMLElement,
    options: HtmlToImageOptions,
  ): Promise<HTMLCanvasElement>;
  /** Clear an owned timeout. */
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
  /** Lazily resolve the optional html2canvas capture function. */
  loadHtml2Canvas(): Promise<Html2CanvasCapture>;
  /** Create an owned timeout. */
  setTimeout(callback: () => void, timeoutMs: number): ReturnType<typeof setTimeout>;
}

/** Input required to capture one DOM-backed backdrop source. */
export interface DomCaptureRequest {
  /** Stable source identifier used in contextual failures. */
  backdropId: string;
  /** Optional color painted behind transparent captured content. */
  backgroundColor?: string;
  /** Optional bounded source-local capture rectangle. */
  captureRect: ViewportCaptureRect | null;
  /** Consumer-owned DOM subtree to rasterize. */
  element: HTMLElement;
  /** Selected rasterization library. */
  library: DomCaptureLibrary;
  /** Rasterization scale multiplier. */
  pixelRatio: number;
  /** Optional context-owned cancellation signal. */
  signal?: AbortSignal;
  /** Maximum capture duration before rejection. */
  timeoutMs: number;
}

/** Successful DOM capture and the source-local region represented by it. */
export interface DomCaptureResult {
  /** Captured bitmap. */
  canvas: HTMLCanvasElement;
  /** Source-local bounds represented by the bitmap. */
  viewportRect: ViewportCaptureRect;
}

function isHtml2CanvasCapture(value: unknown): value is Html2CanvasCapture {
  return typeof value === 'function';
}

async function loadHtml2Canvas(): Promise<Html2CanvasCapture> {
  const moduleName = 'html2canvas';
  const loaded: unknown = await import(/* @vite-ignore */ moduleName);
  const candidate = typeof loaded === 'object' && loaded !== null && 'default' in loaded
    ? (loaded as { default: unknown }).default
    : loaded;
  if (!isHtml2CanvasCapture(candidate)) {
    throw new TypeError('The html2canvas package does not expose a callable default export.');
  }
  return candidate;
}

const DEFAULT_DOM_CAPTURE_RUNTIME: DomCaptureRuntime = {
  captureHtmlToImage: toCanvas,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  loadHtml2Canvas,
  setTimeout: (callback, timeoutMs) => globalThis.setTimeout(callback, timeoutMs),
};

function hasGlassClass(element: unknown): boolean {
  if (typeof element !== 'object' || element === null || !('classList' in element)) {
    return false;
  }
  const classList = (element as { classList?: { contains(name: string): boolean } }).classList;
  return classList?.contains('liquid-glass-material') === true
    || classList?.contains('liquid-glass-canvas') === true;
}

function resolveCaptureRect(request: DomCaptureRequest): ViewportCaptureRect {
  return request.captureRect ?? {
    x: 0,
    y: 0,
    width: request.element.scrollWidth,
    height: request.element.scrollHeight,
  };
}

async function runCapture(
  request: DomCaptureRequest,
  runtime: DomCaptureRuntime,
  captureRect: ViewportCaptureRect,
): Promise<HTMLCanvasElement> {
  if (request.library === 'html-to-image') {
    const fullWidth = request.element.scrollWidth;
    const fullHeight = request.element.scrollHeight;
    const boundedStyle = request.captureRect === null
      ? undefined
      : {
          height: `${String(fullHeight)}px`,
          transform: `translate(${-captureRect.x}px, ${-captureRect.y}px)`,
          transformOrigin: 'top left',
          width: `${String(fullWidth)}px`,
        };
    return runtime.captureHtmlToImage(request.element, {
      backgroundColor: request.backgroundColor,
      canvasHeight: captureRect.height,
      canvasWidth: captureRect.width,
      filter: (node) => !hasGlassClass(node),
      height: captureRect.height,
      pixelRatio: request.pixelRatio,
      style: boundedStyle,
      width: captureRect.width,
    });
  }

  const captureHtml2Canvas = await runtime.loadHtml2Canvas();
  return captureHtml2Canvas(request.element, {
    backgroundColor: request.backgroundColor,
    height: captureRect.height,
    ignoreElements: hasGlassClass,
    scale: request.pixelRatio,
    width: captureRect.width,
    x: captureRect.x,
    y: captureRect.y,
  });
}

/**
 * Capture a DOM subtree with a bounded source region and explicit timeout.
 *
 * @param request - Source, capture policy, and failure context.
 * @param runtime - Optional deterministic browser-operation seam.
 * @returns The captured canvas and the source-local bounds it represents.
 * @throws GlassError when loading, rasterization, or timeout fails.
 */
export async function captureDomElement(
  request: DomCaptureRequest,
  runtime: DomCaptureRuntime = DEFAULT_DOM_CAPTURE_RUNTIME,
): Promise<DomCaptureResult> {
  const captureRect = resolveCaptureRect(request);
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = runtime.setTimeout(() => {
      reject(new GlassError(
        'CAPTURE_FAILED',
        'DOM capture timed out after ' + request.timeoutMs + ' ms.',
        {
          phase: 'capture',
          backdropId: request.backdropId,
          details: { library: request.library, timedOut: true },
        },
      ));
    }, request.timeoutMs);
  });

  try {
    const canvas = await raceWithAbort(
      Promise.race([runCapture(request, runtime, captureRect), timeout]),
      request.signal,
    );
    return { canvas, viewportRect: captureRect };
  } catch (error) {
    if (error instanceof GlassError) {
      throw error;
    }
    throw new GlassError(
      'CAPTURE_FAILED',
      'Failed to capture DOM backdrop with ' + request.library + '.',
      {
        phase: 'capture',
        cause: error,
        backdropId: request.backdropId,
        details: {
          aborted: error instanceof Error && error.name === 'AbortError',
          library: request.library,
          timedOut: false,
        },
      },
    );
  } finally {
    if (timeoutHandle !== undefined) {
      runtime.clearTimeout(timeoutHandle);
    }
  }
}
