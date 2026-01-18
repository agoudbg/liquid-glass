/**
 * Tests for UUID generation utility.
 */
import { describe, expect, it } from 'vitest';

import { generateUUID } from '../utils/uuid';

describe('generateUUID', () => {
  it('should return a string', () => {
    const uuid = generateUUID();
    expect(typeof uuid).toBe('string');
  });

  it('should return a valid UUID format (8-4-4-4-12)', () => {
    const uuid = generateUUID();
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidRegex);
  });

  it('should generate unique UUIDs', () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      uuids.add(generateUUID());
    }
    // All 1000 UUIDs should be unique
    expect(uuids.size).toBe(1000);
  });

  it('should have the correct version bit set for v4 UUID', () => {
    const uuid = generateUUID();
    // The third group should start with '4' for version 4
    const parts = uuid.split('-');
    expect(parts[2][0]).toBe('4');
  });

  it('should have the correct variant bits set', () => {
    const uuid = generateUUID();
    // The fourth group should start with 8, 9, a, or b for RFC4122 variant
    const parts = uuid.split('-');
    const variantChar = parts[3][0].toLowerCase();
    expect(['8', '9', 'a', 'b']).toContain(variantChar);
  });
});
