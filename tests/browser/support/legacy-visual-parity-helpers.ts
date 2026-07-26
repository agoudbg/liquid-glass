import {
  expect,
  type Locator,
  type Page,
} from '@playwright/test';

import {
  type LegacyMaterialRectangle,
} from './legacy-visual-comparator';
import {
  type LegacyVisualGateMetadata,
  type LegacyVisualSceneCalibration,
} from './legacy-visual-metadata';
import {
  readCanvasMetrics,
  readCanvasPixelFingerprint,
  readCanvasRegionCoverage,
  readElementRect,
  readNumericAttribute,
} from './renderer';

const CANVAS_READINESS_TIMEOUT = 30_000;
const CANVAS_STABLE_FRAME_COUNT = 3;
const GEOMETRY_EPSILON = 0.05;
const LEGACY_INTERNAL_SCROLL_SELECTOR = '.liquid-glass-content.scrollable';
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

/** Map one visual Playwright project name to its configured DPR. */
export function readVisualProjectDpr(projectName: string): 1 | 2 {
  if (projectName === 'visual-dpr-1') return 1;
  if (projectName === 'visual-dpr-2') return 2;
  throw new Error(`Unexpected visual parity project: ${projectName}`);
}

/** Find the required scene and DPR calibration entry. */
export function findLegacyCalibration(
  metadata: LegacyVisualGateMetadata,
  scenarioId: string,
  devicePixelRatio: number,
): LegacyVisualSceneCalibration {
  const calibration = metadata.calibrations.find((entry) => (
    entry.scenarioId === scenarioId
    && entry.devicePixelRatio === devicePixelRatio
  ));
  if (!calibration) {
    throw new Error(
      `Missing legacy calibration for ${scenarioId} at DPR `
      + `${devicePixelRatio}.`,
    );
  }
  return calibration;
}

/** Wait until the candidate public canvas satisfies its legacy contract. */
export async function waitForLegacyCanvasReadiness(
  canvas: Locator,
  calibration: LegacyVisualSceneCalibration,
  minimumCoverage: number,
): Promise<void> {
  await expect.poll(async () => {
    const metrics = await readCanvasMetrics(canvas);
    if (
      metrics.width !== calibration.publicUniformCanvas.width
      || metrics.height !== calibration.publicUniformCanvas.height
      || metrics.nonTransparentPixels <= minimumCoverage
    ) {
      return false;
    }
    const coverage = await readCanvasRegionCoverage(
      canvas,
      calibration.materialRectangles,
    );
    return coverage.length === calibration.materialRectangles.length
      && coverage.every((region) => (
        region.sampledPixels > 0
        && region.nonTransparentPixels > minimumCoverage
      ));
  }, {
    message: `${calibration.scenarioId} presentation canvas did not become ready`,
    timeout: CANVAS_READINESS_TIMEOUT,
  }).toBe(true);

  let previousFingerprint = '';
  let stableFrames = 0;
  const deadline = Date.now() + CANVAS_READINESS_TIMEOUT;
  while (Date.now() < deadline) {
    const fingerprint = await readCanvasPixelFingerprint(canvas);
    if (
      fingerprint.width !== calibration.publicUniformCanvas.width
      || fingerprint.height !== calibration.publicUniformCanvas.height
      || fingerprint.nonTransparentPixels <= minimumCoverage
    ) {
      previousFingerprint = '';
      stableFrames = 0;
    } else if (fingerprint.sha256 === previousFingerprint) {
      stableFrames += 1;
      if (stableFrames >= CANVAS_STABLE_FRAME_COUNT) return;
    } else {
      previousFingerprint = fingerprint.sha256;
      stableFrames = 1;
    }
    await canvas.evaluate((element) => new Promise<void>((resolveFrame) => {
      element.ownerDocument.defaultView?.requestAnimationFrame(
        () => resolveFrame(),
      );
    }));
  }
  throw new Error(
    `${calibration.scenarioId} presentation canvas did not stabilize`,
  );
}

async function holdLegacyButtonPress(
  page: Page,
  state: Extract<
    LegacyVisualSceneCalibration['scenarioState'],
    { kind: 'pointer-hold' }
  >,
): Promise<void> {
  const target = page.getByTestId(state.targetTestId);
  const bounds = await target.boundingBox();
  if (!bounds) throw new Error('S004 interaction target has no bounding box.');
  await page.mouse.move(
    bounds.x + bounds.width * state.xRatio,
    bounds.y + bounds.height * state.yRatio,
  );
  await page.waitForTimeout(state.hoverSettleMilliseconds);
  await page.mouse.down();
  await page.waitForTimeout(state.holdSettleMilliseconds);
}

/** Reproduce the scene-specific state used by the legacy capture harness. */
export async function prepareLegacyScene(
  page: Page,
  calibration: LegacyVisualSceneCalibration,
): Promise<boolean> {
  const state = calibration.scenarioState;
  if (state.kind === 'static') return false;
  if (state.kind === 'manual-refresh') {
    const shell = page.locator('#app');
    const captureCount = await readNumericAttribute(
      shell,
      'data-capture-count',
    );
    expect(captureCount).toBeGreaterThan(0);
    await page.getByTestId(state.controlTestId).click();
    await expect.poll(() => readNumericAttribute(
      shell,
      'data-capture-count',
    )).toBeGreaterThan(captureCount);
    await page.waitForTimeout(state.settleMilliseconds);
    return false;
  }
  if (state.kind === 'pointer-hold') {
    await holdLegacyButtonPress(page, state);
    return true;
  }
  if (state.kind === 'window-scroll') {
    await page.evaluate(({ x, y }) => window.scrollTo(x, y), {
      x: state.x,
      y: state.y,
    });
    await expect.poll(() => page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }))).toEqual(calibration.scrollPosition);
    await page.waitForTimeout(state.settleMilliseconds);
    return false;
  }
  if (state.kind === 'internal-scroll') {
    const shell = page.locator('#app');
    const source = page.locator('.oracle-backdrop-converter');
    await expect(source).toHaveCount(1);
    await expect.poll(async () => {
      const captureHeight = await readNumericAttribute(
        shell,
        'data-capture-height',
      );
      const sourceHeight = await source.evaluate(
        (element) => element.scrollHeight,
      );
      return captureHeight > 0 && captureHeight < sourceHeight;
    }, {
      message: 'S006 must use bounded DOM capture with a full-content canvas.',
    }).toBe(true);
    expect(
      state.selector,
      'S006 reference scroll selector changed without a candidate mapping.',
    ).toBe(LEGACY_INTERNAL_SCROLL_SELECTOR);
    const content = page.locator(state.selector);
    await content.evaluate((element, scrollTop) => {
      element.scrollTo(0, scrollTop);
    }, state.scrollTop);
    await expect.poll(() => content.evaluate((element) => element.scrollTop))
      .toBe(state.scrollTop);
    await page.waitForTimeout(state.settleMilliseconds);
  }
  return false;
}

/** Toggle the candidate presentation while preserving backdrop content. */
export async function setCandidateGlassEnabled(
  page: Page,
  enabled: boolean,
): Promise<void> {
  await page.getByTestId('glass-toggle').evaluate((element, nextEnabled) => {
    if (!(element instanceof HTMLInputElement)) {
      throw new Error('Glass toggle is not an input element.');
    }
    element.checked = nextEnabled;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, enabled);
  const state = enabled ? 'on' : 'off';
  await expect(page.locator('#app')).toHaveAttribute('data-glass', state);
  await expect(page.locator('.glass-context')).toHaveAttribute(
    'data-glass-enabled',
    String(enabled),
  );
  if (!enabled) {
    await expect(page.locator('.liquid-glass-canvas')).toBeHidden();
  }
  await page.waitForTimeout(100);
}

function expectGeometry(
  id: string,
  field: string,
  actual: number,
  expected: number,
): void {
  expect(
    Math.abs(actual - expected),
    `${id} ${field}: expected ${expected}, received ${actual}`,
  ).toBeLessThanOrEqual(GEOMETRY_EPSILON);
}

/** Assert one candidate rectangle against fixed legacy CSS geometry. */
export function expectLegacyRectangle(
  id: string,
  actual: { x: number; y: number; width: number; height: number },
  expected: { left: number; top: number; right: number; bottom: number },
): void {
  expectGeometry(id, 'x', actual.x, expected.left);
  expectGeometry(id, 'y', actual.y, expected.top);
  expectGeometry(id, 'width', actual.width, expected.right - expected.left);
  expectGeometry(id, 'height', actual.height, expected.bottom - expected.top);
}

/** Assert candidate material identity, order, and exact CSS rectangles. */
export async function expectLegacyMaterialRectangles(
  page: Page,
  rectangles: readonly LegacyMaterialRectangle[],
): Promise<void> {
  const materialIds = await page.locator('[data-oracle-material]').evaluateAll(
    (elements) => elements.map((element) => (
      element.getAttribute('data-oracle-material') ?? ''
    )),
  );
  expect(materialIds).toEqual(rectangles.map(({ id }) => id));

  for (const material of rectangles) {
    const actual = await readElementRect(
      page.locator(`[data-oracle-material="${material.id}"]`),
    );
    expectLegacyRectangle(material.id, actual, material.rect);
  }
}

/** Assert deterministic DOM styling that screenshot differencing cannot isolate. */
export async function expectLegacyMaterialPresentation(
  page: Page,
  rectangles: readonly LegacyMaterialRectangle[],
): Promise<void> {
  const presentations = await page.locator(
    '[data-oracle-material]',
  ).evaluateAll((elements) => elements.map((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error('Expected an HTML oracle material.');
    }
    const style = getComputedStyle(element);
    return {
      color: style.color,
      columnGap: style.columnGap,
      display: style.display,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      id: element.dataset.oracleMaterial ?? '',
      rowGap: style.rowGap,
      textAlign: style.textAlign,
    };
  }));
  expect(presentations.map(({ id }) => id))
    .toEqual(rectangles.map(({ id }) => id));
  for (const presentation of presentations) {
    expect(presentation, `${presentation.id} DOM presentation drifted`)
      .toMatchObject({
        color: 'rgb(0, 0, 0)',
        columnGap: '8px',
        display: 'grid',
        fontSize: '22px',
        fontWeight: '700',
        rowGap: '8px',
        textAlign: 'center',
      });
  }
}

/** Assert the browser environment bound to the exact-pixel oracle. */
export async function expectLegacyBrowserEnvironment(
  page: Page,
  devicePixelRatio: 1 | 2,
  metadata: LegacyVisualGateMetadata,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const protocol = await cdp.send('Browser.getVersion');
  const commandLine = await cdp.send('Browser.getBrowserCommandLine');
  await cdp.detach();
  const effectiveArguments = [...new Set(
    commandLine.arguments.filter((argument) => {
      if (!argument.startsWith('--')) return false;
      const separatorIndex = argument.indexOf('=');
      const name = (
        separatorIndex === -1 ? argument : argument.slice(0, separatorIndex)
      ).toLowerCase();
      return !EPHEMERAL_BROWSER_ARGUMENT_NAMES.has(name);
    }),
  )].sort();
  const environment = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) throw new Error('Visual parity requires WebGL2.');
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    const webGlFingerprint = {
      renderer: String(context.getParameter(context.RENDERER)),
      shadingLanguageVersion: String(
        context.getParameter(context.SHADING_LANGUAGE_VERSION),
      ),
      unmaskedRenderer: debugInfo
        ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : 'unavailable',
      unmaskedVendor: debugInfo
        ? String(context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
        : 'unavailable',
      vendor: String(context.getParameter(context.VENDOR)),
      version: String(context.getParameter(context.VERSION)),
    };
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
      devicePixelRatio: window.devicePixelRatio,
      height: window.innerHeight,
      locale: navigator.language,
      reducedMotion: window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
      webGlFingerprint,
      width: window.innerWidth,
    };
  });
  expect(environment).toEqual({
    colorScheme: 'light',
    devicePixelRatio,
    height: metadata.viewport.height,
    locale: 'en-US',
    reducedMotion: true,
    timeZone: 'UTC',
    userAgent: metadata.userAgent,
    webGlFingerprint: metadata.webGlFingerprint,
    width: metadata.viewport.width,
  });
  expect(effectiveArguments).toEqual(
    metadata.captureEvidence.contract.browser.effectiveArguments,
  );
  expect({
    jsVersion: protocol.jsVersion,
    product: protocol.product,
    protocolVersion: protocol.protocolVersion,
    revision: protocol.revision,
  }).toEqual(metadata.captureEvidence.contract.browser.protocol);
}

/** Collect non-network console errors and uncaught page errors. */
export function collectVisualRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error'
      && !message.text().startsWith('Failed to load resource:')
    ) {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
