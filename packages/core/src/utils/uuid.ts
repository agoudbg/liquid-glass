/**
 * Generate a UUID using the same native-to-fallback order as the reference
 * implementation.
 *
 * Native `randomUUID` is preferred, followed by an RFC 4122 version-4 UUID
 * built from `getRandomValues`. `Math.random` remains a last-resort compatibility
 * path for older or restricted browser contexts; identifiers are not used as
 * security tokens.
 *
 * @returns A UUID-shaped unique identifier.
 */
export function generateUUID(): string {
  const cryptoApi = typeof globalThis.crypto === 'undefined'
    ? undefined
    : globalThis.crypto;

  try {
    if (typeof cryptoApi?.randomUUID === 'function') {
      return cryptoApi.randomUUID();
    }
  } catch {
    // Some sandboxed browser contexts expose Crypto but reject randomUUID calls.
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));

    // RFC 4122 version and variant bits make the native and fallback forms equivalent.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }

  const randomSegment = (): string => Math
    .floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);

  return `${randomSegment()}${randomSegment()}-${randomSegment()}-${randomSegment()}-${randomSegment()}-${randomSegment()}${randomSegment()}${randomSegment()}`;
}
