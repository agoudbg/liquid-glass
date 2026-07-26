/** Browser arguments required for deterministic legacy capture. */
export const REQUIRED_BROWSER_ARGUMENTS = Object.freeze([
  '--enable-automation',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--force-color-profile=srgb',
]);

const REQUIRED_BROWSER_NAME = 'chromium';
const REQUIRED_BROWSER_CHANNEL = 'chrome';
const REQUIRED_COLOR_SCHEME = 'light';
const REQUIRED_DEVICE_PIXEL_RATIOS = Object.freeze([1, 2]);
const REQUIRED_LOCALE = 'en-US';
const REQUIRED_REDUCED_MOTION = 'reduce';
const REQUIRED_TIMEZONE_ID = 'UTC';
const REQUIRED_VIEWPORT = Object.freeze({
  width: 1440,
  height: 900,
});

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireExactValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}.`);
  }
}

function requireExactJson(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} must be ${JSON.stringify(expected)}.`,
    );
  }
}

function requireExactViewport(value, label) {
  const viewport = requireRecord(value, label);
  requireExactValue(
    viewport.width,
    REQUIRED_VIEWPORT.width,
    `${label}.width`,
  );
  requireExactValue(
    viewport.height,
    REQUIRED_VIEWPORT.height,
    `${label}.height`,
  );
}

function validateConfig(configValue, devicePixelRatio) {
  const label = `DPR ${devicePixelRatio} config`;
  const config = requireRecord(configValue, label);
  const browser = requireRecord(config.browser, `${label}.browser`);
  const launch = requireRecord(
    browser.launchOptions,
    `${label}.browser.launchOptions`,
  );
  const context = requireRecord(
    browser.contextOptions,
    `${label}.browser.contextOptions`,
  );

  requireExactValue(
    browser.browserName,
    REQUIRED_BROWSER_NAME,
    `${label}.browser.browserName`,
  );
  requireExactValue(
    browser.isolated,
    true,
    `${label}.browser.isolated`,
  );
  requireExactValue(
    launch.channel,
    REQUIRED_BROWSER_CHANNEL,
    `${label}.browser.launchOptions.channel`,
  );
  requireExactValue(
    launch.headless,
    true,
    `${label}.browser.launchOptions.headless`,
  );
  requireExactJson(
    launch.args,
    REQUIRED_BROWSER_ARGUMENTS,
    `${label}.browser.launchOptions.args`,
  );
  requireExactViewport(
    context.viewport,
    `${label}.browser.contextOptions.viewport`,
  );
  requireExactValue(
    context.deviceScaleFactor,
    devicePixelRatio,
    `${label}.browser.contextOptions.deviceScaleFactor`,
  );
  requireExactValue(
    context.colorScheme,
    REQUIRED_COLOR_SCHEME,
    `${label}.browser.contextOptions.colorScheme`,
  );
  requireExactValue(
    context.locale,
    REQUIRED_LOCALE,
    `${label}.browser.contextOptions.locale`,
  );
  requireExactValue(
    context.reducedMotion,
    REQUIRED_REDUCED_MOTION,
    `${label}.browser.contextOptions.reducedMotion`,
  );
  requireExactValue(
    context.timezoneId,
    REQUIRED_TIMEZONE_ID,
    `${label}.browser.contextOptions.timezoneId`,
  );
}

/**
 * Validate both legacy capture configurations against the frozen environment.
 *
 * Returning canonical values prevents equivalent-but-mutable input objects
 * from becoming the provenance source of truth.
 */
export function validateLegacyCaptureConfigs(configs) {
  if (
    !Array.isArray(configs)
    || configs.length !== REQUIRED_DEVICE_PIXEL_RATIOS.length
  ) {
    throw new Error('Legacy capture requires exactly DPR 1 and DPR 2 configs.');
  }
  for (const [index, devicePixelRatio] of (
    REQUIRED_DEVICE_PIXEL_RATIOS.entries()
  )) {
    validateConfig(configs[index], devicePixelRatio);
  }
  return {
    browserArguments: [...REQUIRED_BROWSER_ARGUMENTS],
    context: {
      colorScheme: REQUIRED_COLOR_SCHEME,
      devicePixelRatios: [...REQUIRED_DEVICE_PIXEL_RATIOS],
      locale: REQUIRED_LOCALE,
      reducedMotion: REQUIRED_REDUCED_MOTION,
      timezoneId: REQUIRED_TIMEZONE_ID,
      viewport: { ...REQUIRED_VIEWPORT },
    },
  };
}
