import { describe, expect, it } from 'vitest';

import {
  prepareCanvasBackdropSourceUpdate,
  prepareDomBackdropSourceUpdate,
  readBackdropSourceKind,
  snapshotCanvasBackdropSourceConfig,
  snapshotDomBackdropSourceConfig,
} from '../../src/engine/backdrop-config';
import { GlassError } from '../../src/errors/GlassError';
import type {
  CanvasBackdropSourceConfig,
  DomBackdropSourceConfig,
} from '../../src/types/context';
import { FakeCanvas } from '../fixtures/fake-webgl2';

function createElement(): HTMLElement {
  return {
    firstElementChild: null,
    getBoundingClientRect: () => ({
      bottom: 180,
      height: 180,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
    }),
    querySelectorAll: () => [],
    scrollHeight: 180,
    scrollWidth: 320,
  } as unknown as HTMLElement;
}

function createCanvas(): HTMLCanvasElement {
  const canvas = new FakeCanvas() as unknown as HTMLCanvasElement;
  canvas.getBoundingClientRect = createElement().getBoundingClientRect;
  return canvas;
}

describe('backdrop source configuration', () => {
  it('detaches DOM viewport capture options from consumer-owned input', () => {
    const viewportCapture = { bufferX: 12, bufferY: 24, enabled: true };
    const config: DomBackdropSourceConfig = {
      kind: 'dom',
      element: createElement(),
      captureLibrary: 'html2canvas',
      viewportCapture,
      watchNodeChanges: false,
    };

    const snapshot = snapshotDomBackdropSourceConfig(config);
    viewportCapture.bufferX = 90;

    expect(snapshot).not.toBe(config);
    expect(snapshot.viewportCapture).not.toBe(viewportCapture);
    expect(snapshot.viewportCapture).toEqual({
      bufferX: 12,
      bufferY: 24,
      enabled: true,
    });
  });

  it('rejects invalid discriminators, fields, and source-specific values', () => {
    expect(() => readBackdropSourceKind({ kind: 'unknown' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(() => snapshotDomBackdropSourceConfig({
      kind: 'dom',
      element: createElement(),
      captureLibrary: 'other',
    } as unknown as DomBackdropSourceConfig)).toThrow(GlassError);
    expect(() => snapshotDomBackdropSourceConfig({
      kind: 'dom',
      element: createElement(),
      viewportCapture: { bufferX: -1 },
    })).toThrow(GlassError);
    expect(() => snapshotCanvasBackdropSourceConfig({
      kind: 'canvas',
      element: createCanvas(),
      draw: null,
    } as unknown as CanvasBackdropSourceConfig)).toThrow(GlassError);
    expect(() => snapshotCanvasBackdropSourceConfig({
      kind: 'canvas',
      element: createCanvas(),
      draw: () => undefined,
      scale: 0,
    })).toThrow(GlassError);
    expect(() => snapshotCanvasBackdropSourceConfig({
      kind: 'canvas',
      element: createCanvas(),
      draw: () => undefined,
      unexpected: true,
    } as unknown as CanvasBackdropSourceConfig)).toThrow(GlassError);
  });

  it('rejects ownership changes and returns null for semantic no-ops', () => {
    const canvas = createCanvas();
    const current = snapshotCanvasBackdropSourceConfig({
      kind: 'canvas',
      element: canvas,
      draw: () => undefined,
      zIndex: 2,
    });

    expect(() => prepareCanvasBackdropSourceUpdate(current, {
      element: createCanvas(),
    } as unknown as Parameters<typeof prepareCanvasBackdropSourceUpdate>[1]))
      .toThrowError(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(prepareCanvasBackdropSourceUpdate(current, { zIndex: 2 })).toBeNull();
  });

  it('clears optional DOM fields without mutating the current snapshot', () => {
    const current = snapshotDomBackdropSourceConfig({
      kind: 'dom',
      element: createElement(),
      backgroundColor: '#102030',
      viewportCapture: true,
    });

    const prepared = prepareDomBackdropSourceUpdate(current, {
      backgroundColor: undefined,
      viewportCapture: { bufferY: 80 },
    });

    expect(prepared?.next).toEqual({
      kind: 'dom',
      element: current.element,
      viewportCapture: { bufferY: 80 },
    });
    expect(current.backgroundColor).toBe('#102030');
    expect(current.viewportCapture).toBe(true);
  });
});
