import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type TestInfo } from '@playwright/test';

import {
  compareLegacyCompositeInteriorPngPixels,
  compareLegacyRawCanvasPngPixels,
} from './support/legacy-visual-canvas-comparator';
import {
  compareLegacyGlassEffectPngPixels,
  compareLegacyMaskedPngPixels,
  LEGACY_STABLE_UNDERLAY_RATIO_FLOOR,
  LEGACY_UNDERLAY_DRIFT_RATIO_CAP,
} from './support/legacy-visual-comparator';
import {
  readLegacyVisualPlaywrightRuntimeEvidence,
  validateLegacyVisualPlaywrightRuntime,
} from './support/legacy-visual-environment';
import {
  parseLegacyVisualGateMetadata,
  validateLegacyVisualBrowserCaptures,
} from './support/legacy-visual-metadata';
import {
  collectVisualRuntimeErrors,
  expectLegacyBrowserEnvironment,
  expectLegacyMaterialPresentation,
  expectLegacyMaterialRectangles,
  expectLegacyRectangle,
  findLegacyCalibration,
  prepareLegacyScene,
  readVisualProjectDpr,
  setCandidateGlassEnabled,
  waitForLegacyCanvasReadiness,
} from './support/legacy-visual-parity-helpers';
import {
  validateLegacyVisualLocalHostProvenance,
  validateLegacyVisualRepositoryProvenance,
} from './support/legacy-visual-provenance';
import {
  captureCanvasBackingStore,
  readElementRect,
} from './support/renderer';

const FRAMEWORKS = ['vue', 'react', 'solid'] as const;
const EXACT_ORACLE_SCENES = [
  'S001',
  'S002',
  'S003',
  'S004',
  'S005',
  'S006',
] as const;
const GPU_TEST_TIMEOUT = 180_000;
const COMPOSITE_BOUNDARY_RATIO_CAP = 0.1;
const MATERIAL_COMPOSITE_DRIFT_RATIO_CAP = 0.005;
const MATERIAL_COMPOSITE_MAX_CHANNEL_DELTA = 16;
const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const metadata = parseLegacyVisualGateMetadata(
  readJson('tests/baselines/legacy/visual-calibration.json'),
  readJson('tests/baselines/legacy/manifest.json'),
);

async function attachVisualArtifact(
  testInfo: TestInfo,
  name: string,
  content: string | Uint8Array,
  contentType: string,
): Promise<void> {
  const path = testInfo.outputPath(name);
  writeFileSync(path, content);
  await testInfo.attach(name, { contentType, path });
}
validateLegacyVisualBrowserCaptures(
  metadata,
  metadata.artifacts.browserMetadata.map(({ devicePixelRatio, path }) => ({
    devicePixelRatio,
    value: readJson(path),
  })),
);

test.beforeAll(async ({ browser }) => {
  validateLegacyVisualRepositoryProvenance(
    metadata.captureEvidence.contract,
    REPOSITORY_ROOT,
  );
  validateLegacyVisualLocalHostProvenance(
    metadata.captureEvidence.contract,
  );
  expect(
    process.platform,
    'Legacy exact-pixel baselines were calibrated on Windows.',
  ).toBe('win32');
  expect(
    browser.version(),
    `Legacy exact-pixel baselines require ${metadata.browserName}.`,
  ).toBe(metadata.browserVersion);
  validateLegacyVisualPlaywrightRuntime(
    metadata.captureEvidence.contract.runtime,
    readLegacyVisualPlaywrightRuntimeEvidence(REPOSITORY_ROOT),
  );
});

for (const framework of FRAMEWORKS) {
  for (const scenario of EXACT_ORACLE_SCENES) {
    test(`${framework} ${scenario} stays within the calibrated legacy threshold`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(GPU_TEST_TIMEOUT);
      const devicePixelRatio = readVisualProjectDpr(testInfo.project.name);
      const calibration = findLegacyCalibration(
        metadata,
        scenario,
        devicePixelRatio,
      );
      const runtimeErrors = collectVisualRuntimeErrors(page);

      await page.emulateMedia({
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      await page.goto(
        `/?test=1&oracle=1&glass=on&framework=${framework}&scene=${scenario}`,
        { waitUntil: 'domcontentloaded' },
      );
      const shell = page.locator('#app');
      await expect(shell).toHaveAttribute('data-ready', 'true', {
        timeout: 15_000,
      });
      await expect(shell).toHaveAttribute('data-framework', framework);
      await expect(shell).toHaveAttribute('data-scene', scenario);
      await expect(shell).toHaveAttribute('data-oracle-mode', 'true');
      await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
      await expectLegacyBrowserEnvironment(page, devicePixelRatio, metadata);
      await page.evaluate(() => document.fonts.ready);

      const canvas = page.locator('.liquid-glass-canvas');
      let pointerHeld = false;
      try {
        await waitForLegacyCanvasReadiness(
          canvas,
          calibration,
          metadata.publicUniformCanvasReadiness.minimumNonTransparentPixels,
        );
        pointerHeld = await prepareLegacyScene(page, calibration);
        await expectLegacyMaterialRectangles(
          page,
          calibration.materialRectangles,
        );
        await expectLegacyMaterialPresentation(
          page,
          calibration.materialRectangles,
        );
        await waitForLegacyCanvasReadiness(
          canvas,
          calibration,
          metadata.publicUniformCanvasReadiness.minimumNonTransparentPixels,
        );
        await page.waitForTimeout(350);

        const canvasElementRect = await readElementRect(canvas);
        expectLegacyRectangle(
          'public canvas',
          canvasElementRect,
          calibration.publicUniformCanvasRect,
        );
        const candidateCanvas = await captureCanvasBackingStore(canvas);
        const referenceCanvas = readFileSync(resolve(
          REPOSITORY_ROOT,
          calibration.rawPublicCanvas.artifactPath,
        ));
        const stabilityReference = await page.screenshot({
          animations: 'disabled',
          fullPage: false,
        });
        await page.waitForTimeout(150);
        const candidateOn = await page.screenshot({
          animations: 'disabled',
          fullPage: false,
        });
        const referenceOn = readFileSync(resolve(
          REPOSITORY_ROOT,
          calibration.screenshotArtifacts.glassOn.artifactPath,
        ));
        await setCandidateGlassEnabled(page, false);
        await expectLegacyMaterialRectangles(
          page,
          calibration.materialRectangles,
        );
        const offStabilityReference = await page.screenshot({
          animations: 'disabled',
          fullPage: false,
        });
        await page.waitForTimeout(150);
        const candidateOff = await page.screenshot({
          animations: 'disabled',
          fullPage: false,
        });
        const referenceOff = readFileSync(resolve(
          REPOSITORY_ROOT,
          calibration.screenshotArtifacts.glassOff.artifactPath,
        ));
        const stability = compareLegacyMaskedPngPixels(
          stabilityReference,
          candidateOn,
          calibration.materialRectangles,
          devicePixelRatio,
        );
        const materialCompositeOn = compareLegacyMaskedPngPixels(
          referenceOn,
          candidateOn,
          calibration.materialRectangles,
          devicePixelRatio,
        );
        const materialCompositeOff = compareLegacyMaskedPngPixels(
          referenceOff,
          candidateOff,
          calibration.materialRectangles,
          devicePixelRatio,
        );
        const offStability = compareLegacyMaskedPngPixels(
          offStabilityReference,
          candidateOff,
          calibration.materialRectangles,
          devicePixelRatio,
        );
        const rawCanvas = compareLegacyRawCanvasPngPixels(
          referenceCanvas,
          candidateCanvas,
        );
        const differential = compareLegacyGlassEffectPngPixels({
          candidate: {
            glassOff: candidateOff,
            glassOn: candidateOn,
          },
          devicePixelRatio,
          materialRectangles: calibration.materialRectangles,
          reference: {
            glassOff: referenceOff,
            glassOn: referenceOn,
          },
        });
        const compositeInterior = compareLegacyCompositeInteriorPngPixels({
          candidate: {
            glassOff: candidateOff,
            glassOn: candidateOn,
          },
          candidateCanvas,
          devicePixelRatio,
          materialRectangles: calibration.materialRectangles,
          reference: {
            glassOff: referenceOff,
            glassOn: referenceOn,
          },
          referenceCanvas,
          referenceCanvasRect: calibration.publicUniformCanvasRect,
        });
        await attachVisualArtifact(
          testInfo,
          'candidate-glass-on.png',
          candidateOn,
          'image/png',
        );
        await attachVisualArtifact(
          testInfo,
          'candidate-glass-off.png',
          candidateOff,
          'image/png',
        );
        await attachVisualArtifact(
          testInfo,
          'legacy-reference-glass-on.png',
          referenceOn,
          'image/png',
        );
        await attachVisualArtifact(
          testInfo,
          'legacy-reference-glass-off.png',
          referenceOff,
          'image/png',
        );
        await attachVisualArtifact(
          testInfo,
          'candidate-raw-canvas.png',
          candidateCanvas,
          'image/png',
        );
        await attachVisualArtifact(
          testInfo,
          'legacy-reference-raw-canvas.png',
          referenceCanvas,
          'image/png',
        );
        await attachVisualArtifact(
          testInfo,
          'legacy-difference.json',
          JSON.stringify({
            calibration: calibration.threshold,
            compositeInterior,
            differential,
            framework,
            materialCompositeOff,
            materialCompositeOn,
            rawCanvas,
            scenario,
            offStability,
            stability,
          }, null, 2),
          'application/json',
        );

        expect(
          stability.diffRatio,
          `${framework} ${scenario} changed between settled candidate frames`,
        ).toBeLessThanOrEqual(calibration.threshold);
        expect(
          offStability.diffRatio,
          `${framework} ${scenario} changed between settled glass-off frames`,
        ).toBeLessThanOrEqual(calibration.threshold);
        for (const [state, composite] of [
          ['glass-on', materialCompositeOn],
          ['glass-off', materialCompositeOff],
        ] as const) {
          expect(
            composite.diffRatio,
            `${framework} ${scenario} ${state} DOM composite drifted`,
          ).toBeLessThanOrEqual(MATERIAL_COMPOSITE_DRIFT_RATIO_CAP);
          expect(
            composite.maxChannelDelta,
            `${framework} ${scenario} ${state} contains a large DOM color drift`,
          ).toBeLessThanOrEqual(MATERIAL_COMPOSITE_MAX_CHANNEL_DELTA);
        }
        expect(
          rawCanvas.difference.diffRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: `
          + `${rawCanvas.difference.changedPixels}/`
          + `${rawCanvas.difference.comparedPixels} raw RGBA pixels differ `
          + '(raw presentation parity is exact)',
        ).toBe(0);
        expect(
          rawCanvas.alphaMismatchPixels,
          `${framework} ${scenario} DPR ${devicePixelRatio}: `
          + `${rawCanvas.alphaMismatchPixels} raw alpha pixels differ`,
        ).toBe(0);
        expect(
          rawCanvas.candidateVisiblePixels,
          `${framework} ${scenario} candidate raw canvas alpha count drifted`,
        ).toBe(calibration.rawPublicCanvas.nonTransparentPixels);
        expect(
          rawCanvas.referenceVisiblePixels,
          `${framework} ${scenario} raw baseline alpha count drifted`,
        ).toBe(calibration.rawPublicCanvas.nonTransparentPixels);
        expect(
          differential.underlay.diffRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: glass-off underlay `
          + `${differential.underlay.changedPixels}/`
          + `${differential.underlay.comparedPixels} pixels differ`,
        ).toBeLessThanOrEqual(LEGACY_UNDERLAY_DRIFT_RATIO_CAP);
        expect(
          differential.stableUnderlayRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: only `
          + `${String((differential.stableUnderlayRatio * 100).toFixed(3))}% `
          + 'of material pixels have an exact glass-off underlay',
        ).toBeGreaterThanOrEqual(LEGACY_STABLE_UNDERLAY_RATIO_FLOOR);
        expect(
          differential.glassEffect.diffRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: `
          + `${differential.glassEffect.changedPixels}/`
          + `${differential.glassEffect.comparedPixels} full-material `
          + 'glass-contribution pixels differ',
        ).toBeLessThanOrEqual(calibration.threshold);
        expect(
          differential.stableGlassOn.diffRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: `
          + `${differential.stableGlassOn.changedPixels}/`
          + `${differential.stableGlassOn.comparedPixels} stable-underlay `
          + 'glass-on pixels differ',
        ).toBeLessThanOrEqual(calibration.threshold);
        for (const material of differential.materialStability) {
          expect(
            material.stableRatio,
            `${framework} ${scenario} ${material.id}: only `
            + `${String((material.stableRatio * 100).toFixed(3))}% of `
            + 'material pixels have an exact glass-off underlay',
          ).toBeGreaterThanOrEqual(LEGACY_STABLE_UNDERLAY_RATIO_FLOOR);
        }
        expect(
          compositeInterior.excludedBoundaryRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: `
          + `${compositeInterior.excludedBoundaryPixels} material pixels `
          + 'fall inside the raw-canvas boundary band',
        ).toBeLessThanOrEqual(COMPOSITE_BOUNDARY_RATIO_CAP);
        expect(
          compositeInterior.glassEffect.diffRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: `
          + `${compositeInterior.glassEffect.changedPixels}/`
          + `${compositeInterior.glassEffect.comparedPixels} non-boundary `
          + 'glass-contribution pixels differ',
        ).toBeLessThanOrEqual(calibration.threshold);
        expect(
          compositeInterior.stableInteriorRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: only `
          + `${String((compositeInterior.stableInteriorRatio * 100).toFixed(3))}% `
          + 'of non-boundary material pixels have an exact glass-off underlay',
        ).toBeGreaterThanOrEqual(LEGACY_STABLE_UNDERLAY_RATIO_FLOOR);
        expect(
          compositeInterior.stableGlassOn.diffRatio,
          `${framework} ${scenario} DPR ${devicePixelRatio}: `
          + `${compositeInterior.stableGlassOn.changedPixels}/`
          + `${compositeInterior.stableGlassOn.comparedPixels} stable `
          + 'composite-interior pixels differ',
        ).toBeLessThanOrEqual(calibration.threshold);
        for (const material of compositeInterior.materials) {
          expect(
            material.excludedBoundaryRatio,
            `${framework} ${scenario} ${material.id}: `
            + `${material.excludedBoundaryPixels}/${material.materialPixels} `
            + 'pixels fall inside the raw-canvas boundary band',
          ).toBeLessThanOrEqual(COMPOSITE_BOUNDARY_RATIO_CAP);
          expect(
            material.glassEffect.diffRatio,
            `${framework} ${scenario} ${material.id}: `
            + `${material.glassEffect.changedPixels}/`
            + `${material.glassEffect.comparedPixels} non-boundary `
            + 'glass-contribution pixels differ',
          ).toBeLessThanOrEqual(calibration.threshold);
          expect(
            material.stableInteriorRatio,
            `${framework} ${scenario} ${material.id}: only `
            + `${String((material.stableInteriorRatio * 100).toFixed(3))}% `
            + 'of non-boundary pixels have an exact glass-off underlay',
          ).toBeGreaterThanOrEqual(LEGACY_STABLE_UNDERLAY_RATIO_FLOOR);
          expect(
            material.stableGlassOn.diffRatio,
            `${framework} ${scenario} ${material.id}: `
            + `${material.stableGlassOn.changedPixels}/`
            + `${material.stableGlassOn.comparedPixels} stable composite `
            + 'pixels differ',
          ).toBeLessThanOrEqual(calibration.threshold);
        }
      } finally {
        if (pointerHeld) await page.mouse.up();
      }

      expect(runtimeErrors).toEqual([]);
    });
  }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(REPOSITORY_ROOT, path), 'utf8')) as unknown;
}
