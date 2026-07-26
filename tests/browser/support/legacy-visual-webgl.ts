import {
  expectRecord,
  readString,
} from './legacy-visual-schema';

/** WebGL2 renderer identity required for exact raw-canvas comparison. */
export interface LegacyVisualWebGlFingerprint {
  /** Masked WebGL renderer string. */
  renderer: string;
  /** WebGL shading-language version string. */
  shadingLanguageVersion: string;
  /** Unmasked ANGLE renderer string. */
  unmaskedRenderer: string;
  /** Unmasked WebGL vendor string. */
  unmaskedVendor: string;
  /** Masked WebGL vendor string. */
  vendor: string;
  /** WebGL API version string. */
  version: string;
}

const FINGERPRINT_FIELDS = [
  'renderer',
  'shadingLanguageVersion',
  'unmaskedRenderer',
  'unmaskedVendor',
  'vendor',
  'version',
] as const;

/** Parse one exact WebGL2 fingerprint and require the SwiftShader backend. */
export function parseLegacyVisualWebGlFingerprint(
  value: unknown,
  label: string,
): LegacyVisualWebGlFingerprint {
  expectRecord(value, label);
  const fingerprint = {
    renderer: readString(value.renderer, `${label}.renderer`),
    shadingLanguageVersion: readString(
      value.shadingLanguageVersion,
      `${label}.shadingLanguageVersion`,
    ),
    unmaskedRenderer: readString(
      value.unmaskedRenderer,
      `${label}.unmaskedRenderer`,
    ),
    unmaskedVendor: readString(
      value.unmaskedVendor,
      `${label}.unmaskedVendor`,
    ),
    vendor: readString(value.vendor, `${label}.vendor`),
    version: readString(value.version, `${label}.version`),
  };
  if (!fingerprint.unmaskedRenderer.toLowerCase().includes('swiftshader')) {
    throw new Error(`${label}.unmaskedRenderer must identify SwiftShader.`);
  }
  return fingerprint;
}

/** Compare every field of two validated WebGL fingerprints. */
export function haveSameLegacyVisualWebGlFingerprint(
  first: LegacyVisualWebGlFingerprint,
  second: LegacyVisualWebGlFingerprint,
): boolean {
  return FINGERPRINT_FIELDS.every((field) => first[field] === second[field]);
}
