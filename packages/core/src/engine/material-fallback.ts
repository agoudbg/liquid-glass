import type { MaterialRegistration } from './registrations';

const FALLBACK_ATTRIBUTE = 'is-fallback-mode';

/** Apply the effective fallback marker to one registered material. */
export function setMaterialFallbackMode(
  registration: MaterialRegistration,
  enabled: boolean,
): void {
  registration.config.element.setAttribute(FALLBACK_ATTRIBUTE, String(enabled));
}

/** Apply the effective fallback marker to every registered material. */
export function setMaterialsFallbackMode(
  registrations: Iterable<MaterialRegistration>,
  enabled: boolean,
): void {
  for (const registration of registrations) {
    setMaterialFallbackMode(registration, enabled);
  }
}

/** Restore the consumer-authored marker retained at registration time. */
export function restoreMaterialFallbackMode(
  registration: MaterialRegistration,
): void {
  if (registration.initialFallbackAttribute === null) {
    registration.config.element.removeAttribute(FALLBACK_ATTRIBUTE);
    return;
  }
  registration.config.element.setAttribute(
    FALLBACK_ATTRIBUTE,
    registration.initialFallbackAttribute,
  );
}
