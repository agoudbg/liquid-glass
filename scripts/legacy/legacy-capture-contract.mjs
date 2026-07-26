import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { arch, platform, release } from 'node:os';
import {
  dirname,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REQUIRED_BROWSER_ARGUMENTS,
  validateLegacyCaptureConfigs,
} from './legacy-capture-config.mjs';

export {
  REQUIRED_BROWSER_ARGUMENTS,
  validateLegacyCaptureConfigs,
};

const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;
export const TOOLCHAIN_PATHS = Object.freeze([
  '.node-version',
  'scripts/legacy/analyze-legacy-oracle.mjs',
  'scripts/legacy/capture-legacy-oracle.ps1',
  'scripts/legacy/legacy-capture-config.mjs',
  'scripts/legacy/legacy-capture-contract.mjs',
  'scripts/legacy/legacy-capture-evidence.mjs',
  'scripts/legacy/legacy-capture-helpers.ps1',
  'scripts/legacy/legacy-capture-validation.ps1',
  'scripts/legacy/legacy-image-analysis.mjs',
  'scripts/legacy/legacy-playwright-runtime.mjs',
  'scripts/legacy/legacy-promotion-transaction.ps1',
  'scripts/legacy/legacy-toolchain-snapshot.mjs',
  'scripts/legacy/sync-legacy-visual-manifest.mjs',
  'tests/legacy-oracle/capture-contract-probe.js',
  'tests/legacy-oracle/capture-run-code.js',
  'tests/legacy-oracle/config/dpr-1.json',
  'tests/legacy-oracle/config/dpr-2.json',
  'tests/legacy-oracle/harness/OracleApp.vue',
  'tests/legacy-oracle/harness/main.ts',
  'tests/legacy-oracle/harness/oracle.css',
]);
const CHROME_DISTRIBUTION_FILES = [
  'chrome.exe',
  '{version}/chrome.dll',
  '{version}/libEGL.dll',
  '{version}/libGLESv2.dll',
  '{version}/vk_swiftshader.dll',
  '{version}/vk_swiftshader_icd.json',
  '{version}/vulkan-1.dll',
];
const FONT_FILES = ['arial.ttf', 'arialbd.ttf'];
const EPHEMERAL_BROWSER_ARGUMENT_NAMES = new Set([
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

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function requireSha256(value, label) {
  const digest = requireString(value, label);
  if (!SHA_256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256.`);
  }
  return digest;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((entry, index) => (
    requireString(entry, `${label}[${index}]`)
  ));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fileEvidence(root, paths) {
  return paths.slice().sort().map((path) => {
    const absolutePath = resolve(root, path);
    if (!existsSync(absolutePath)) {
      throw new Error(`Capture contract file is missing: ${path}`);
    }
    return { path: path.replaceAll('\\', '/'), sha256: sha256File(absolutePath) };
  });
}

function evidenceDigest(files) {
  return sha256Bytes(JSON.stringify(canonicalize(files)));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

/** Serialize one capture contract with recursively sorted object keys. */
export function canonicalCaptureContractJson(contract) {
  return JSON.stringify(canonicalize(contract));
}

/** Compute the stable SHA-256 identity of one capture contract. */
export function captureContractSha256(contract) {
  return sha256Bytes(canonicalCaptureContractJson(contract));
}

/**
 * Remove per-run Chrome transport and filesystem arguments from a probe.
 *
 * The remaining sorted set binds the contract to every effective, stable
 * browser switch while keeping temporary profile paths out of provenance.
 */
export function normalizeEffectiveBrowserArguments(argumentsValue) {
  const stableArguments = requireStringArray(
    argumentsValue,
    'effective browser arguments',
  ).filter((argument) => {
    if (!argument.startsWith('--')) return false;
    const separatorIndex = argument.indexOf('=');
    const name = (
      separatorIndex === -1 ? argument : argument.slice(0, separatorIndex)
    ).toLowerCase();
    return !EPHEMERAL_BROWSER_ARGUMENT_NAMES.has(name);
  });
  return [...new Set(stableArguments)].sort((left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

/** Recompute the repository file set used by publishable legacy capture. */
export function readRepositoryToolchain(repositoryRoot) {
  const files = fileEvidence(repositoryRoot, TOOLCHAIN_PATHS);
  return { digest: evidenceDigest(files), files };
}

function readConfigContract(repositoryRoot) {
  const configs = [1, 2].map((dpr) => (
    readJson(resolve(
      repositoryRoot,
      `tests/legacy-oracle/config/dpr-${dpr}.json`,
    ))
  ));
  return validateLegacyCaptureConfigs(configs);
}

function validateProbe(probe, configContract, chromeProductVersion) {
  requireRecord(probe, 'probe');
  const pageEnvironment = requireRecord(
    probe.pageEnvironment,
    'probe.pageEnvironment',
  );
  const browserProtocol = requireRecord(
    probe.browserProtocol,
    'probe.browserProtocol',
  );
  if (
    probe.browserName !== 'Google Chrome'
    || probe.browserVersion !== chromeProductVersion
    || JSON.stringify(probe.browserArguments)
      !== JSON.stringify(configContract.browserArguments)
  ) {
    throw new Error('Chrome probe does not match the configured browser.');
  }
  const effectiveBrowserArguments = requireStringArray(
    probe.effectiveBrowserArguments,
    'probe.effectiveBrowserArguments',
  );
  const normalizedEffectiveBrowserArguments = (
    normalizeEffectiveBrowserArguments(effectiveBrowserArguments)
  );
  if (
    JSON.stringify(effectiveBrowserArguments)
      !== JSON.stringify(normalizedEffectiveBrowserArguments)
    || configContract.browserArguments.some((argument) => (
      !effectiveBrowserArguments.includes(argument)
    ))
  ) {
    throw new Error(
      'Chrome probe effective arguments are not normalized or omit a required argument.',
    );
  }
  const context = configContract.context;
  if (
    pageEnvironment.colorScheme !== context.colorScheme
    || pageEnvironment.locale !== context.locale
    || pageEnvironment.reducedMotion !== context.reducedMotion
    || pageEnvironment.timezoneId !== context.timezoneId
    || pageEnvironment.devicePixelRatio !== 1
    || JSON.stringify(probe.viewport) !== JSON.stringify(context.viewport)
  ) {
    throw new Error('Chrome probe context does not match the capture config.');
  }
  const webGlFingerprint = requireRecord(
    pageEnvironment.webGlFingerprint,
    'probe.pageEnvironment.webGlFingerprint',
  );
  if (!String(webGlFingerprint.unmaskedRenderer).toLowerCase().includes('swiftshader')) {
    throw new Error('Chrome probe must use SwiftShader.');
  }
  return {
    browserName: probe.browserName,
    browserVersion: probe.browserVersion,
    effectiveBrowserArguments,
    browserProtocol: Object.fromEntries(
      ['jsVersion', 'product', 'protocolVersion', 'revision'].map((field) => [
        field,
        requireString(browserProtocol[field], `probe.browserProtocol.${field}`),
      ]),
    ),
    webGlFingerprint,
  };
}

/** Create the complete immutable contract used by a full legacy capture. */
export function createLegacyCaptureContract(repositoryRoot, input) {
  requireRecord(input, 'contract input');
  const configContract = readConfigContract(repositoryRoot);
  const chromeExecutablePath = resolve(requireString(
    input.chromeExecutablePath,
    'contract input chromeExecutablePath',
  ));
  const chromeApplicationRoot = dirname(chromeExecutablePath);
  const chromeProductVersion = requireString(
    input.chromeProductVersion,
    'contract input chromeProductVersion',
  );
  const probe = validateProbe(
    input.probe,
    configContract,
    chromeProductVersion,
  );
  const repository = readRepositoryToolchain(repositoryRoot);
  const distributionPaths = CHROME_DISTRIBUTION_FILES.map((path) => (
    path.replace('{version}', chromeProductVersion)
  ));
  const distributionFiles = fileEvidence(
    chromeApplicationRoot,
    distributionPaths,
  );
  const windowsDirectory = resolve(requireString(
    input.windowsDirectory,
    'contract input windowsDirectory',
  ));
  const fonts = fileEvidence(resolve(windowsDirectory, 'Fonts'), FONT_FILES)
    .map(({ path, sha256 }) => ({ fileName: path, sha256 }));
  const host = requireRecord(input.host, 'contract input host');
  if (
    host.platform !== platform()
    || host.arch !== arch()
    || host.osRelease !== release()
  ) {
    throw new Error('Contract input host does not match the current process.');
  }
  return {
    schemaVersion: 1,
    browser: {
      arguments: configContract.browserArguments,
      browserName: probe.browserName,
      browserVersion: probe.browserVersion,
      channel: 'chrome',
      distributionFiles,
      effectiveArguments: probe.effectiveBrowserArguments,
      headless: true,
      protocol: probe.browserProtocol,
      webGlFingerprint: probe.webGlFingerprint,
    },
    context: configContract.context,
    host: {
      arch: host.arch,
      fonts,
      osRelease: host.osRelease,
      platform: host.platform,
    },
    repository,
    runtime: {
      nodeVersion: requireString(input.nodeVersion, 'contract input nodeVersion'),
      playwrightCliLauncherDigest: requireSha256(
        input.playwrightCliLauncherDigest,
        'contract input playwrightCliLauncherDigest',
      ),
      playwrightCliPackageDigest: requireSha256(
        input.playwrightCliPackageDigest,
        'contract input playwrightCliPackageDigest',
      ),
      playwrightRuntimePackageDigest: requireSha256(
        input.playwrightRuntimePackageDigest,
        'contract input playwrightRuntimePackageDigest',
      ),
      playwrightCliVersion: requireString(
        input.playwrightCliVersion,
        'contract input playwrightCliVersion',
      ),
      playwrightCoreVersion: requireString(
        input.playwrightCoreVersion,
        'contract input playwrightCoreVersion',
      ),
      pnpmVersion: requireString(input.pnpmVersion, 'contract input pnpmVersion'),
    },
  };
}

/** Read one envelope and validate its hash plus current repository toolchain. */
export function readLegacyCaptureContractEnvelope(path, repositoryRoot) {
  const envelope = requireRecord(readJson(path), 'capture contract envelope');
  if (envelope.schemaVersion !== 1) {
    throw new Error('Capture contract envelope schemaVersion must be 1.');
  }
  const contract = requireRecord(envelope.contract, 'capture contract');
  const declaredSha = requireString(
    envelope.contractSha256,
    'capture contract SHA-256',
  );
  if (
    !SHA_256_PATTERN.test(declaredSha)
    || captureContractSha256(contract) !== declaredSha
  ) {
    throw new Error('Capture contract SHA-256 does not match its content.');
  }
  const currentRepository = readRepositoryToolchain(repositoryRoot);
  const contractRepository = requireRecord(
    contract.repository,
    'capture contract repository',
  );
  if (
    contractRepository.digest !== currentRepository.digest
    || JSON.stringify(contractRepository.files)
      !== JSON.stringify(currentRepository.files)
  ) {
    throw new Error('Capture toolchain files changed after contract creation.');
  }
  return { contract, contractSha256: declaredSha };
}

/**
 * Rebuild and compare the entire current capture environment with an envelope.
 *
 * The caller must provide a fresh browser probe and runtime input from the
 * current capture session. Repository, Chrome, and font bytes are always read
 * again while rebuilding the contract.
 */
export function verifyCurrentLegacyCaptureEnvironment(
  path,
  repositoryRoot,
  input,
) {
  const declared = readLegacyCaptureContractEnvelope(path, repositoryRoot);
  const currentContract = createLegacyCaptureContract(repositoryRoot, input);
  const currentSha = captureContractSha256(currentContract);
  if (
    currentSha !== declared.contractSha256
    || canonicalCaptureContractJson(currentContract)
      !== canonicalCaptureContractJson(declared.contract)
  ) {
    throw new Error(
      'Current capture environment differs from the declared capture contract.',
    );
  }
  return declared;
}

function writeEnvelope(repositoryRoot, inputPath, outputPath) {
  const contract = createLegacyCaptureContract(
    repositoryRoot,
    readJson(inputPath),
  );
  const envelope = {
    schemaVersion: 1,
    contract,
    contractSha256: captureContractSha256(contract),
  };
  writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return envelope.contractSha256;
}

function comparableRealPath(path) {
  const realPath = realpathSync.native(resolve(path));
  return platform() === 'win32' ? realPath.toLowerCase() : realPath;
}

const invokedPath = process.argv[1]
  ? comparableRealPath(process.argv[1])
  : '';
if (invokedPath === comparableRealPath(fileURLToPath(import.meta.url))) {
  const command = process.argv[2] ?? '';
  const repositoryRoot = resolve(process.argv[3] ?? '.');
  if (command === 'repository-digest') {
    process.stdout.write(`${readRepositoryToolchain(repositoryRoot).digest}\n`);
  } else if (command === 'repository-evidence') {
    process.stdout.write(`${JSON.stringify(readRepositoryToolchain(repositoryRoot))}\n`);
  } else if (command === 'create') {
    const inputPath = resolve(process.argv[4] ?? '');
    const outputPath = resolve(process.argv[5] ?? '');
    process.stdout.write(
      `${writeEnvelope(repositoryRoot, inputPath, outputPath)}\n`,
    );
  } else if (command === 'verify-repository') {
    const contractPath = resolve(process.argv[4] ?? '');
    process.stdout.write(
      `${readLegacyCaptureContractEnvelope(contractPath, repositoryRoot)
        .contractSha256}\n`,
    );
  } else if (command === 'verify-current-environment') {
    const inputPath = resolve(process.argv[4] ?? '');
    const contractPath = resolve(process.argv[5] ?? '');
    process.stdout.write(
      `${verifyCurrentLegacyCaptureEnvironment(
        contractPath,
        repositoryRoot,
        readJson(inputPath),
      ).contractSha256}\n`,
    );
  } else {
    throw new Error(`Unsupported capture contract command: ${command}`);
  }
}
