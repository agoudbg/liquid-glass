export function generateUUID(): string {
  // Prefer native API when available
  try {
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
  } catch (e) {
    // ignore and fallback
  }

  // Use getRandomValues if available to generate RFC4122 v4 UUID
  if (typeof crypto !== 'undefined' && typeof (crypto as any).getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    (crypto as any).getRandomValues(bytes);

    // Per RFC4122 v4
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }

  // Last resort: Math.random fallback (less secure, but ensures function exists)
  const rnd = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${rnd()}${rnd()}-${rnd()}-${rnd()}-${rnd()}-${rnd()}${rnd()}${rnd()}`;
}
