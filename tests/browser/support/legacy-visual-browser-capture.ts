import { isDeepStrictEqual } from 'node:util';

import {
  type LegacyVisualCalibrationCaptureSummary,
} from './legacy-visual-capture-summary';
import {
  type LegacyVisualBrowserIdentity,
  parseLegacyVisualBrowserIdentity,
} from './legacy-visual-manifest';
import {
  type LegacyPublicUniformCanvasStability,
  type LegacyVisualDimensions,
  type LegacyVisualSceneCalibration,
  parseLegacyPublicCanvasStability,
} from './legacy-visual-scenario';
import {
  expectRecord,
  haveSameValues,
  readArray,
  readNumber,
  readPositiveInteger,
  readString,
} from './legacy-visual-schema';
import {
  type LegacyVisualCaptureSessionEnvironment,
  parseLegacyVisualCaptureSessionEnvironment,
} from './legacy-visual-session-environment';
import {
  haveSameLegacyVisualWebGlFingerprint,
  type LegacyVisualWebGlFingerprint,
  parseLegacyVisualWebGlFingerprint,
} from './legacy-visual-webgl';

const CAPTURE_ID_PATTERN = /^[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$/u;
const RAW_SELECTOR = 'canvas.liquid-glass-uniform-canvas';
const RAW_SERIALIZATION = 'HTMLCanvasElement.toDataURL("image/png")';
const RAW_TRANSFER = 'Playwright Download.saveAs';

/** Gate fields required to validate one committed browser capture. */
export interface LegacyVisualBrowserCaptureGate
  extends LegacyVisualBrowserIdentity {
  /** Calibrated scene contracts for every DPR. */
  calibrations: readonly LegacyVisualSceneCalibration[];
  /** Full-capture provenance recorded by the calibration report. */
  captureEvidence: LegacyVisualCalibrationCaptureSummary;
  /** Exact legacy source commit. */
  oracleCommit: string;
  /** Shared public-canvas readiness policy. */
  publicUniformCanvasReadiness: {
    /** Exclusive alpha coverage floor. */
    minimumNonTransparentPixels: number;
    /** Exact frame-stability policy. */
    stability: LegacyPublicUniformCanvasStability;
    /** Required lifecycle trigger. */
    trigger: string;
  };
  /** Required calibration run count. */
  runCount: number;
  /** Required scene identifiers. */
  scenarioIds: readonly string[];
  /** Shared CSS viewport. */
  viewport: LegacyVisualDimensions;
  /** Exact SwiftShader WebGL2 identity. */
  webGlFingerprint: LegacyVisualWebGlFingerprint;
}

/** Validated browser metadata committed beside one DPR artifact set. */
export interface LegacyVisualBrowserCaptureMetadata
  extends LegacyVisualBrowserIdentity, LegacyVisualCaptureSessionEnvironment {
  /** Unique capture invocation identifier. */
  captureId: string;
  /** Full capture mode required for committed evidence. */
  captureMode: 'full';
  /** Canonical SHA-256 identity of the complete capture contract. */
  captureContractSha256: string;
  /** ISO timestamp shared with calibration-level capture evidence. */
  capturedAt: string;
  /** DPR represented by this capture. */
  devicePixelRatio: number;
  /** Number of calibration runs per scene. */
  runCount: number;
  /** Exact legacy source commit. */
  sourceCommit: string;
  /** CSS viewport used by the capture. */
  viewport: LegacyVisualDimensions;
  /** Exact SwiftShader WebGL2 identity used by the capture. */
  webGlFingerprint: LegacyVisualWebGlFingerprint;
}

function expectMatchingNumber(
  value: unknown,
  expected: number,
  label: string,
): void {
  if (value !== expected) {
    throw new Error(`${label} does not match the visual gate.`);
  }
}

function validateRuntimeErrors(value: unknown, label: string): void {
  const errorGroups = readArray(value, label);
  for (const [index, groupValue] of errorGroups.entries()) {
    const groupLabel = `${label}[${index}]`;
    expectRecord(groupValue, groupLabel);
    if (readArray(groupValue.errors, `${groupLabel}.errors`).length > 0) {
      throw new Error(`${label} must not contain runtime errors.`);
    }
  }
}

function validateRectangle(
  value: unknown,
  expected: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  },
  label: string,
): void {
  expectRecord(value, label);
  const fields = {
    bottom: readNumber(value.bottom, `${label}.bottom`),
    left: readNumber(value.left, `${label}.left`),
    right: readNumber(value.right, `${label}.right`),
    top: readNumber(value.top, `${label}.top`),
  };
  for (const field of ['bottom', 'left', 'right', 'top'] as const) {
    expectMatchingNumber(fields[field], expected[field], `${label}.${field}`);
  }
  expectMatchingNumber(
    readNumber(value.x, `${label}.x`),
    expected.left,
    `${label}.x`,
  );
  expectMatchingNumber(
    readNumber(value.y, `${label}.y`),
    expected.top,
    `${label}.y`,
  );
  expectMatchingNumber(
    readNumber(value.width, `${label}.width`),
    expected.right - expected.left,
    `${label}.width`,
  );
  expectMatchingNumber(
    readNumber(value.height, `${label}.height`),
    expected.bottom - expected.top,
    `${label}.height`,
  );
}

function validateSceneMetadata(
  value: unknown,
  scenarioId: string,
  devicePixelRatio: number,
  calibration: LegacyVisualSceneCalibration,
  label: string,
): void {
  expectRecord(value, label);
  if (value.scene !== scenarioId) {
    throw new Error(`${label}.scene does not match the scenario id.`);
  }
  expectMatchingNumber(
    value.devicePixelRatio,
    devicePixelRatio,
    `${label}.devicePixelRatio`,
  );
  expectMatchingNumber(
    value.scrollX,
    calibration.scrollPosition.x,
    `${label}.scrollX`,
  );
  expectMatchingNumber(
    value.scrollY,
    calibration.scrollPosition.y,
    `${label}.scrollY`,
  );

  const canvases = readArray(value.canvases, `${label}.canvases`);
  if (canvases.length !== 1) {
    throw new Error(`${label}.canvases must contain one public canvas.`);
  }
  const canvas = canvases[0];
  expectRecord(canvas, `${label}.canvases[0]`);
  const classNames = readString(
    canvas.className,
    `${label}.canvases[0].className`,
  ).split(/\s+/u).filter(Boolean);
  if (!haveSameValues(
    classNames,
    calibration.publicUniformCanvas.classNames,
  )) {
    throw new Error(
      `${label}.canvases[0].className does not match the public canvas.`,
    );
  }
  expectMatchingNumber(
    canvas.width,
    calibration.publicUniformCanvas.width,
    `${label}.canvases[0].width`,
  );
  expectMatchingNumber(
    canvas.height,
    calibration.publicUniformCanvas.height,
    `${label}.canvases[0].height`,
  );
  validateRectangle(
    canvas.rect,
    calibration.publicUniformCanvasRect,
    `${label}.canvases[0].rect`,
  );

  const materials = readArray(value.materials, `${label}.materials`);
  if (materials.length !== calibration.materialRectangles.length) {
    throw new Error(`${label}.materials count does not match calibration.`);
  }
  for (const [index, materialValue] of materials.entries()) {
    const materialLabel = `${label}.materials[${index}]`;
    expectRecord(materialValue, materialLabel);
    const expected = calibration.materialRectangles[index];
    if (!expected || materialValue.id !== expected.id) {
      throw new Error(`${materialLabel}.id does not match material order.`);
    }
    validateRectangle(materialValue.rect, expected.rect, `${materialLabel}.rect`);
  }
}

function validateScene(
  value: unknown,
  devicePixelRatio: number,
  gate: LegacyVisualBrowserCaptureGate,
  label: string,
): string {
  expectRecord(value, label);
  const scenarioId = readString(value.id, `${label}.id`);
  const calibration = gate.calibrations.find((entry) => (
    entry.devicePixelRatio === devicePixelRatio
    && entry.scenarioId === scenarioId
  ));
  if (!calibration) {
    throw new Error(`${label}.id is not calibrated for DPR ${devicePixelRatio}.`);
  }
  validateSceneMetadata(
    value.metadata,
    scenarioId,
    devicePixelRatio,
    calibration,
    `${label}.metadata`,
  );
  if (!isDeepStrictEqual(value.scenarioState, calibration.scenarioState)) {
    throw new Error(`${label}.scenarioState does not match the visual gate.`);
  }
  expectRecord(value.publicUniformCanvas, `${label}.publicUniformCanvas`);
  const publicCanvas = value.publicUniformCanvas;
  const classNames = readArray(
    publicCanvas.classNames,
    `${label}.publicUniformCanvas.classNames`,
  ).map((entry, index) => readString(
    entry,
    `${label}.publicUniformCanvas.classNames[${index}]`,
  ));
  if (!haveSameValues(
    classNames,
    calibration.publicUniformCanvas.classNames,
  )) {
    throw new Error(
      `${label}.publicUniformCanvas.classNames do not match the visual gate.`,
    );
  }
  expectMatchingNumber(
    publicCanvas.width,
    calibration.publicUniformCanvas.width,
    `${label}.publicUniformCanvas.width`,
  );
  expectMatchingNumber(
    publicCanvas.height,
    calibration.publicUniformCanvas.height,
    `${label}.publicUniformCanvas.height`,
  );
  expectMatchingNumber(
    publicCanvas.nonTransparentPixels,
    calibration.publicUniformCanvas.nonTransparentPixels,
    `${label}.publicUniformCanvas.nonTransparentPixels`,
  );

  expectRecord(value.rawPublicCanvas, `${label}.rawPublicCanvas`);
  const raw = value.rawPublicCanvas;
  const expectedRawPath =
    `dpr-${devicePixelRatio}/${scenarioId}-canvas.png`;
  if (raw.artifactPath !== expectedRawPath) {
    throw new Error(
      `${label}.rawPublicCanvas.artifactPath must be ${expectedRawPath}.`,
    );
  }
  expectMatchingNumber(
    raw.width,
    calibration.rawPublicCanvas.width,
    `${label}.rawPublicCanvas.width`,
  );
  expectMatchingNumber(
    raw.height,
    calibration.rawPublicCanvas.height,
    `${label}.rawPublicCanvas.height`,
  );
  expectMatchingNumber(
    raw.nonTransparentPixels,
    calibration.rawPublicCanvas.nonTransparentPixels,
    `${label}.rawPublicCanvas.nonTransparentPixels`,
  );
  if (
    raw.captureRun !== 1
    || raw.selector !== RAW_SELECTOR
    || raw.serialization !== RAW_SERIALIZATION
    || raw.transfer !== RAW_TRANSFER
  ) {
    throw new Error(`${label}.rawPublicCanvas provenance is unsupported.`);
  }
  validateRuntimeErrors(value.consoleErrors, `${label}.consoleErrors`);
  return scenarioId;
}

/**
 * Parse one committed raw-browser capture against the joined visual gate.
 */
export function parseLegacyVisualBrowserCapture(
  value: unknown,
  declaredDpr: number,
  gate: LegacyVisualBrowserCaptureGate,
  label: string,
): LegacyVisualBrowserCaptureMetadata {
  expectRecord(value, label);
  if (value.schemaVersion !== 3) {
    throw new Error(`${label}.schemaVersion must be 3.`);
  }
  const browserIdentity = parseLegacyVisualBrowserIdentity(value, label);
  const devicePixelRatio = readPositiveInteger(
    value.devicePixelRatio,
    `${label}.devicePixelRatio`,
  );
  if (devicePixelRatio !== declaredDpr) {
    throw new Error(
      `${label} declares DPR ${declaredDpr} but contains DPR `
      + `${devicePixelRatio}.`,
    );
  }
  for (const identityField of [
    'browserName',
    'browserVersion',
    'userAgent',
  ] as const) {
    if (browserIdentity[identityField] !== gate[identityField]) {
      throw new Error(
        `Browser capture DPR ${devicePixelRatio} ${identityField} `
        + 'does not match the visual gate.',
      );
    }
  }
  const webGlFingerprint = parseLegacyVisualWebGlFingerprint(
    value.webGlFingerprint,
    `${label}.webGlFingerprint`,
  );
  if (!haveSameLegacyVisualWebGlFingerprint(
    webGlFingerprint,
    gate.webGlFingerprint,
  )) {
    throw new Error(
      `Browser capture DPR ${devicePixelRatio} WebGL fingerprint `
      + 'does not match the visual gate.',
    );
  }
  const sessionEnvironment = parseLegacyVisualCaptureSessionEnvironment(
    value,
    gate.captureEvidence.contract,
    label,
  );

  const captureId = readString(value.captureId, `${label}.captureId`);
  if (!CAPTURE_ID_PATTERN.test(captureId)) {
    throw new Error(`${label}.captureId has an invalid format.`);
  }
  if (captureId !== gate.captureEvidence.captureId) {
    throw new Error(
      `${label}.captureId does not match calibration capture evidence.`,
    );
  }
  const captureContractSha256 = readString(
    value.captureContractSha256,
    `${label}.captureContractSha256`,
  );
  if (captureContractSha256 !== gate.captureEvidence.contractSha256) {
    throw new Error(
      `${label}.captureContractSha256 does not match calibration evidence.`,
    );
  }
  const captureMode = readString(value.captureMode, `${label}.captureMode`);
  if (captureMode !== 'full') {
    throw new Error(`${label}.captureMode must be full.`);
  }
  const sourceCommit = readString(value.sourceCommit, `${label}.sourceCommit`);
  if (sourceCommit !== gate.oracleCommit) {
    throw new Error(`${label}.sourceCommit does not match the visual gate.`);
  }
  const runCount = readPositiveInteger(value.runCount, `${label}.runCount`);
  if (runCount !== gate.runCount) {
    throw new Error(`${label}.runCount does not match the visual gate.`);
  }
  const capturedAt = readString(value.capturedAt, `${label}.capturedAt`);
  if (Number.isNaN(Date.parse(capturedAt))) {
    throw new Error(`${label}.capturedAt must be an ISO timestamp.`);
  }
  const captureSummary = gate.captureEvidence.browsers.find(
    (browser) => browser.devicePixelRatio === devicePixelRatio,
  );
  if (!captureSummary || capturedAt !== captureSummary.capturedAt) {
    throw new Error(
      `${label}.capturedAt does not match calibration capture evidence.`,
    );
  }

  expectRecord(value.viewport, `${label}.viewport`);
  const viewport = {
    height: readPositiveInteger(value.viewport.height, `${label}.viewport.height`),
    width: readPositiveInteger(value.viewport.width, `${label}.viewport.width`),
  };
  if (
    viewport.width !== gate.viewport.width
    || viewport.height !== gate.viewport.height
  ) {
    throw new Error(`${label}.viewport does not match the visual gate.`);
  }
  expectRecord(
    value.publicUniformCanvasReadiness,
    `${label}.publicUniformCanvasReadiness`,
  );
  const readiness = value.publicUniformCanvasReadiness;
  const stability = parseLegacyPublicCanvasStability(
    readiness.stability,
    `${label}.publicUniformCanvasReadiness.stability`,
  );
  if (
    readiness.trigger !== gate.publicUniformCanvasReadiness.trigger
    || readiness.minimumNonTransparentPixels
      !== gate.publicUniformCanvasReadiness.minimumNonTransparentPixels
    || !isDeepStrictEqual(
      stability,
      gate.publicUniformCanvasReadiness.stability,
    )
  ) {
    throw new Error(
      `${label}.publicUniformCanvasReadiness does not match the visual gate.`,
    );
  }
  const scenarioIds = readArray(value.scenarios, `${label}.scenarios`).map(
    (scene, index) => validateScene(
      scene,
      devicePixelRatio,
      gate,
      `${label}.scenarios[${index}]`,
    ),
  );
  if (!haveSameValues(scenarioIds, gate.scenarioIds)) {
    throw new Error(`${label}.scenarios do not match the visual gate.`);
  }
  return {
    ...browserIdentity,
    ...sessionEnvironment,
    captureContractSha256,
    captureId,
    captureMode: 'full',
    capturedAt,
    devicePixelRatio,
    runCount,
    sourceCommit,
    viewport,
    webGlFingerprint,
  };
}
