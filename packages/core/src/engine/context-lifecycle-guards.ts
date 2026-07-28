import { GlassError } from '../errors/GlassError';
import type {
  BackdropRegistration,
  MaterialRegistration,
} from './registrations';

/** Reject public work after context teardown has started. */
export function assertContextUsable(destroyStarted: boolean): void {
  if (!destroyStarted) return;
  throw new GlassError(
    'DESTROYED_CONTEXT',
    'The liquid-glass context has already been destroyed.',
    { phase: 'lifecycle' },
  );
}

/** Reject a released registration or any registration on a retiring context. */
export function assertContextRegistrationUsable(
  destroyStarted: boolean,
  registration: BackdropRegistration | MaterialRegistration,
): void {
  assertContextUsable(destroyStarted);
  if (!registration.destroyed) return;
  throw new GlassError(
    'LIFECYCLE_FAILED',
    'The registration has already been destroyed.',
    { phase: 'lifecycle' },
  );
}
