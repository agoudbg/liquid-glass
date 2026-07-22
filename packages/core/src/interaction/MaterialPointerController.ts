import type { MaterialHandle } from '../types/context';

const INTERACTIVE_TAGS = new Set([
  'A',
  'AUDIO',
  'BUTTON',
  'DETAILS',
  'INPUT',
  'LABEL',
  'OPTION',
  'SELECT',
  'SUMMARY',
  'TEXTAREA',
  'VIDEO',
]);

const INTERACTIVE_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'option',
  'radio',
  'switch',
  'tab',
]);

/** Mutable interaction policy mirrored from material props. */
export interface MaterialPointerPolicy {
  /** Ignore all pointer input until a later policy update enables it. */
  disableInteractions?: boolean;
  /** Ignore hover-only input while preserving press interactions. */
  onlyClickInteractions?: boolean;
}

/** Attach native pointer listeners without replacing framework listener props. */
export function bindMaterialPointerEvents(
  element: HTMLElement,
  controller: MaterialPointerController,
): () => void {
  const listeners: Array<readonly [string, EventListener]> = [
    ['lostpointercapture', (event) => {
      controller.onLostPointerCapture(event as PointerEvent);
    }],
    ['pointercancel', (event) => {
      controller.onPointerCancel(event as PointerEvent);
    }],
    ['pointerdown', (event) => {
      controller.onPointerDown(event as PointerEvent);
    }],
    ['pointerenter', (event) => {
      controller.onPointerEnter(event as PointerEvent);
    }],
    ['pointerleave', (event) => {
      controller.onPointerLeave(event as PointerEvent);
    }],
    ['pointermove', (event) => {
      controller.onPointerMove(event as PointerEvent);
    }],
    ['pointerup', (event) => {
      controller.onPointerUp(event as PointerEvent);
    }],
  ];
  for (const [type, listener] of listeners) {
    element.addEventListener(type, listener);
  }
  let bound = true;
  return () => {
    if (!bound) return;
    bound = false;
    for (const [type, listener] of listeners) {
      element.removeEventListener(type, listener);
    }
  };
}

function isHtmlElement(node: EventTarget): node is HTMLElement {
  return typeof node === 'object'
    && node !== null
    && 'dataset' in node
    && 'getAttribute' in node
    && 'tagName' in node;
}

/**
 * Detect whether a pointer path contains a native or annotated interactive child.
 *
 * Interactive children still drive material physics. They are only exempt from
 * pointer capture so their native click, selection, and media behavior survives.
 */
export function isInteractiveMaterialPointer(
  event: PointerEvent,
  material: HTMLElement,
): boolean {
  for (const node of event.composedPath()) {
    if (node === material) break;
    if (!isHtmlElement(node)) continue;
    if (
      node.dataset.lgSkipInteraction === 'true'
      || node.dataset.lgIgnoreMaterial === 'true'
      || INTERACTIVE_TAGS.has(node.tagName)
      || node.isContentEditable
    ) {
      return true;
    }
    const role = node.getAttribute('role');
    if (role && INTERACTIVE_ROLES.has(role)) return true;
  }
  return false;
}

function normalizedCoordinate(value: number, start: number, size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 0.5;
  return Math.min(1, Math.max(0, (value - start) / size));
}

/** Translates native pointer events into the core material interaction contract. */
export class MaterialPointerController {
  private activePointerId: number | null = null;
  private readonly hoveringPointers = new Set<number>();
  private policy: MaterialPointerPolicy = {};
  private destroyed = false;
  private monitoringUncapturedPointer = false;
  private readonly documentPointerUp = (event: Event): void => {
    this.onPointerUp(event as PointerEvent);
  };
  private readonly documentPointerCancel = (event: Event): void => {
    this.onPointerCancel(event as PointerEvent);
  };

  /** Create a bridge for one mounted material registration. */
  public constructor(
    private readonly element: HTMLElement,
    private readonly handle: MaterialHandle,
    policy: MaterialPointerPolicy = {},
  ) {
    this.updatePolicy(policy);
  }

  /** Replace pointer policy without retaining a gesture across a disabled state. */
  public updatePolicy(policy: MaterialPointerPolicy): void {
    if (this.destroyed) return;
    const wasDisabled = this.policy.disableInteractions === true;
    const wasClickOnly = this.policy.onlyClickInteractions === true;
    this.policy = { ...policy };
    if (
      this.policy.disableInteractions
      || wasClickOnly !== (this.policy.onlyClickInteractions === true)
      || (wasDisabled && !this.policy.disableInteractions)
    ) {
      this.clearPointerState();
    }
  }

  /** Begin the first pointer gesture and preserve native interactive descendants. */
  public onPointerDown(event: PointerEvent): void {
    if (this.shouldIgnoreInput()) return;
    if (
      this.activePointerId !== null
      && this.activePointerId !== event.pointerId
    ) {
      return;
    }
    this.activePointerId = event.pointerId;
    if (event.pointerType === 'mouse') this.hoveringPointers.add(event.pointerId);
    if (isInteractiveMaterialPointer(event, this.element)) {
      this.startMonitoringUncapturedPointer();
    } else {
      this.element.setPointerCapture?.(event.pointerId);
    }
    this.forward(event, true, this.isHovering(event));
  }

  /** Forward active movement or mouse hover movement. */
  public onPointerMove(event: PointerEvent): void {
    if (this.shouldIgnoreInput()) return;
    if (
      this.activePointerId !== null
      && this.activePointerId !== event.pointerId
    ) {
      return;
    }
    const active = this.activePointerId === event.pointerId;
    if (!active && this.policy.onlyClickInteractions) return;
    if (!active && event.pointerType === 'mouse') {
      this.hoveringPointers.add(event.pointerId);
    }
    this.forward(event, active, this.isHovering(event));
  }

  /** Release the owning pointer while retaining mouse hover when still inside. */
  public onPointerUp(event: PointerEvent): void {
    if (this.shouldIgnoreInput() || this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
    this.stopMonitoringUncapturedPointer();
    this.forward(event, false, this.isHovering(event));
  }

  /** Cancel the owning pointer and clear all hover bookkeeping for it. */
  public onPointerCancel(event: PointerEvent): void {
    if (this.shouldIgnoreInput() || this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
    this.hoveringPointers.delete(event.pointerId);
    this.stopMonitoringUncapturedPointer();
    this.forward(event, false, false);
  }

  /** Mark a hover-capable mouse pointer as inside the material. */
  public onPointerEnter(event: PointerEvent): void {
    if (
      this.shouldIgnoreInput()
      || (
        this.activePointerId !== null
        && this.activePointerId !== event.pointerId
      )
      || this.policy.onlyClickInteractions
      || event.pointerType !== 'mouse'
    ) {
      return;
    }
    this.hoveringPointers.add(event.pointerId);
    this.forward(
      event,
      this.activePointerId === event.pointerId,
      true,
    );
  }

  /** Clear hover while preserving an active captured gesture. */
  public onPointerLeave(event: PointerEvent): void {
    if (this.shouldIgnoreInput()) return;
    if (
      this.activePointerId !== null
      && this.activePointerId !== event.pointerId
    ) {
      return;
    }
    const active = this.activePointerId === event.pointerId;
    const wasHovering = this.hoveringPointers.delete(event.pointerId);
    if (!active && (!wasHovering || event.pointerType !== 'mouse')) return;
    this.forward(event, active, false);
  }

  /** Release a gesture when the browser unexpectedly drops pointer capture. */
  public onLostPointerCapture(event: PointerEvent): void {
    if (this.shouldIgnoreInput() || this.activePointerId !== event.pointerId) return;
    this.activePointerId = null;
    this.hoveringPointers.delete(event.pointerId);
    this.stopMonitoringUncapturedPointer();
    this.forward(event, false, false);
  }

  /** Release local ownership so a remount cannot inherit stale pointer state. */
  public destroy(): void {
    if (this.destroyed) return;
    this.clearPointerState();
    this.destroyed = true;
  }

  private forward(
    event: PointerEvent,
    isActive: boolean,
    isHovering: boolean,
  ): void {
    const elementRect = this.element.getBoundingClientRect();
    this.handle.setInteractionState({
      elementRect,
      pointerState: {
        clientX: event.clientX,
        clientY: event.clientY,
        isActive,
        isHovering,
        normalizedX: normalizedCoordinate(
          event.clientX,
          elementRect.left,
          elementRect.width,
        ),
        normalizedY: normalizedCoordinate(
          event.clientY,
          elementRect.top,
          elementRect.height,
        ),
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        pressure: event.pressure,
      },
    });
  }

  private isHovering(event: PointerEvent): boolean {
    return event.pointerType === 'mouse'
      && this.hoveringPointers.has(event.pointerId)
      && !this.policy.onlyClickInteractions;
  }

  private shouldIgnoreInput(): boolean {
    return this.destroyed || this.policy.disableInteractions === true;
  }

  private clearPointerState(): void {
    this.activePointerId = null;
    this.hoveringPointers.clear();
    this.stopMonitoringUncapturedPointer();
  }

  private startMonitoringUncapturedPointer(): void {
    if (this.monitoringUncapturedPointer) return;
    const ownerDocument = this.element.ownerDocument;
    if (!ownerDocument?.addEventListener) return;
    ownerDocument.addEventListener('pointerup', this.documentPointerUp, true);
    ownerDocument.addEventListener('pointercancel', this.documentPointerCancel, true);
    this.monitoringUncapturedPointer = true;
  }

  private stopMonitoringUncapturedPointer(): void {
    if (!this.monitoringUncapturedPointer) return;
    const ownerDocument = this.element.ownerDocument;
    ownerDocument.removeEventListener('pointerup', this.documentPointerUp, true);
    ownerDocument.removeEventListener('pointercancel', this.documentPointerCancel, true);
    this.monitoringUncapturedPointer = false;
  }
}
