import assert from 'node:assert/strict';
import { platform, release } from 'node:os';

import {
  buildCandidate,
  createAcceptanceTempRoot,
  launchAcceptanceBrowser,
  prepareLegacyPerformanceSource,
  readPositiveInteger,
  removeAcceptanceTempRoot,
  startCandidatePreview,
  startLegacyPreview,
  writeAcceptanceReport,
} from './runtime-acceptance/environment.mjs';
import {
  runRelativePerformanceAcceptance,
} from './runtime-acceptance/performance.mjs';
import {
  runFiveMinuteStabilityAcceptance,
} from './runtime-acceptance/stability.mjs';

const argumentsSet = new Set(process.argv.slice(2));
const supportedArguments = new Set([
  '--performance',
  '--skip-candidate-build',
  '--stability',
]);
for (const argument of argumentsSet) {
  assert(supportedArguments.has(argument), `Unsupported argument: ${argument}`);
}
assert(
  !(argumentsSet.has('--performance') && argumentsSet.has('--stability')),
  'Choose either --performance or --stability, or omit both to run all acceptance.',
);

const runPerformance = !argumentsSet.has('--stability');
const runStability = !argumentsSet.has('--performance');
const performanceConfig = {
  runs: readPositiveInteger('LIQUID_GLASS_PERF_RUNS', 3),
  sampleMs: readPositiveInteger('LIQUID_GLASS_PERF_SAMPLE_MS', 15_000, 500),
  warmupMs: readPositiveInteger('LIQUID_GLASS_PERF_WARMUP_MS', 5_000, 100),
};
const stabilityConfig = {
  actionPauseMs: readPositiveInteger(
    'LIQUID_GLASS_STABILITY_ACTION_PAUSE_MS',
    750,
    50,
  ),
  durationMs: readPositiveInteger(
    'LIQUID_GLASS_STABILITY_DURATION_MS',
    300_000,
    5_000,
  ),
};

let browser;
let candidatePreview;
let legacyPreview;
let temporaryRoot;

try {
  if (!argumentsSet.has('--skip-candidate-build')) {
    console.log('Building candidate packages and playground...');
    await buildCandidate();
  }
  if (runPerformance) {
    temporaryRoot = await createAcceptanceTempRoot();
    console.log(`Preparing isolated legacy source at ${temporaryRoot}...`);
    const legacySource = await prepareLegacyPerformanceSource(temporaryRoot);
    legacyPreview = await startLegacyPreview(legacySource);
  }
  candidatePreview = await startCandidatePreview();
  browser = await launchAcceptanceBrowser();
  const environment = {
    browserVersion: browser.version(),
    devicePixelRatio: 1,
    nodeVersion: process.version,
    operatingSystem: `${platform()} ${release()}`,
    viewport: { height: 900, width: 1440 },
  };

  if (runPerformance) {
    const performance = await runRelativePerformanceAcceptance({
      browser,
      candidateUrl: candidatePreview.url,
      config: performanceConfig,
      legacyUrl: legacyPreview.url,
    });
    const outputPath = await writeAcceptanceReport('performance', {
      environment,
      ...performance,
    });
    console.log(`Relative performance report written: ${outputPath}`);
    console.log(JSON.stringify(performance.summary, null, 2));
    assert(performance.passed, performance.failures.join('\n'));
    console.log('Relative performance acceptance passed.');
  }

  if (runStability) {
    const stability = await runFiveMinuteStabilityAcceptance({
      browser,
      candidateUrl: candidatePreview.url,
      config: stabilityConfig,
    });
    const outputPath = await writeAcceptanceReport('stability', {
      environment,
      ...stability,
    });
    console.log(`Stability acceptance passed: ${outputPath}`);
    console.log(JSON.stringify({
      actionCount: stability.actionCount,
      elapsedMs: stability.elapsedMs,
      finalResources: stability.finalResources,
      heap: stability.heap,
    }, null, 2));
  }
} finally {
  await Promise.allSettled([
    browser?.close(),
    candidatePreview?.close(),
    legacyPreview?.close(),
  ]);
  if (
    temporaryRoot
    && process.env.LIQUID_GLASS_KEEP_RUNTIME_TEMP !== '1'
  ) {
    await removeAcceptanceTempRoot(temporaryRoot);
  }
}
