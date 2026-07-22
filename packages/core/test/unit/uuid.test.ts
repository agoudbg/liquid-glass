import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateUUID } from '../../src/utils/uuid';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('generateUUID', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('generates unique UUID-shaped identifiers', () => {
    const values = Array.from({ length: 1000 }, () => generateUUID());
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => UUID_PATTERN.test(value))).toBe(true);
  });

  it('prefers native randomUUID', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    const getRandomValues = vi.fn();
    vi.stubGlobal('crypto', { randomUUID, getRandomValues });

    expect(generateUUID()).toBe('00000000-0000-4000-8000-000000000001');
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('sets RFC 4122 version and variant bits in the getRandomValues fallback', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array): Uint8Array => {
        bytes.fill(0xff);
        return bytes;
      },
    });

    expect(generateUUID()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('uses the random-value fallback when native randomUUID throws', () => {
    vi.stubGlobal('crypto', {
      randomUUID: (): never => {
        throw new Error('blocked by sandbox');
      },
      getRandomValues: (bytes: Uint8Array): Uint8Array => bytes,
    });

    expect(generateUUID()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('retains a Math.random last resort for legacy contexts', () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(generateUUID()).toBe('00000000-0000-0000-0000-000000000000');
  });
});
