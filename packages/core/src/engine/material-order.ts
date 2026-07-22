import { validateOptionalFiniteNumber } from '../utils/validation';
import type { MaterialRegistration } from './registrations';
import type { GlassEngineRuntime } from './runtime';

const DOCUMENT_POSITION_DISCONNECTED = 0x01;
const DOCUMENT_POSITION_PRECEDING = 0x02;
const DOCUMENT_POSITION_FOLLOWING = 0x04;

interface AutoMaterialDescriptor {
  registration: MaterialRegistration;
  registrationIndex: number;
  zIndex: number;
}

interface ExplicitMaterialDescriptor {
  registration: MaterialRegistration;
  registrationIndex: number;
  renderOrder: number;
}

interface DocumentPositionComparable {
  compareDocumentPosition?: (other: Node) => number;
}

function parseLegacyZIndex(value: string): number {
  if (value === 'auto') return 0;
  return Number.parseInt(value, 10) || 0;
}

function compareRegistrationIndex(
  left: { registrationIndex: number },
  right: { registrationIndex: number },
): number {
  return left.registrationIndex - right.registrationIndex;
}

function compareDomPosition(
  left: AutoMaterialDescriptor,
  right: AutoMaterialDescriptor,
): number {
  const leftElement = left.registration.config.element;
  const rightElement = right.registration.config.element;
  const leftComparable = leftElement as DocumentPositionComparable;
  const rightComparable = rightElement as DocumentPositionComparable;
  if (
    typeof leftComparable.compareDocumentPosition !== 'function'
    || typeof rightComparable.compareDocumentPosition !== 'function'
  ) {
    return compareRegistrationIndex(left, right);
  }

  try {
    const position = leftComparable.compareDocumentPosition(
      rightElement as unknown as Node,
    );
    if (!Number.isFinite(position) || (position & DOCUMENT_POSITION_DISCONNECTED) !== 0) {
      return compareRegistrationIndex(left, right);
    }
    if ((position & DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
    if ((position & DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
  } catch {
    return compareRegistrationIndex(left, right);
  }
  return compareRegistrationIndex(left, right);
}

function compareAutoMaterials(
  left: AutoMaterialDescriptor,
  right: AutoMaterialDescriptor,
): number {
  if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex;
  return compareDomPosition(left, right);
}

function compareExplicitMaterials(
  left: ExplicitMaterialDescriptor,
  right: ExplicitMaterialDescriptor,
): number {
  if (left.renderOrder !== right.renderOrder) {
    return left.renderOrder - right.renderOrder;
  }
  return compareRegistrationIndex(left, right);
}

/**
 * Restore legacy-compatible material stacking while retaining deterministic ties.
 *
 * Automatic materials follow their live CSS z-index and DOM position. Explicit
 * materials form a separate top group ordered only by their finite renderOrder.
 *
 * @param registrations - Live context registrations in insertion order.
 * @param runtime - Injected computed-style reader.
 * @returns A fresh array ordered from the first draw to the topmost draw.
 */
export function orderMaterialRegistrations(
  registrations: Iterable<MaterialRegistration>,
  runtime: Pick<GlassEngineRuntime, 'getComputedStyle'>,
): MaterialRegistration[] {
  const automatic: AutoMaterialDescriptor[] = [];
  const explicit: ExplicitMaterialDescriptor[] = [];

  for (const [registrationIndex, registration] of [...registrations].entries()) {
    const renderOrder = validateOptionalFiniteNumber(
      registration.config.renderOrder,
      'material.renderOrder',
    );
    if (renderOrder !== undefined) {
      explicit.push({ registration, registrationIndex, renderOrder });
      continue;
    }

    automatic.push({
      registration,
      registrationIndex,
      zIndex: parseLegacyZIndex(
        runtime.getComputedStyle(registration.config.element).zIndex,
      ),
    });
  }

  automatic.sort(compareAutoMaterials);
  explicit.sort(compareExplicitMaterials);
  return [
    ...automatic.map(({ registration }) => registration),
    ...explicit.map(({ registration }) => registration),
  ];
}
