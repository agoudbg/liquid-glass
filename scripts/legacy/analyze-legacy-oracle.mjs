import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNEL_DELTA_THRESHOLD = 3;
const SCENARIOS = ['S001', 'S002', 'S003', 'S004', 'S005', 'S006'];
const RUN_COUNT = 20;

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(filePath) {
  const input = readFileSync(filePath);
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a PNG file.`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressedChunks = [];
  for (let offset = 8; offset < input.length;) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('ascii', offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      compressedChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`${filePath} uses unsupported PNG encoding: depth=${bitDepth}, type=${colorType}, interlace=${interlace}.`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(compressedChunks));
  const decoded = Buffer.alloc(height * stride);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset];
      inputOffset += 1;
      const left = x >= channels ? decoded[rowOffset + x - channels] : 0;
      const above = y > 0 ? decoded[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? decoded[rowOffset - stride + x - channels] : 0;
      let reconstructed;
      if (filter === 0) reconstructed = raw;
      else if (filter === 1) reconstructed = raw + left;
      else if (filter === 2) reconstructed = raw + above;
      else if (filter === 3) reconstructed = raw + Math.floor((left + above) / 2);
      else if (filter === 4) reconstructed = raw + paethPredictor(left, above, upperLeft);
      else throw new Error(`${filePath} contains unknown PNG filter ${filter}.`);
      decoded[rowOffset + x] = reconstructed & 0xff;
    }
  }

  const pixels = Buffer.alloc(width * height * 4);
  for (let source = 0, target = 0; source < decoded.length; source += channels, target += 4) {
    pixels[target] = decoded[source];
    pixels[target + 1] = decoded[source + 1];
    pixels[target + 2] = decoded[source + 2];
    pixels[target + 3] = channels === 4 ? decoded[source + 3] : 255;
  }
  return { width, height, pixels };
}

function assertSameDimensions(reference, candidate, label) {
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error(`${label} dimensions differ: ${reference.width}x${reference.height} versus ${candidate.width}x${candidate.height}.`);
  }
}

function compareImages(reference, candidate, includedPixels) {
  assertSameDimensions(reference, candidate, 'Compared images');
  let changedPixels = 0;
  let comparedPixels = 0;
  let channelDeltaSum = 0;
  let maxChannelDelta = 0;
  const pixelCount = reference.width * reference.height;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (includedPixels && includedPixels[pixel] === 0) continue;
    comparedPixels += 1;
    const offset = pixel * 4;
    let pixelMaxDelta = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(reference.pixels[offset + channel] - candidate.pixels[offset + channel]);
      channelDeltaSum += delta;
      pixelMaxDelta = Math.max(pixelMaxDelta, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    if (pixelMaxDelta > CHANNEL_DELTA_THRESHOLD) changedPixels += 1;
  }
  return {
    changedPixels,
    comparedPixels,
    diffRatio: comparedPixels === 0 ? 0 : changedPixels / comparedPixels,
    meanAbsoluteChannelDelta: comparedPixels === 0 ? 0 : channelDeltaSum / (comparedPixels * 3),
    maxChannelDelta,
  };
}

function createMaterialMask(image, materialRectangles, devicePixelRatio) {
  const mask = new Uint8Array(image.width * image.height);
  for (const material of materialRectangles) {
    const rect = material.rect;
    const left = Math.max(0, Math.floor(rect.left * devicePixelRatio));
    const top = Math.max(0, Math.floor(rect.top * devicePixelRatio));
    const right = Math.min(image.width, Math.ceil(rect.right * devicePixelRatio));
    const bottom = Math.min(image.height, Math.ceil(rect.bottom * devicePixelRatio));
    for (let y = top; y < bottom; y += 1) {
      mask.fill(1, y * image.width + left, y * image.width + right);
    }
  }
  return mask;
}

function readPixel(image, x, y) {
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const offset = (clampedY * image.width + clampedX) * 4;
  return Array.from(image.pixels.subarray(offset, offset + 4));
}

function collectKeyPixels(glassOn, glassOff, materials, devicePixelRatio) {
  const probes = [
    { name: 'center', xRatio: 0.5, yRatio: 0.5 },
    { name: 'upperLeftQuarter', xRatio: 0.25, yRatio: 0.25 },
    { name: 'lowerRightQuarter', xRatio: 0.75, yRatio: 0.75 },
  ];
  return materials.flatMap((material) => probes.map((probe) => {
    const xCss = material.rect.left + material.rect.width * probe.xRatio;
    const yCss = material.rect.top + material.rect.height * probe.yRatio;
    const x = Math.floor(xCss * devicePixelRatio);
    const y = Math.floor(yCss * devicePixelRatio);
    const on = readPixel(glassOn, x, y);
    const off = readPixel(glassOff, x, y);
    return {
      materialId: material.id,
      probe: probe.name,
      cssPosition: { x: xCss, y: yCss },
      physicalPosition: { x, y },
      glassOn: on,
      glassOff: off,
      absoluteRgbDelta: on.slice(0, 3).map((value, index) => Math.abs(value - off[index])),
    };
  }));
}

function roundMetrics(metrics) {
  return {
    ...metrics,
    diffRatio: Number(metrics.diffRatio.toFixed(12)),
    meanAbsoluteChannelDelta: Number(metrics.meanAbsoluteChannelDelta.toFixed(6)),
  };
}

const repositoryRoot = resolve(process.argv[2] ?? '.');
const calibrationRoot = resolve(process.argv[3] ?? '');
if (!process.argv[3]) throw new Error('Calibration root argument is required.');

const visualRoot = resolve(repositoryRoot, 'tests/baselines/legacy/visual');
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceCommit: '345a9be6906bcc8a801208054e7fe134c6bfe641',
  comparison: {
    runCount: RUN_COUNT,
    ignoredChannelDeltaAtOrBelow: CHANNEL_DELTA_THRESHOLD,
    thresholdFormula: 'min(0.005, max(0.001, 3 * maxSelfDiffRatio))',
    thresholdCap: 0.005,
  },
  browsers: [],
  passed: true,
};

for (const devicePixelRatio of [1, 2]) {
  const browserMetadata = JSON.parse(readFileSync(resolve(visualRoot, `browser-dpr-${devicePixelRatio}.json`), 'utf8'));
  if (browserMetadata.devicePixelRatio !== devicePixelRatio || browserMetadata.runCount !== RUN_COUNT) {
    throw new Error(`DPR ${devicePixelRatio} browser metadata does not match the requested calibration.`);
  }

  const browserResult = {
    browserName: browserMetadata.browserName,
    browserVersion: browserMetadata.browserVersion,
    userAgent: browserMetadata.userAgent,
    viewport: browserMetadata.viewport,
    devicePixelRatio,
    scenarios: [],
  };

  for (const scenario of SCENARIOS) {
    const sceneMetadata = browserMetadata.scenarios.find((entry) => entry.id === scenario);
    if (!sceneMetadata) throw new Error(`Missing metadata for DPR ${devicePixelRatio} ${scenario}.`);

    const firstRun = decodePng(resolve(calibrationRoot, `dpr-${devicePixelRatio}`, `${scenario}-run-01.png`));
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
    const glassOn = decodePng(resolve(visualRoot, `dpr-${devicePixelRatio}`, `${scenario}-glass-on.png`));
    const glassOff = decodePng(resolve(visualRoot, `dpr-${devicePixelRatio}`, `${scenario}-glass-off.png`));
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
      materialRectangles: sceneMetadata.metadata.materials,
      scrollPosition: {
        x: sceneMetadata.metadata.scrollX,
        y: sceneMetadata.metadata.scrollY,
      },
      selfDiff: {
        maxRatio: Number(maxSelfDiffRatio.toFixed(12)),
        maxRun: maxSelfDiffRun,
        threshold: Number(threshold.toFixed(12)),
        runs: selfDiffs,
      },
      glassOnVersusOff: {
        ...roundMetrics(glassDifference),
        exceedsThreshold: meaningfulDifference,
      },
      keyPixels: collectKeyPixels(glassOn, glassOff, sceneMetadata.metadata.materials, devicePixelRatio),
      consoleErrorCount,
      consoleErrors: sceneMetadata.consoleErrors,
      passed: scenePassed,
    });
  }

  report.browsers.push(browserResult);
}

writeFileSync(
  resolve(repositoryRoot, 'tests/baselines/legacy/visual-calibration.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

if (!report.passed) {
  throw new Error('Legacy visual oracle failed: inspect visual-calibration.json for scene-level evidence.');
}
