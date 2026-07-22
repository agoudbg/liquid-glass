import { describe, expect, it, vi } from 'vitest';

import {
  isInteractiveMaterialPointer,
  MaterialPointerController,
} from '../../src/interaction';
import type { MaterialHandle, RectLike } from '../../src/types';

interface FakeElementOptions {
  contentEditable?: boolean;
  dataset?: Record<string, string>;
  rect?: RectLike;
  role?: string;
  tagName?: string;
}

function fakeElement(options: FakeElementOptions = {}) {
  const rect = options.rect ?? { x: 10, y: 20, width: 100, height: 50 };
  const setPointerCapture = vi.fn<(pointerId: number) => void>();
  const documentListeners = new Map<string, Set<EventListener>>();
  const ownerDocument = {
    addEventListener: (type: string, listener: EventListener) => {
      const listeners = documentListeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener);
      documentListeners.set(type, listeners);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      documentListeners.get(type)?.delete(listener);
    },
  };
  const element = {
    dataset: options.dataset ?? {},
    getAttribute: (name: string) => (
      name === 'role' ? (options.role ?? null) : null
    ),
    getBoundingClientRect: () => ({
      ...rect,
      bottom: rect.y + rect.height,
      left: rect.x,
      right: rect.x + rect.width,
      top: rect.y,
      toJSON: () => ({ ...rect }),
    }),
    isContentEditable: options.contentEditable ?? false,
    ownerDocument,
    setPointerCapture,
    tagName: options.tagName ?? 'DIV',
  } as unknown as HTMLElement;
  const dispatchDocument = (type: string, event: Event): void => {
    for (const listener of [...(documentListeners.get(type) ?? [])]) {
      listener(event);
    }
  };
  return { dispatchDocument, element, setPointerCapture };
}

function pointerEvent(
  path: EventTarget[],
  overrides: Partial<PointerEvent> = {},
): PointerEvent {
  return {
    clientX: 60,
    clientY: 45,
    composedPath: () => path,
    pointerId: 1,
    pointerType: 'mouse',
    pressure: 0.5,
    ...overrides,
  } as PointerEvent;
}

function materialHandle() {
  const setInteractionState = vi.fn<MaterialHandle['setInteractionState']>();
  const handle: MaterialHandle = {
    id: 'material-1',
    destroyed: false,
    destroy: vi.fn(),
    getPresentation: vi.fn<MaterialHandle['getPresentation']>(),
    onPresentation: vi.fn<MaterialHandle['onPresentation']>(() => vi.fn()),
    refreshLayout: vi.fn(),
    setInteractionState,
    update: vi.fn(),
  };
  return { handle, setInteractionState };
}

describe('MaterialPointerController', () => {
  it.each<{ label: string; options: FakeElementOptions }>([
    { options: { tagName: 'BUTTON' }, label: 'native control' },
    { options: { role: 'switch' }, label: 'interactive role' },
    { options: { contentEditable: true }, label: 'editable content' },
    {
      options: { dataset: { lgSkipInteraction: 'true' } },
      label: 'skip annotation',
    },
    {
      options: { dataset: { lgIgnoreMaterial: 'true' } },
      label: 'ignore annotation',
    },
  ])('detects an interactive $label before the material root', ({ options }) => {
    const { element: material } = fakeElement();
    const { element: child } = fakeElement(options);

    expect(isInteractiveMaterialPointer(
      pointerEvent([child, material]),
      material,
    )).toBe(true);
  });

  it('captures a plain child and forwards normalized press movement and release', () => {
    const { element, setPointerCapture } = fakeElement();
    const { handle, setInteractionState } = materialHandle();
    const controller = new MaterialPointerController(element, handle);
    const down = pointerEvent([element]);

    controller.onPointerDown(down);
    controller.onPointerMove(pointerEvent([element], {
      clientX: 110,
      clientY: 70,
    }));
    controller.onPointerUp(pointerEvent([element]));

    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(setInteractionState).toHaveBeenCalledTimes(3);
    expect(setInteractionState.mock.calls[0]?.[0]).toMatchObject({
      pointerState: {
        isActive: true,
        isHovering: true,
        normalizedX: 0.5,
        normalizedY: 0.5,
        pointerId: 1,
        pressure: 0.5,
      },
    });
    expect(setInteractionState.mock.calls[1]?.[0].pointerState).toMatchObject({
      isActive: true,
      normalizedX: 1,
      normalizedY: 1,
    });
    expect(setInteractionState.mock.calls[2]?.[0].pointerState).toMatchObject({
      isActive: false,
      isHovering: true,
    });
  });

  it('does not capture an interactive child but still forwards its press', () => {
    const { dispatchDocument, element, setPointerCapture } = fakeElement();
    const { element: button } = fakeElement({ tagName: 'BUTTON' });
    const { handle, setInteractionState } = materialHandle();
    const controller = new MaterialPointerController(element, handle);

    controller.onPointerDown(pointerEvent([button, element]));

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(setInteractionState).toHaveBeenCalledTimes(1);
    dispatchDocument('pointerup', pointerEvent([element]));
    controller.onPointerUp(pointerEvent([element]));
    expect(setInteractionState).toHaveBeenCalledTimes(2);
    expect(setInteractionState.mock.calls[1]?.[0].pointerState.isActive).toBe(false);
  });

  it('retains first-pointer ownership until its release', () => {
    const { element } = fakeElement();
    const { handle, setInteractionState } = materialHandle();
    const controller = new MaterialPointerController(element, handle);
    controller.onPointerDown(pointerEvent([element], {
      pointerId: 1,
      pointerType: 'touch',
    }));

    controller.onPointerDown(pointerEvent([element], { pointerId: 2 }));
    controller.onPointerMove(pointerEvent([element], { pointerId: 2 }));
    controller.onPointerUp(pointerEvent([element], { pointerId: 2 }));
    expect(setInteractionState).toHaveBeenCalledTimes(1);

    controller.onPointerUp(pointerEvent([element], {
      pointerId: 1,
      pointerType: 'touch',
    }));
    expect(setInteractionState).toHaveBeenCalledTimes(2);
  });

  it('ignores hover in click-only mode and requires a new press after disable', () => {
    const { element } = fakeElement();
    const { handle, setInteractionState } = materialHandle();
    const controller = new MaterialPointerController(element, handle, {
      onlyClickInteractions: true,
    });
    const event = pointerEvent([element]);

    controller.onPointerEnter(event);
    controller.onPointerMove(event);
    expect(setInteractionState).not.toHaveBeenCalled();
    controller.onPointerDown(event);
    controller.onPointerMove(event);
    expect(setInteractionState).toHaveBeenCalledTimes(2);

    controller.updatePolicy({ disableInteractions: true });
    controller.onPointerUp(event);
    controller.updatePolicy({ onlyClickInteractions: true });
    controller.onPointerMove(event);
    expect(setInteractionState).toHaveBeenCalledTimes(2);
    controller.onPointerDown(event);
    expect(setInteractionState).toHaveBeenCalledTimes(3);
  });

  it('preserves an active pointer on leave and releases it on cancellation', () => {
    const { element } = fakeElement();
    const { handle, setInteractionState } = materialHandle();
    const controller = new MaterialPointerController(element, handle);
    const event = pointerEvent([element]);
    controller.onPointerDown(event);

    controller.onPointerLeave(event);
    expect(setInteractionState.mock.calls[1]?.[0].pointerState).toMatchObject({
      isActive: true,
      isHovering: false,
    });
    controller.onPointerCancel(event);
    expect(setInteractionState.mock.calls[2]?.[0].pointerState).toMatchObject({
      isActive: false,
      isHovering: false,
    });
  });

  it('ignores non-owner capture loss and releases the owner only once', () => {
    const { element } = fakeElement();
    const { handle, setInteractionState } = materialHandle();
    const controller = new MaterialPointerController(element, handle);
    const owner = pointerEvent([element]);
    controller.onPointerDown(owner);

    controller.onLostPointerCapture(pointerEvent([element], { pointerId: 2 }));
    expect(setInteractionState).toHaveBeenCalledTimes(1);
    controller.onLostPointerCapture(owner);
    expect(setInteractionState.mock.calls[1]?.[0].pointerState).toMatchObject({
      isActive: false,
      isHovering: false,
    });
    controller.onPointerUp(owner);
    controller.onPointerCancel(owner);
    expect(setInteractionState).toHaveBeenCalledTimes(2);
  });

  it('uses centered coordinates for a zero-sized material and stops after destroy', () => {
    const { element } = fakeElement({
      rect: { x: 10, y: 20, width: 0, height: 0 },
    });
    const { handle, setInteractionState } = materialHandle();
    const controller = new MaterialPointerController(element, handle);
    const event = pointerEvent([element]);

    controller.onPointerDown(event);
    expect(setInteractionState.mock.calls[0]?.[0].pointerState).toMatchObject({
      normalizedX: 0.5,
      normalizedY: 0.5,
    });
    controller.destroy();
    controller.onPointerMove(event);
    expect(setInteractionState).toHaveBeenCalledTimes(1);
  });
});
