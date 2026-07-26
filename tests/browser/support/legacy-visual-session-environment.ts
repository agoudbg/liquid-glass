import { isDeepStrictEqual } from 'node:util';

import {
  type LegacyVisualProvenanceContract,
} from './legacy-visual-provenance';
import {
  expectRecord,
  readArray,
  readString,
} from './legacy-visual-schema';

/** CDP browser identity sampled from the actual DPR capture session. */
export interface LegacyVisualBrowserProtocol {
  /** V8 JavaScript engine version. */
  jsVersion: string;
  /** Chrome product and version. */
  product: string;
  /** Chrome DevTools Protocol version. */
  protocolVersion: string;
  /** Chrome build revision. */
  revision: string;
}

/** Browser launch and context evidence sampled by one DPR capture session. */
export interface LegacyVisualCaptureSessionEnvironment {
  /** CDP identity from the browser used for this DPR. */
  browserProtocol: LegacyVisualBrowserProtocol;
  /** Effective, normalized Chrome switches for this DPR. */
  effectiveBrowserArguments: readonly string[];
  /** Actual preferred color scheme. */
  colorScheme: string;
  /** Actual browser locale. */
  locale: string;
  /** Actual reduced-motion preference. */
  reducedMotion: string;
  /** Actual browser timezone. */
  timezoneId: string;
}

function parseProtocol(
  value: unknown,
  label: string,
): LegacyVisualBrowserProtocol {
  expectRecord(value, label);
  return {
    jsVersion: readString(value.jsVersion, `${label}.jsVersion`),
    product: readString(value.product, `${label}.product`),
    protocolVersion: readString(
      value.protocolVersion,
      `${label}.protocolVersion`,
    ),
    revision: readString(value.revision, `${label}.revision`),
  };
}

/**
 * Bind one committed DPR metadata file to its complete capture contract.
 */
export function parseLegacyVisualCaptureSessionEnvironment(
  value: Record<string, unknown>,
  contract: LegacyVisualProvenanceContract,
  label: string,
): LegacyVisualCaptureSessionEnvironment {
  const browserProtocol = parseProtocol(
    value.browserProtocol,
    `${label}.browserProtocol`,
  );
  const effectiveBrowserArguments = readArray(
    value.effectiveBrowserArguments,
    `${label}.effectiveBrowserArguments`,
  ).map((entry, index) => readString(
    entry,
    `${label}.effectiveBrowserArguments[${index}]`,
  ));
  if (
    !isDeepStrictEqual(browserProtocol, contract.browser.protocol)
    || !isDeepStrictEqual(
      effectiveBrowserArguments,
      contract.browser.effectiveArguments,
    )
  ) {
    throw new Error(
      `${label} browser protocol or effective arguments `
      + 'do not match the capture contract.',
    );
  }

  const environment = {
    browserProtocol,
    colorScheme: readString(value.colorScheme, `${label}.colorScheme`),
    effectiveBrowserArguments,
    locale: readString(value.locale, `${label}.locale`),
    reducedMotion: readString(value.reducedMotion, `${label}.reducedMotion`),
    timezoneId: readString(value.timezoneId, `${label}.timezoneId`),
  };
  for (const field of [
    'colorScheme',
    'locale',
    'reducedMotion',
    'timezoneId',
  ] as const) {
    if (environment[field] !== contract.context[field]) {
      throw new Error(
        `${label}.${field} does not match the capture contract.`,
      );
    }
  }
  return environment;
}
