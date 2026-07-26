import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { readLegacyCaptureContractEnvelope } from './legacy-capture-contract.mjs';
import {
  validateBrowserMetadataAgainstCaptureContract,
} from './legacy-capture-evidence.mjs';
import {
  CHANNEL_DELTA_THRESHOLD,
  collectKeyPixels,
  compareImages,
  countNonTransparentPixels,
  createMaterialMask,
  decodePng,
  roundMetrics,
  sha256File,
} from './legacy-image-analysis.mjs';
import { syncLegacyVisualManifest } from './sync-legacy-visual-manifest.mjs';

const PUBLIC_UNIFORM_CANVAS_CLASS_NAME = 'liquid-glass-uniform-canvas';
const PUBLIC_UNIFORM_CANVAS_MINIMUM_NON_TRANSPARENT_PIXELS = 1000;
const PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER = 'window-resize';
const PUBLIC_UNIFORM_CANVAS_STABLE_FRAMES = 3;
const PUBLIC_UNIFORM_CANVAS_STABILITY_FINGERPRINT = 'SHA-256 RGBA';
const PUBLIC_UNIFORM_CANVAS_STABILITY_SAMPLING = 'requestAnimationFrame';
const RAW_PUBLIC_CANVAS_SERIALIZATION = 'HTMLCanvasElement.toDataURL("image/png")';
const RAW_PUBLIC_CANVAS_TRANSFER = 'Playwright Download.saveAs';
const SCENARIOS = ['S001', 'S002', 'S003', 'S004', 'S005', 'S006'];
const SCENARIO_STATES = {
  S001: { kind: 'static' },
  S002: { kind: 'static' },
  S003: {
    kind: 'manual-refresh',
    controlTestId: 'manual-refresh',
    settleMilliseconds: 1200,
  },
  S004: {
    kind: 'pointer-hold',
    holdSettleMilliseconds: 900,
    hoverSettleMilliseconds: 300,
    targetTestId: 'interaction-button',
    xRatio: 0.72,
    yRatio: 0.36,
  },
  S005: {
    kind: 'window-scroll',
    settleMilliseconds: 900,
    x: 0,
    y: 420,
  },
  S006: {
    kind: 'internal-scroll',
    scrollTop: 360,
    selector: '.liquid-glass-content.scrollable',
    settleMilliseconds: 1200,
  },
};
const RUN_COUNT = 20;
const SHA_1_PATTERN = /^[a-f0-9]{40}$/u;

function expectRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}
function readPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`);
  return value;
}
function parsePublicUniformCanvas(value, label) {
  const canvas = expectRecord(value, label);
  if (
    !Array.isArray(canvas.classNames)
    || canvas.classNames.some((className) => typeof className !== 'string' || className.length === 0)
    || new Set(canvas.classNames).size !== canvas.classNames.length
  ) throw new Error(`${label}.classNames must contain unique class names.`);
  if (!canvas.classNames.includes(PUBLIC_UNIFORM_CANVAS_CLASS_NAME)) {
    throw new Error(`${label}.classNames must include ${PUBLIC_UNIFORM_CANVAS_CLASS_NAME}.`);
  }
  const width = readPositiveInteger(canvas.width, `${label}.width`);
  const height = readPositiveInteger(canvas.height, `${label}.height`);
  const nonTransparentPixels = readPositiveInteger(canvas.nonTransparentPixels, `${label}.nonTransparentPixels`);
  if (nonTransparentPixels <= PUBLIC_UNIFORM_CANVAS_MINIMUM_NON_TRANSPARENT_PIXELS) {
    throw new Error(
      `${label}.nonTransparentPixels must exceed `
      + `${PUBLIC_UNIFORM_CANVAS_MINIMUM_NON_TRANSPARENT_PIXELS}.`,
    );
  }
  if (nonTransparentPixels > width * height) throw new Error(`${label}.nonTransparentPixels exceeds its canvas area.`);
  return { classNames: canvas.classNames, width, height, nonTransparentPixels };
}
function validatePublicUniformCanvasReadiness(value, label) {
  const readiness = expectRecord(value, label);
  if (readiness.trigger !== PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER) {
    throw new Error(`${label}.trigger must be ${PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER}.`);
  }
  if (readiness.minimumNonTransparentPixels !== PUBLIC_UNIFORM_CANVAS_MINIMUM_NON_TRANSPARENT_PIXELS) {
    throw new Error(
      `${label}.minimumNonTransparentPixels must be `
      + `${PUBLIC_UNIFORM_CANVAS_MINIMUM_NON_TRANSPARENT_PIXELS}.`,
    );
  }
  const stability = expectRecord(readiness.stability, `${label}.stability`);
  if (
    stability.consecutiveFrames !== PUBLIC_UNIFORM_CANVAS_STABLE_FRAMES
    || stability.fingerprint !== PUBLIC_UNIFORM_CANVAS_STABILITY_FINGERPRINT
    || stability.sampling !== PUBLIC_UNIFORM_CANVAS_STABILITY_SAMPLING
  ) {
    throw new Error(`${label}.stability does not match the exact RGBA policy.`);
  }
}
function parseRawPublicCanvas(value, label, expected) {
  const artifact = expectRecord(value, label);
  const expectedFields = {
    artifactPath: `dpr-${expected.dpr}/${expected.scenario}-canvas.png`,
    captureRun: 1,
    selector: `canvas.${PUBLIC_UNIFORM_CANVAS_CLASS_NAME}`,
    serialization: RAW_PUBLIC_CANVAS_SERIALIZATION,
    transfer: RAW_PUBLIC_CANVAS_TRANSFER,
  };
  for (const [field, expectedValue] of Object.entries(expectedFields)) {
    if (artifact[field] !== expectedValue) throw new Error(`${label}.${field} must be ${expectedValue}.`);
  }
  const width = readPositiveInteger(artifact.width, `${label}.width`);
  const height = readPositiveInteger(artifact.height, `${label}.height`);
  const nonTransparentPixels = readPositiveInteger(artifact.nonTransparentPixels, `${label}.nonTransparentPixels`);
  if (nonTransparentPixels <= PUBLIC_UNIFORM_CANVAS_MINIMUM_NON_TRANSPARENT_PIXELS || nonTransparentPixels > width * height) throw new Error(`${label}.nonTransparentPixels is outside the valid canvas area.`);
  return { ...expectedFields, width, height, nonTransparentPixels };
}
function readRequiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}
function parseWebGlFingerprint(value, label) {
  const fingerprint = expectRecord(value, label);
  const parsed = Object.fromEntries([
    'renderer',
    'shadingLanguageVersion',
    'unmaskedRenderer',
    'unmaskedVendor',
    'vendor',
    'version',
  ].map((field) => [
    field,
    readRequiredString(fingerprint[field], `${label}.${field}`),
  ]));
  if (!parsed.unmaskedRenderer.toLowerCase().includes('swiftshader')) {
    throw new Error(`${label}.unmaskedRenderer must identify SwiftShader.`);
  }
  return parsed;
}
function validateCaptureEvidence(value, expected) {
  const label = `DPR ${expected.dpr} capture evidence`;
  const metadata = expectRecord(value, label);
  if (metadata.schemaVersion !== 3) throw new Error(`${label} schemaVersion must be 3.`);
  for (const field of [
    'captureContractSha256',
    'captureId',
    'captureMode',
    'sourceCommit',
  ]) {
    if (metadata[field] !== expected[field]) {
      throw new Error(`${label} ${field} does not match this invocation.`);
    }
  }
  const expectedRunCount = expected.captureMode === 'full' ? RUN_COUNT : 1;
  if (metadata.devicePixelRatio !== expected.dpr || metadata.runCount !== expectedRunCount) {
    throw new Error(`${label} does not match the requested run.`);
  }
  const capturedAt = readRequiredString(metadata.capturedAt, `${label} capturedAt`);
  if (Number.isNaN(Date.parse(capturedAt))) throw new Error(`${label} capturedAt is invalid.`);
  const viewport = expectRecord(metadata.viewport, `${label} viewport`);
  readPositiveInteger(viewport.width, `${label} viewport.width`);
  readPositiveInteger(viewport.height, `${label} viewport.height`);
  for (const field of ['browserName', 'browserVersion', 'userAgent']) {
    readRequiredString(metadata[field], `${label} ${field}`);
  }
  const webGlFingerprint = parseWebGlFingerprint(
    metadata.webGlFingerprint,
    `${label} webGlFingerprint`,
  );
  validatePublicUniformCanvasReadiness(metadata.publicUniformCanvasReadiness, `${label} publicUniformCanvasReadiness`);
  if (!Array.isArray(metadata.scenarios)) throw new Error(`${label} scenarios must be an array.`);
  const scenarioIds = metadata.scenarios.map((scene, index) => (
    readRequiredString(expectRecord(scene, `${label} scenarios[${index}]`).id, `${label} scenarios[${index}].id`)
  ));
  if (JSON.stringify(scenarioIds) !== JSON.stringify(SCENARIOS)) throw new Error(`${label} scenarios are incomplete or out of order.`);
  for (const scene of metadata.scenarios) {
    const sceneLabel = `DPR ${expected.dpr} ${scene.id} current`;
    if (!isDeepStrictEqual(scene.scenarioState, SCENARIO_STATES[scene.id])) {
      throw new Error(`${sceneLabel} scenarioState does not match the capture contract.`);
    }
    parsePublicUniformCanvas(scene.publicUniformCanvas, `${sceneLabel} publicUniformCanvas`);
    if (expected.captureMode === 'full') {
      parseRawPublicCanvas(
        scene.rawPublicCanvas,
        `${sceneLabel} rawPublicCanvas`,
        { dpr: expected.dpr, scenario: scene.id },
      );
    }
    if (!Array.isArray(scene.consoleErrors)) throw new Error(`${sceneLabel} consoleErrors must be an array.`);
    const errorGroups = expected.captureMode === 'full'
      ? scene.consoleErrors.map((group, index) => {
        const record = expectRecord(group, `${sceneLabel} consoleErrors[${index}]`);
        if (!Array.isArray(record.errors)) throw new Error(`${sceneLabel} consoleErrors[${index}].errors must be an array.`);
        return record.errors;
      })
      : [scene.consoleErrors];
    if (errorGroups.some((errors) => errors.length > 0)) throw new Error(`${sceneLabel} ${expected.captureMode} capture reported runtime errors.`);
  }
  metadata.webGlFingerprint = webGlFingerprint;
  return metadata;
}

const repositoryRoot = resolve(process.argv[2] ?? '.');
const calibrationRoot = resolve(process.argv[3] ?? '');
const sourceCommit = process.argv[4] ?? '';
const captureMode = process.argv[5] ?? '';
const captureId = process.argv[6] ?? '';
const captureEvidenceRoot = resolve(process.argv[7] ?? '');
const capturedDprs = (process.argv[8] ?? '').split(',').map(Number).sort();
const baselineRoot = resolve(
  process.argv[9]
  ?? resolve(repositoryRoot, 'tests/baselines/legacy'),
);
const captureContractPath = resolve(process.argv[10] ?? '');
if (!process.argv[3]) throw new Error('Calibration root argument is required.');
if (!process.argv[10]) throw new Error('Capture contract path argument is required.');
if (!SHA_1_PATTERN.test(sourceCommit)) throw new Error('Resolved source commit must be a lowercase 40-character SHA-1.');
if (captureMode !== 'full') throw new Error('Only a full capture can generate publishable legacy baselines.');
if (!/^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$/u.test(captureId)) throw new Error('Capture ID has an invalid format.');
if (
  capturedDprs.length !== 2
  || capturedDprs[0] !== 1
  || capturedDprs[1] !== 2
) {
  throw new Error('Publishable legacy baselines require one full DPR 1 and DPR 2 capture.');
}

const captureContractEvidence = readLegacyCaptureContractEnvelope(
  captureContractPath,
  repositoryRoot,
);
const visualRoot = resolve(baselineRoot, 'visual');
const currentCaptureEvidence = new Map(capturedDprs.map((dpr) => [
  dpr,
  validateCaptureEvidence(
    JSON.parse(readFileSync(resolve(captureEvidenceRoot, `browser-dpr-${dpr}.json`), 'utf8')),
    {
      captureContractSha256: captureContractEvidence.contractSha256,
      captureId,
      captureMode,
      dpr,
      sourceCommit,
    },
  ),
]));
for (const [dpr, evidence] of currentCaptureEvidence) {
  validateBrowserMetadataAgainstCaptureContract(
    evidence,
    dpr,
    captureContractEvidence.contract,
    `DPR ${dpr} current capture evidence`,
  );
}
const report = {
  schemaVersion: 3,
  generatedAt: new Date().toISOString(),
  sourceCommit,
  captureEvidence: {
    captureId,
    captureMode,
    contract: captureContractEvidence.contract,
    contractSha256: captureContractEvidence.contractSha256,
    capturedDevicePixelRatios: capturedDprs,
    browsers: [...currentCaptureEvidence.values()].map((entry) => ({
      browserName: entry.browserName, browserVersion: entry.browserVersion,
      capturedAt: entry.capturedAt, devicePixelRatio: entry.devicePixelRatio,
      runtimeErrorCount: 0, userAgent: entry.userAgent, viewport: entry.viewport,
      webGlFingerprint: entry.webGlFingerprint,
    })),
  },
  comparison: {
    runCount: RUN_COUNT,
    ignoredChannelDeltaAtOrBelow: CHANNEL_DELTA_THRESHOLD,
    thresholdFormula: 'min(0.005, max(0.001, 3 * maxSelfDiffRatio))',
    thresholdCap: 0.005,
    publicUniformCanvasReadiness: {
      trigger: PUBLIC_UNIFORM_CANVAS_READINESS_TRIGGER,
      minimumNonTransparentPixels: PUBLIC_UNIFORM_CANVAS_MINIMUM_NON_TRANSPARENT_PIXELS,
      stability: {
        consecutiveFrames: PUBLIC_UNIFORM_CANVAS_STABLE_FRAMES,
        fingerprint: PUBLIC_UNIFORM_CANVAS_STABILITY_FINGERPRINT,
        sampling: PUBLIC_UNIFORM_CANVAS_STABILITY_SAMPLING,
      },
    },
  },
  browsers: [],
  passed: true,
};

for (const devicePixelRatio of [1, 2]) {
  const browserMetadata = JSON.parse(readFileSync(resolve(visualRoot, `browser-dpr-${devicePixelRatio}.json`), 'utf8'));
  if (browserMetadata.schemaVersion !== 3) throw new Error(`DPR ${devicePixelRatio} browser metadata schemaVersion must be 3.`);
  if (browserMetadata.devicePixelRatio !== devicePixelRatio || browserMetadata.runCount !== RUN_COUNT) {
    throw new Error(`DPR ${devicePixelRatio} browser metadata does not match the requested calibration.`);
  }
  if (
    browserMetadata.captureContractSha256
    !== captureContractEvidence.contractSha256
  ) {
    throw new Error(`DPR ${devicePixelRatio} browser metadata capture contract does not match.`);
  }
  validateBrowserMetadataAgainstCaptureContract(
    browserMetadata,
    devicePixelRatio,
    captureContractEvidence.contract,
    `DPR ${devicePixelRatio} staged browser metadata`,
  );
  validatePublicUniformCanvasReadiness(browserMetadata.publicUniformCanvasReadiness, `DPR ${devicePixelRatio} publicUniformCanvasReadiness`);
  const currentEvidence = currentCaptureEvidence.get(devicePixelRatio);
  if (currentEvidence && captureMode === 'full' && browserMetadata.sourceCommit !== sourceCommit) {
    throw new Error(`DPR ${devicePixelRatio} browser metadata source commit is not current.`);
  }
  if (currentEvidence) {
    const browserIdentity = ['browserName', 'browserVersion', 'userAgent'];
    const fieldsMatch = browserIdentity.every((field) => currentEvidence[field] === browserMetadata[field]);
    const viewportMatches = JSON.stringify(currentEvidence.viewport) === JSON.stringify(browserMetadata.viewport);
    const webGlMatches = isDeepStrictEqual(
      currentEvidence.webGlFingerprint,
      parseWebGlFingerprint(
        browserMetadata.webGlFingerprint,
        `DPR ${devicePixelRatio} browser metadata webGlFingerprint`,
      ),
    );
    if (!fieldsMatch || !viewportMatches || !webGlMatches) throw new Error(`DPR ${devicePixelRatio} current browser identity differs from glass-on evidence.`);
  }

  const browserResult = {
    browserName: browserMetadata.browserName,
    browserVersion: browserMetadata.browserVersion,
    userAgent: browserMetadata.userAgent,
    viewport: browserMetadata.viewport,
    webGlFingerprint: browserMetadata.webGlFingerprint,
    devicePixelRatio,
    scenarios: [],
  };

  for (const scenario of SCENARIOS) {
    const sceneMetadata = browserMetadata.scenarios.find((entry) => entry.id === scenario);
    if (!sceneMetadata) throw new Error(`Missing metadata for DPR ${devicePixelRatio} ${scenario}.`);
    const currentScene = currentEvidence?.scenarios.find((entry) => entry.id === scenario);
    if (currentEvidence && !currentScene) throw new Error(`Current capture evidence is missing DPR ${devicePixelRatio} ${scenario}.`);
    const publicUniformCanvas = parsePublicUniformCanvas(sceneMetadata.publicUniformCanvas, `DPR ${devicePixelRatio} ${scenario}.publicUniformCanvas`);
    const rawPublicCanvas = parseRawPublicCanvas(sceneMetadata.rawPublicCanvas, `DPR ${devicePixelRatio} ${scenario}.rawPublicCanvas`, { dpr: devicePixelRatio, scenario });
    const classesMatch = !currentScene || JSON.stringify(currentScene.publicUniformCanvas.classNames) === JSON.stringify(publicUniformCanvas.classNames);
    const dimensionsMatch = !currentScene || (
      currentScene.publicUniformCanvas.width === publicUniformCanvas.width
      && currentScene.publicUniformCanvas.height === publicUniformCanvas.height
    );
    if (!classesMatch || !dimensionsMatch) throw new Error(`DPR ${devicePixelRatio} ${scenario} current canvas identity differs from glass-on evidence.`);
    parseRawPublicCanvas(currentScene.rawPublicCanvas, `DPR ${devicePixelRatio} ${scenario} current rawPublicCanvas`, { dpr: devicePixelRatio, scenario });
    const metadataCanvases = sceneMetadata.metadata?.canvases;
    if (!Array.isArray(metadataCanvases)) throw new Error(`DPR ${devicePixelRatio} ${scenario} canvas metadata is missing.`);
    const matchingCanvas = metadataCanvases.find(
      (canvas) => (
        typeof canvas.className === 'string'
        && canvas.className.split(/\s+/u).includes(PUBLIC_UNIFORM_CANVAS_CLASS_NAME)
      ),
    );
    if (
      !matchingCanvas
      || matchingCanvas.width !== publicUniformCanvas.width
      || matchingCanvas.height !== publicUniformCanvas.height
    ) {
      throw new Error(`DPR ${devicePixelRatio} ${scenario} public uniform canvas dimensions do not match the scene metadata.`);
    }
    const rawPublicCanvasPath = resolve(
      visualRoot,
      rawPublicCanvas.artifactPath,
    );
    const rawPublicCanvasImage = decodePng(rawPublicCanvasPath);
    if (rawPublicCanvasImage.colorType !== 6) throw new Error(`DPR ${devicePixelRatio} ${scenario} raw canvas PNG must use RGBA encoding.`);
    if (
      rawPublicCanvasImage.width !== rawPublicCanvas.width
      || rawPublicCanvasImage.height !== rawPublicCanvas.height
      || rawPublicCanvas.width !== publicUniformCanvas.width
      || rawPublicCanvas.height !== publicUniformCanvas.height
    ) {
      throw new Error(`DPR ${devicePixelRatio} ${scenario} raw canvas dimensions do not match browser evidence.`);
    }
    const rawPublicCanvasNonTransparentPixels = countNonTransparentPixels(rawPublicCanvasImage);
    if (
      rawPublicCanvasNonTransparentPixels
      !== rawPublicCanvas.nonTransparentPixels
    ) {
      throw new Error(`DPR ${devicePixelRatio} ${scenario} raw canvas alpha does not match its serialization evidence.`);
    }

    const firstRunPath = resolve(
      calibrationRoot,
      `dpr-${devicePixelRatio}`,
      `${scenario}-run-01.png`,
    );
    const firstRun = decodePng(firstRunPath);
    let maxSelfDiffRatio = 0;
    let maxSelfDiffRun = 1;
    const selfDiffs = [];
    for (let run = 2; run <= RUN_COUNT; run += 1) {
      const candidate = decodePng(resolve(calibrationRoot, `dpr-${devicePixelRatio}`, `${scenario}-run-${String(run).padStart(2, '0')}.png`));
      const metrics = compareImages(firstRun, candidate);
      selfDiffs.push({ run, ...roundMetrics(metrics) });
      if (metrics.diffRatio > maxSelfDiffRatio) {
        maxSelfDiffRatio = metrics.diffRatio;
        maxSelfDiffRun = run;
      }
    }

    const threshold = Math.min(0.005, Math.max(0.001, 3 * maxSelfDiffRatio));
    const glassOnArtifactPath =
      `tests/baselines/legacy/visual/dpr-${devicePixelRatio}/`
      + `${scenario}-glass-on.png`;
    const glassOffArtifactPath =
      `tests/baselines/legacy/visual/dpr-${devicePixelRatio}/`
      + `${scenario}-glass-off.png`;
    const glassOnPath = resolve(
      visualRoot,
      `dpr-${devicePixelRatio}`,
      `${scenario}-glass-on.png`,
    );
    const glassOffPath = resolve(
      visualRoot,
      `dpr-${devicePixelRatio}`,
      `${scenario}-glass-off.png`,
    );
    const glassOn = decodePng(glassOnPath);
    const glassOff = decodePng(glassOffPath);
    if (sha256File(glassOnPath) !== sha256File(firstRunPath)) {
      throw new Error(
        `DPR ${devicePixelRatio} ${scenario} glass-on artifact differs from calibrated run 1.`,
      );
    }
    const materialMask = createMaterialMask(glassOn, sceneMetadata.metadata.materials, devicePixelRatio);
    const glassDifference = compareImages(glassOn, glassOff, materialMask);
    const consoleErrorCount = sceneMetadata.consoleErrors.reduce(
      (total, run) => total + run.errors.length,
      0,
    );
    const meaningfulDifference = glassDifference.diffRatio > threshold;
    const scenePassed = meaningfulDifference && consoleErrorCount === 0;
    report.passed = report.passed && scenePassed;

    browserResult.scenarios.push({
      id: scenario,
      screenshotDimensions: { width: glassOn.width, height: glassOn.height },
      canvasDimensions: sceneMetadata.metadata.canvases,
      publicUniformCanvas,
      rawPublicCanvas: {
        ...rawPublicCanvas,
        artifactPath: `tests/baselines/legacy/visual/${rawPublicCanvas.artifactPath}`,
        sha256: sha256File(rawPublicCanvasPath),
      },
      screenshotArtifacts: {
        glassOff: {
          artifactPath: glassOffArtifactPath,
          sha256: sha256File(glassOffPath),
        },
        glassOn: {
          artifactPath: glassOnArtifactPath,
          sha256: sha256File(glassOnPath),
        },
      },
      scenarioState: SCENARIO_STATES[scenario],
      materialRectangles: sceneMetadata.metadata.materials,
      scrollPosition: { x: sceneMetadata.metadata.scrollX, y: sceneMetadata.metadata.scrollY },
      selfDiff: {
        maxRatio: Number(maxSelfDiffRatio.toFixed(12)),
        maxRun: maxSelfDiffRun,
        threshold: Number(threshold.toFixed(12)),
        runs: selfDiffs,
      },
      glassOnVersusOff: { ...roundMetrics(glassDifference), exceedsThreshold: meaningfulDifference },
      keyPixels: collectKeyPixels(glassOn, glassOff, sceneMetadata.metadata.materials, devicePixelRatio),
      consoleErrorCount,
      consoleErrors: sceneMetadata.consoleErrors,
      passed: scenePassed,
    });
  }

  report.browsers.push(browserResult);
}

writeFileSync(resolve(baselineRoot, 'visual-calibration.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
syncLegacyVisualManifest(baselineRoot, report);

if (!report.passed) throw new Error('Legacy visual oracle failed: inspect visual-calibration.json for scene-level evidence.');
