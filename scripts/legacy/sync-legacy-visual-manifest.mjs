import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Synchronize manifest summaries from one fully validated calibration report.
 */
export function syncLegacyVisualManifest(baselineRoot, report) {
  if (!report.passed) {
    throw new Error('Refusing to synchronize a failed visual calibration.');
  }
  const manifestPath = resolve(baselineRoot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    ![2, 3].includes(manifest.schemaVersion)
    || report.schemaVersion !== 3
    || manifest.oracle?.commit !== report.sourceCommit
  ) {
    throw new Error('Legacy manifest identity does not match the calibration.');
  }
  const firstBrowser = report.browsers[0];
  const scenes = report.browsers.flatMap((browser) => browser.scenarios);
  if (!firstBrowser || scenes.length === 0) {
    throw new Error('Visual calibration lacks browser scene evidence.');
  }
  const browserIdentityMatches = report.browsers.every((browser) => (
    browser.browserName === firstBrowser.browserName
    && browser.browserVersion === firstBrowser.browserVersion
    && browser.userAgent === firstBrowser.userAgent
    && JSON.stringify(browser.webGlFingerprint)
      === JSON.stringify(firstBrowser.webGlFingerprint)
  ));
  if (!browserIdentityMatches) {
    throw new Error('Visual calibration browser identities do not match.');
  }

  const evidence = manifest.browserEvidence;
  manifest.schemaVersion = 3;
  evidence.browser = firstBrowser.browserName;
  evidence.browserVersion = firstBrowser.browserVersion;
  evidence.captureContractSha256 = report.captureEvidence.contractSha256;
  evidence.userAgent = firstBrowser.userAgent;
  evidence.webGlFingerprint = firstBrowser.webGlFingerprint;
  evidence.selfDiffMaximum = Math.max(
    ...scenes.map((scene) => scene.selfDiff.maxRatio),
  );
  evidence.threshold = Math.max(
    ...scenes.map((scene) => scene.selfDiff.threshold),
  );
  evidence.publicUniformCanvasReadiness = {
    ...report.comparison.publicUniformCanvasReadiness,
    minimumObservedNonTransparentPixels: Math.min(
      ...scenes.map(
        (scene) => scene.publicUniformCanvas.nonTransparentPixels,
      ),
    ),
  };
  evidence.glassOnOffDiffRatioRange = {
    maximum: Math.max(
      ...scenes.map((scene) => scene.glassOnVersusOff.diffRatio),
    ),
    minimum: Math.min(
      ...scenes.map((scene) => scene.glassOnVersusOff.diffRatio),
    ),
  };
  evidence.consoleErrorCount = 0;
  evidence.pageErrorCount = 0;
  evidence.result = 'pass';
  manifest.capturedOn = report.generatedAt.slice(0, 10);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
