import {
  existsSync,
  statSync,
} from 'node:fs';
import { release } from 'node:os';
import {
  basename,
  isAbsolute,
  posix,
  resolve,
} from 'node:path';
import { arch, platform } from 'node:process';

import {
  LEGACY_VISUAL_TOOLCHAIN_PATHS,
  resolveLegacyVisualChromeExecutable,
} from './legacy-visual-environment';
import {
  computeLegacyVisualFileSha256,
  computeLegacyVisualRepositoryDigest,
  validateLegacyVisualContentAddressedFiles,
  validateLegacyVisualRepositoryFiles,
} from './legacy-visual-provenance-files';
import {
  assertUnique,
  expectRecord,
  readArray,
  readPositiveInteger,
  readString,
} from './legacy-visual-schema';
import {
  type LegacyVisualWebGlFingerprint,
  parseLegacyVisualWebGlFingerprint,
} from './legacy-visual-webgl';

const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;
const CHROME_VERSION_PATTERN = /^\d+\.\d+\.\d+\.\d+$/u;
const REQUIRED_ARGUMENTS = [
  '--enable-automation', '--force-color-profile=srgb',
  '--use-angle=swiftshader', '--use-gl=angle',
] as const;
const EPHEMERAL_ARGUMENT_NAMES = new Set([
  '--breakpad-dump-location',
  '--crash-dumps-dir',
  '--data-path',
  '--disk-cache-dir',
  '--log-file',
  '--remote-debugging-pipe',
  '--remote-debugging-port',
  '--trace-startup-file',
  '--user-data-dir',
]);
const REQUIRED_DISTRIBUTION_FILES = [
  'chrome.dll', 'libEGL.dll', 'libGLESv2.dll', 'vk_swiftshader.dll',
  'vk_swiftshader_icd.json', 'vulkan-1.dll',
] as const;
const REQUIRED_FONTS = ['arial.ttf', 'arialbd.ttf'] as const;

interface ContentAddressedFile { path: string; sha256: string }
interface HostFont { fileName: string; sha256: string }
interface BrowserProtocol {
  jsVersion: string; product: string; protocolVersion: string; revision: string
}
interface ProvenanceRepository {
  digest: string; files: readonly ContentAddressedFile[]
}
interface ProvenanceRuntime {
  nodeVersion: string; playwrightRuntimePackageDigest: string;
  playwrightCliLauncherDigest: string; playwrightCliPackageDigest: string;
  playwrightCliVersion: string;
  playwrightCoreVersion: string; pnpmVersion: string
}
interface ProvenanceHost {
  arch: string; fonts: readonly HostFont[]; osRelease: string; platform: 'win32'
}

interface ProvenanceBrowser {
  arguments: readonly string[]; browserName: 'Google Chrome';
  browserVersion: string; channel: 'chrome';
  distributionFiles: readonly ContentAddressedFile[]; headless: true;
  effectiveArguments: readonly string[];
  webGlFingerprint: LegacyVisualWebGlFingerprint;
  protocol: BrowserProtocol;
}
interface ProvenanceContext {
  colorScheme: 'light'; devicePixelRatios: readonly [1, 2];
  locale: 'en-US'; reducedMotion: 'reduce'; timezoneId: 'UTC';
  viewport: { height: 900; width: 1440 };
}

/** Exact toolchain, host, browser, and context contract for one oracle capture. */
export interface LegacyVisualProvenanceContract {
  /** Contract schema, independent from the surrounding calibration schema. */
  schemaVersion: 1;
  /** Content-addressed repository inputs used by the capture. */
  repository: ProvenanceRepository;
  /** Runtime tool versions used to execute the capture. */
  runtime: ProvenanceRuntime;
  /** Windows host and font identity. */
  host: ProvenanceHost;
  /** Google Chrome distribution and graphics identity. */
  browser: ProvenanceBrowser;
  /** Deterministic browser-context settings shared by both DPR captures. */
  context: ProvenanceContext;
}

/** Overrides used to validate a fixture or a non-default local installation. */
export interface LegacyVisualLocalValidationOptions {
  /** Process architecture; defaults to `process.arch`. */
  arch?: string;
  /** Environment used to find Windows, Chrome, and local application roots. */
  environment?: NodeJS.ProcessEnv;
  /** Installed Node.js version without a leading `v`. */
  nodeVersion?: string;
  /** Operating-system release; defaults to `os.release()`. */
  osRelease?: string;
  /** Node.js platform; defaults to `process.platform`. */
  platform?: NodeJS.Platform;
}

function expectExactKeys(
  value: Record<string, unknown>, expected: readonly string[], label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${sortedExpected.join(', ')}.`);
  }
}

function expectLiteral<T extends boolean | number | string>(
  value: unknown, expected: T, label: string,
): T {
  if (value !== expected) throw new Error(`${label} must be ${String(expected)}.`);
  return expected;
}

function readRelativePath(value: unknown, label: string): string {
  const path = readString(value, label);
  if (
    isAbsolute(path)
    || path.includes('\\')
    || posix.normalize(path) !== path
    || path === '..'
    || path.startsWith('../')
    || path.startsWith('./')
  ) {
    throw new Error(`${label} must be a normalized repository-relative path.`);
  }
  return path;
}

/** Parse a lowercase, 64-character SHA-256 digest. */
export function parseLegacyVisualSha256(
  value: unknown, label = 'sha256',
): string {
  const digest = readString(value, label);
  if (!SHA_256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256.`);
  }
  return digest;
}

function parseContentAddressedFiles(
  value: unknown, label: string,
): ContentAddressedFile[] {
  const files = readArray(value, label).map((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    expectRecord(entry, entryLabel);
    expectExactKeys(entry, ['path', 'sha256'], entryLabel);
    return {
      path: readRelativePath(entry.path, `${entryLabel}.path`),
      sha256: parseLegacyVisualSha256(entry.sha256, `${entryLabel}.sha256`),
    };
  });
  if (files.length === 0) throw new Error(`${label} must not be empty.`);
  assertUnique(files.map(({ path }) => path), `${label} paths`);
  const sortedPaths = files.map(({ path }) => path).sort();
  if (files.some(({ path }, index) => path !== sortedPaths[index])) {
    throw new Error(`${label} must be sorted by path.`);
  }
  return files;
}

export {
  computeLegacyVisualCanonicalSha256,
  computeLegacyVisualRepositoryDigest,
} from './legacy-visual-provenance-files';

function parseRepository(value: unknown, label: string): ProvenanceRepository {
  expectRecord(value, label);
  expectExactKeys(value, ['digest', 'files'], label);
  const files = parseContentAddressedFiles(value.files, `${label}.files`);
  const paths = files.map(({ path }) => path);
  if (
    paths.length !== LEGACY_VISUAL_TOOLCHAIN_PATHS.length
    || paths.some(
      (path, index) => path !== LEGACY_VISUAL_TOOLCHAIN_PATHS[index],
    )
  ) {
    throw new Error(
      `${label}.files must contain exactly the protected visual toolchain paths.`,
    );
  }
  const digest = parseLegacyVisualSha256(value.digest, `${label}.digest`);
  if (digest !== computeLegacyVisualRepositoryDigest(files)) {
    throw new Error(`${label}.digest does not match its file manifest.`);
  }
  return { digest, files };
}

function parseRuntime(value: unknown, label: string): ProvenanceRuntime {
  expectRecord(value, label);
  expectExactKeys(value, [
    'nodeVersion', 'playwrightCliLauncherDigest', 'playwrightCliPackageDigest',
    'playwrightCliVersion', 'playwrightCoreVersion',
    'playwrightRuntimePackageDigest', 'pnpmVersion',
  ], label);
  return {
    nodeVersion: readString(value.nodeVersion, `${label}.nodeVersion`),
    playwrightCliLauncherDigest: parseLegacyVisualSha256(
      value.playwrightCliLauncherDigest,
      `${label}.playwrightCliLauncherDigest`,
    ),
    playwrightCliPackageDigest: parseLegacyVisualSha256(
      value.playwrightCliPackageDigest,
      `${label}.playwrightCliPackageDigest`,
    ),
    playwrightRuntimePackageDigest: parseLegacyVisualSha256(
      value.playwrightRuntimePackageDigest,
      `${label}.playwrightRuntimePackageDigest`,
    ),
    playwrightCliVersion: readString(
      value.playwrightCliVersion, `${label}.playwrightCliVersion`,
    ),
    playwrightCoreVersion: readString(
      value.playwrightCoreVersion, `${label}.playwrightCoreVersion`,
    ),
    pnpmVersion: readString(value.pnpmVersion, `${label}.pnpmVersion`),
  };
}

function parseHost(value: unknown, label: string): ProvenanceHost {
  expectRecord(value, label);
  expectExactKeys(value, ['arch', 'fonts', 'osRelease', 'platform'], label);
  const fonts = readArray(value.fonts, `${label}.fonts`).map((entry, index) => {
    const entryLabel = `${label}.fonts[${index}]`;
    expectRecord(entry, entryLabel);
    expectExactKeys(entry, ['fileName', 'sha256'], entryLabel);
    const fileName = readString(entry.fileName, `${entryLabel}.fileName`);
    if (basename(fileName) !== fileName) {
      throw new Error(`${entryLabel}.fileName must not contain a directory.`);
    }
    return {
      fileName,
      sha256: parseLegacyVisualSha256(entry.sha256, `${entryLabel}.sha256`),
    };
  });
  assertUnique(fonts.map(({ fileName }) => fileName), `${label}.fonts names`);
  for (const requiredFont of REQUIRED_FONTS) {
    if (!fonts.some(({ fileName }) => fileName === requiredFont)) {
      throw new Error(`${label}.fonts must include ${requiredFont}.`);
    }
  }
  return {
    arch: readString(value.arch, `${label}.arch`),
    fonts,
    osRelease: readString(value.osRelease, `${label}.osRelease`),
    platform: expectLiteral(value.platform, 'win32', `${label}.platform`),
  };
}

function parseProtocol(value: unknown, label: string): BrowserProtocol {
  expectRecord(value, label);
  expectExactKeys(value, [
    'jsVersion', 'product', 'protocolVersion', 'revision',
  ], label);
  return {
    jsVersion: readString(value.jsVersion, `${label}.jsVersion`),
    product: readString(value.product, `${label}.product`),
    protocolVersion: readString(value.protocolVersion, `${label}.protocolVersion`),
    revision: readString(value.revision, `${label}.revision`),
  };
}

function parseEffectiveArguments(
  value: unknown,
  requiredArguments: readonly string[],
  label: string,
): string[] {
  const argumentsList = readArray(value, label).map(
    (entry, index) => readString(entry, `${label}[${index}]`),
  );
  assertUnique(argumentsList, label);
  const sortedArguments = [...argumentsList].sort();
  if (
    argumentsList.some(
      (argument, index) => argument !== sortedArguments[index],
    )
  ) {
    throw new Error(`${label} must be sorted.`);
  }
  for (const argument of argumentsList) {
    if (!argument.startsWith('--')) {
      throw new Error(`${label} must contain only Chrome switches.`);
    }
    const separatorIndex = argument.indexOf('=');
    const name = (
      separatorIndex === -1 ? argument : argument.slice(0, separatorIndex)
    ).toLowerCase();
    if (EPHEMERAL_ARGUMENT_NAMES.has(name)) {
      throw new Error(`${label} must not contain ephemeral Chrome switches.`);
    }
  }
  for (const requiredArgument of requiredArguments) {
    if (!argumentsList.includes(requiredArgument)) {
      throw new Error(`${label} must include ${requiredArgument}.`);
    }
  }
  return argumentsList;
}

function parseBrowser(value: unknown, label: string): ProvenanceBrowser {
  expectRecord(value, label);
  expectExactKeys(value, [
    'arguments', 'browserName', 'browserVersion', 'channel',
    'distributionFiles', 'effectiveArguments', 'headless',
    'protocol', 'webGlFingerprint',
  ], label);
  const argumentsList = readArray(value.arguments, `${label}.arguments`).map(
    (entry, index) => readString(entry, `${label}.arguments[${index}]`),
  );
  assertUnique(argumentsList, `${label}.arguments`);
  for (const requiredArgument of REQUIRED_ARGUMENTS) {
    if (!argumentsList.includes(requiredArgument)) {
      throw new Error(`${label}.arguments must include ${requiredArgument}.`);
    }
  }
  const browserVersion = readString(
    value.browserVersion, `${label}.browserVersion`,
  );
  if (!CHROME_VERSION_PATTERN.test(browserVersion)) {
    throw new Error(`${label}.browserVersion must be a four-part version.`);
  }
  const distributionFiles = parseContentAddressedFiles(
    value.distributionFiles, `${label}.distributionFiles`,
  );
  const effectiveArguments = parseEffectiveArguments(
    value.effectiveArguments,
    argumentsList,
    `${label}.effectiveArguments`,
  );
  const requiredPaths = [
    'chrome.exe',
    ...REQUIRED_DISTRIBUTION_FILES.map(
      (fileName) => `${browserVersion}/${fileName}`,
    ),
  ];
  for (const requiredPath of requiredPaths) {
    if (!distributionFiles.some(({ path }) => path === requiredPath)) {
      throw new Error(`${label}.distributionFiles must include ${requiredPath}.`);
    }
  }
  expectRecord(value.webGlFingerprint, `${label}.webGlFingerprint`);
  expectExactKeys(value.webGlFingerprint, [
    'renderer',
    'shadingLanguageVersion',
    'unmaskedRenderer',
    'unmaskedVendor',
    'vendor',
    'version',
  ], `${label}.webGlFingerprint`);
  const protocol = parseProtocol(value.protocol, `${label}.protocol`);
  if (protocol.product !== `Chrome/${browserVersion}`) {
    throw new Error(`${label}.protocol.product does not match browserVersion.`);
  }
  return {
    arguments: argumentsList,
    browserName: expectLiteral(
      value.browserName, 'Google Chrome', `${label}.browserName`,
    ),
    browserVersion,
    channel: expectLiteral(value.channel, 'chrome', `${label}.channel`),
    distributionFiles,
    effectiveArguments,
    headless: expectLiteral(value.headless, true, `${label}.headless`),
    protocol,
    webGlFingerprint: parseLegacyVisualWebGlFingerprint(
      value.webGlFingerprint, `${label}.webGlFingerprint`,
    ),
  };
}

function parseContext(value: unknown, label: string): ProvenanceContext {
  expectRecord(value, label);
  expectExactKeys(value, [
    'colorScheme', 'devicePixelRatios', 'locale',
    'reducedMotion', 'timezoneId', 'viewport',
  ], label);
  const dprs = readArray(
    value.devicePixelRatios, `${label}.devicePixelRatios`,
  ).map((entry, index) => (
    readPositiveInteger(entry, `${label}.devicePixelRatios[${index}]`)
  ));
  if (dprs.length !== 2 || dprs[0] !== 1 || dprs[1] !== 2) {
    throw new Error(`${label}.devicePixelRatios must be exactly [1, 2].`);
  }
  expectRecord(value.viewport, `${label}.viewport`);
  expectExactKeys(value.viewport, ['height', 'width'], `${label}.viewport`);
  return {
    colorScheme: expectLiteral(value.colorScheme, 'light', `${label}.colorScheme`),
    devicePixelRatios: [1, 2],
    locale: expectLiteral(value.locale, 'en-US', `${label}.locale`),
    reducedMotion: expectLiteral(
      value.reducedMotion, 'reduce', `${label}.reducedMotion`,
    ),
    timezoneId: expectLiteral(value.timezoneId, 'UTC', `${label}.timezoneId`),
    viewport: {
      height: expectLiteral(value.viewport.height, 900, `${label}.viewport.height`),
      width: expectLiteral(value.viewport.width, 1440, `${label}.viewport.width`),
    },
  };
}

/** Strictly parse a complete legacy visual capture provenance contract. */
export function parseLegacyVisualProvenanceContract(
  value: unknown, label = 'captureContract',
): LegacyVisualProvenanceContract {
  expectRecord(value, label);
  expectExactKeys(value, [
    'browser', 'context', 'host', 'repository', 'runtime', 'schemaVersion',
  ], label);
  return {
    browser: parseBrowser(value.browser, `${label}.browser`),
    context: parseContext(value.context, `${label}.context`),
    host: parseHost(value.host, `${label}.host`),
    repository: parseRepository(value.repository, `${label}.repository`),
    runtime: parseRuntime(value.runtime, `${label}.runtime`),
    schemaVersion: expectLiteral(
      value.schemaVersion, 1, `${label}.schemaVersion`,
    ),
  };
}

/** Recompute every repository file hash and the aggregate manifest digest. */
export function validateLegacyVisualRepositoryProvenance(
  contract: LegacyVisualProvenanceContract,
  repositoryRoot = process.cwd(),
): void {
  validateLegacyVisualRepositoryFiles(
    contract.repository.files,
    contract.repository.digest,
    repositoryRoot,
  );
}

/** Validate the exact local Windows, Arial, Node.js, and Chrome file identity. */
export function validateLegacyVisualLocalHostProvenance(
  contract: LegacyVisualProvenanceContract,
  options: LegacyVisualLocalValidationOptions = {},
): void {
  const environment = options.environment ?? process.env;
  const actualIdentity = {
    arch: options.arch ?? arch,
    nodeVersion: options.nodeVersion ?? process.versions.node,
    osRelease: options.osRelease ?? release(),
    platform: options.platform ?? platform,
  };
  for (const field of ['arch', 'osRelease', 'platform'] as const) {
    if (actualIdentity[field] !== contract.host[field]) {
      throw new Error(`Local host ${field} does not match capture provenance.`);
    }
  }
  if (actualIdentity.nodeVersion !== contract.runtime.nodeVersion) {
    throw new Error('Local Node.js version does not match capture provenance.');
  }
  const windowsRoot = environment.WINDIR ?? environment.SystemRoot;
  if (!windowsRoot) throw new Error('The Windows directory is unavailable.');
  for (const font of contract.host.fonts) {
    const fontPath = resolve(windowsRoot, 'Fonts', font.fileName);
    if (!existsSync(fontPath) || !statSync(fontPath).isFile()) {
      throw new Error(`Windows font ${font.fileName} was not found.`);
    }
    if (computeLegacyVisualFileSha256(fontPath) !== font.sha256) {
      throw new Error(`Windows font ${font.fileName} SHA-256 drifted.`);
    }
  }
  const applicationRoot = resolve(
    resolveLegacyVisualChromeExecutable(environment),
    '..',
  );
  validateLegacyVisualContentAddressedFiles(
    contract.browser.distributionFiles,
    applicationRoot,
    'Chrome distribution file',
  );
}
