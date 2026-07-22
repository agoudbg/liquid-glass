import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  LIQUID_GLASS_FRAGMENT_SHADER,
  LIQUID_GLASS_VERTEX_SHADER,
} from '../../src/shaders/sources';

const VERTEX_SHADER_URL = new URL('../../src/shaders/LiquidGlass.vert', import.meta.url);
const FRAGMENT_SHADER_URL = new URL('../../src/shaders/LiquidGlassAdvanced.frag', import.meta.url);

function sha256(source: string | Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

describe('active shader sources', () => {
  it('keeps the reference vertex shader byte-for-byte', () => {
    const bytes = readFileSync(VERTEX_SHADER_URL);
    expect(sha256(bytes)).toBe('8ea709d1d999118002a6fdeca57ac499f878b1279d065a9dc59c42a102803a31');
    expect(LIQUID_GLASS_VERTEX_SHADER).toBe(bytes.toString('utf8'));
  });

  it('keeps the reference advanced fragment shader byte-for-byte', () => {
    const bytes = readFileSync(FRAGMENT_SHADER_URL);
    expect(sha256(bytes)).toBe('73de43a716b9b3418955ca582b2da8c624c7918f668459414062dff6c9126b38');
    expect(LIQUID_GLASS_FRAGMENT_SHADER).toBe(bytes.toString('utf8'));
  });

  it('does not accidentally include the retired circular fragment shader', () => {
    expect(LIQUID_GLASS_FRAGMENT_SHADER).toContain('uniform float uDispersion');
    expect(LIQUID_GLASS_FRAGMENT_SHADER).toContain('uniform vec4 uRadius');
    expect(LIQUID_GLASS_FRAGMENT_SHADER).toContain('float sdfRect');
    expect(LIQUID_GLASS_FRAGMENT_SHADER).not.toContain('float sdCircle');
  });
});
