import { isDeepStrictEqual } from 'node:util';

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

/**
 * Bind captured browser metadata to the immutable environment contract.
 *
 * @param {unknown} metadataValue - Browser metadata captured for one DPR.
 * @param {number} devicePixelRatio - Expected capture DPR.
 * @param {unknown} contractValue - Validated capture contract body.
 * @param {string} label - Diagnostic label for thrown errors.
 */
export function validateBrowserMetadataAgainstCaptureContract(
  metadataValue,
  devicePixelRatio,
  contractValue,
  label,
) {
  const metadata = requireRecord(metadataValue, label);
  const contract = requireRecord(contractValue, 'capture contract');
  const browser = requireRecord(contract.browser, 'capture contract browser');
  const context = requireRecord(contract.context, 'capture contract context');
  if (
    metadata.browserName !== browser.browserName
    || metadata.browserVersion !== browser.browserVersion
    || !isDeepStrictEqual(
      metadata.browserProtocol,
      browser.protocol,
    )
    || !isDeepStrictEqual(
      metadata.effectiveBrowserArguments,
      browser.effectiveArguments,
    )
  ) {
    throw new Error(
      `${label} browser identity or launch differs from the capture contract.`,
    );
  }
  if (!isDeepStrictEqual(
    metadata.webGlFingerprint,
    browser.webGlFingerprint,
  )) {
    throw new Error(`${label} WebGL identity differs from the capture contract.`);
  }
  if (!isDeepStrictEqual(metadata.viewport, context.viewport)) {
    throw new Error(`${label} viewport differs from the capture contract.`);
  }
  for (const field of [
    'colorScheme',
    'locale',
    'reducedMotion',
    'timezoneId',
  ]) {
    if (metadata[field] !== context[field]) {
      throw new Error(
        `${label} ${field} differs from the capture contract.`,
      );
    }
  }
  if (
    metadata.devicePixelRatio !== devicePixelRatio
    || !Array.isArray(context.devicePixelRatios)
    || !context.devicePixelRatios.includes(devicePixelRatio)
  ) {
    throw new Error(`${label} DPR differs from the capture contract.`);
  }
}
