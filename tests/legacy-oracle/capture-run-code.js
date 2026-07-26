/* global Event, HTMLCanvasElement, HTMLElement, crypto, document, navigator, requestAnimationFrame, window */
async page => {
  const initialState = await page.evaluate(() => {
    const currentUrl = new window.URL(window.location.href);
    return {
      artifactRoot: currentUrl.searchParams.get('artifactRoot'),
      calibrationRoot: currentUrl.searchParams.get('calibrationRoot'),
      baseUrl: `${currentUrl.origin}${currentUrl.pathname}`,
      captureContractSha256: currentUrl.searchParams.get('captureContractSha256'),
      captureId: currentUrl.searchParams.get('captureId'),
      sourceCommit: currentUrl.searchParams.get('sourceCommit'),
    };
  });
  const {
    artifactRoot, baseUrl, calibrationRoot, captureContractSha256, captureId, sourceCommit,
  } = initialState;
  if (
    !artifactRoot || !calibrationRoot || !captureContractSha256 || !captureId || !sourceCommit
  ) {
    throw new Error(
      'artifactRoot, calibrationRoot, capture contract, capture ID, and '
      + 'source commit query parameters are required.',
    );
  }
  const scenarios = ['S001', 'S002', 'S003', 'S004', 'S005', 'S006'];
  const ephemeralBrowserArgumentNames = new Set(
    ['breakpad-dump-location', 'crash-dumps-dir', 'data-path', 'disk-cache-dir', 'log-file',
      'remote-debugging-pipe', 'remote-debugging-port', 'trace-startup-file', 'user-data-dir']
      .map(name => `--${name}`),
  );
  const publicUniformCanvasSelector = 'canvas.liquid-glass-uniform-canvas';
  const publicUniformCanvasMinimumNonTransparentPixels = 1000;
  const publicUniformCanvasStableFrameCount = 3;
  const rawPublicCanvasCaptureMethod = 'HTMLCanvasElement.toDataURL("image/png")';
  const rawPublicCanvasTransferMethod = 'Playwright Download.saveAs';
  const expectedGeometry = {
    S001: [{ width: 420, height: 220 }],
    S002: Array.from({ length: 3 }, () => ({ width: 350, height: 210 })),
    S003: [{ width: 420, height: 220 }],
    S004: [null, null, null],
    S005: [{ width: 340, height: 190 }],
    S006: [{ width: 350, height: 190 }],
  };
  const scenarioStates = {
    S001: { kind: 'static' },
    S002: { kind: 'static' },
    S003: { kind: 'manual-refresh', controlTestId: 'manual-refresh', settleMilliseconds: 1200 },
    S004: {
      kind: 'pointer-hold', holdSettleMilliseconds: 900, hoverSettleMilliseconds: 300,
      targetTestId: 'interaction-button', xRatio: 0.72, yRatio: 0.36,
    },
    S005: { kind: 'window-scroll', settleMilliseconds: 900, x: 0, y: 420 },
    S006: {
      kind: 'internal-scroll', scrollTop: 360,
      selector: '.liquid-glass-content.scrollable', settleMilliseconds: 1200,
    },
  };
  const runCount = 20;
  const viewport = page.viewportSize();
  const browser = page.context().browser();
  const browserVersion = browser?.version() ?? 'unknown';
  const cdp = await page.context().newCDPSession(page);
  const browserProtocol = await cdp.send('Browser.getVersion');
  const browserCommandLine = await cdp.send('Browser.getBrowserCommandLine');
  await cdp.detach();
  const effectiveBrowserArguments = [...new Set(
    browserCommandLine.arguments.filter((argument) => {
      if (!argument.startsWith('--')) return false;
      const separatorIndex = argument.indexOf('=');
      const name = (
        separatorIndex === -1 ? argument : argument.slice(0, separatorIndex)
      ).toLowerCase();
      return !ephemeralBrowserArgumentNames.has(name);
    }),
  )].sort();
  const pageEnvironment = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) throw new Error('Legacy capture requires WebGL2.');
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    const webGlFingerprint = {
      renderer: String(context.getParameter(context.RENDERER)),
      shadingLanguageVersion: String(context.getParameter(context.SHADING_LANGUAGE_VERSION)),
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
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      devicePixelRatio: window.devicePixelRatio,
      locale: navigator.language,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'reduce' : 'no-preference',
      timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
      webGlFingerprint,
    };
  });
  const {
    colorScheme, devicePixelRatio, locale, reducedMotion, timezoneId, userAgent, webGlFingerprint,
  } = pageEnvironment;
  const outputDirectory = `${artifactRoot}/dpr-${devicePixelRatio}`;
  const calibrationDirectory = `${calibrationRoot}/dpr-${devicePixelRatio}`;

  let activeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      activeErrors.push({ kind: 'console', text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    activeErrors.push({ kind: 'pageerror', text: error.message });
  });
  const readPublicUniformCanvas = async () => page.evaluate(async (selector) => {
    const canvas = document.querySelector(selector);
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Legacy public uniform canvas was not found.');
    }
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Legacy public uniform canvas does not expose a 2D context.');
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonTransparentPixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 0) nonTransparentPixels += 1;
    }
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    const sha256 = Array.from(
      new Uint8Array(digest),
      byte => byte.toString(16).padStart(2, '0'),
    ).join('');
    return {
      classNames: Array.from(canvas.classList).sort(),
      width: canvas.width, height: canvas.height, nonTransparentPixels, sha256,
    };
  }, publicUniformCanvasSelector);

  const assertPublicUniformCanvas = async (scenario, label) => {
    const snapshot = await readPublicUniformCanvas();
    if (snapshot.nonTransparentPixels <= publicUniformCanvasMinimumNonTransparentPixels) {
      throw new Error(
        `${scenario} ${label} public uniform canvas has `
        + `${snapshot.nonTransparentPixels} non-transparent pixels; expected more than `
        + `${publicUniformCanvasMinimumNonTransparentPixels}.`,
      );
    }
    return snapshot;
  };

  const waitForStablePublicUniformCanvas = async (scenario, label) => {
    let previousSha256 = '';
    let stableFrames = 0;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      const snapshot = await assertPublicUniformCanvas(scenario, label);
      if (snapshot.sha256 === previousSha256) {
        stableFrames += 1;
        if (stableFrames >= publicUniformCanvasStableFrameCount) {
          const { sha256, ...evidence } = snapshot;
          return { evidence, sha256 };
        }
      } else {
        previousSha256 = snapshot.sha256;
        stableFrames = 1;
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    }
    throw new Error(`${scenario} ${label} public uniform canvas did not stabilize.`);
  };

  const waitForPublicUniformCanvas = async (scenario) => {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForFunction(
      ({ minimumNonTransparentPixels, selector }) => {
        const canvas = document.querySelector(selector);
        if (!(canvas instanceof HTMLCanvasElement)) return false;
        const context = canvas.getContext('2d');
        if (!context) return false;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonTransparentPixels = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] === 0) continue;
          nonTransparentPixels += 1;
          if (nonTransparentPixels > minimumNonTransparentPixels) return true;
        }
        return false;
      },
      {
        minimumNonTransparentPixels: publicUniformCanvasMinimumNonTransparentPixels,
        selector: publicUniformCanvasSelector,
      },
      { timeout: 60000, polling: 100 },
    );
    await waitForStablePublicUniformCanvas(scenario, 'readiness');
  };

  const navigate = async (scenario, label) => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.goto('about:blank', { waitUntil: 'commit' });
        if (typeof page.requestGC === 'function') await page.requestGC();
        activeErrors = [];
        await page.goto(`${baseUrl}?scene=${scenario}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          () => window.__LEGACY_ORACLE_READY__ === true,
          undefined,
          { timeout: 60000 },
        );
        await page.waitForFunction(() => {
          const canvases = Array.from(document.querySelectorAll('canvas'));
          return canvases.length > 0 && canvases.every((canvas) => canvas.width > 0 && canvas.height > 0);
        }, undefined, { timeout: 60000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(350);
        await waitForPublicUniformCanvas(scenario);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${scenario} ${label} failed after three navigation attempts: ${reason}`);
  };

  const prepareScenario = async (scenario) => {
    const state = scenarioStates[scenario];
    if (state.kind === 'manual-refresh') {
      await page.getByTestId(state.controlTestId).click();
      await page.waitForTimeout(state.settleMilliseconds);
      return;
    }

    if (state.kind === 'pointer-hold') {
      const target = page.getByTestId(state.targetTestId);
      const bounds = await target.boundingBox();
      if (!bounds) throw new Error('S004 interaction target has no bounding box.');
      await page.mouse.move(
        bounds.x + bounds.width * state.xRatio, bounds.y + bounds.height * state.yRatio,
      );
      await page.waitForTimeout(state.hoverSettleMilliseconds);
      await page.mouse.down();
      await page.waitForTimeout(state.holdSettleMilliseconds);
      return;
    }

    if (state.kind === 'window-scroll') {
      await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x: state.x, y: state.y });
      await page.waitForTimeout(state.settleMilliseconds);
      return;
    }

    if (state.kind === 'internal-scroll') {
      await page.evaluate(({ scrollTop, selector }) => {
        const scroller = document.querySelector(selector);
        if (!(scroller instanceof HTMLElement)) {
          throw new Error('S006 internal scroll container was not found.');
        }
        scroller.scrollTop = scrollTop;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      }, { scrollTop: state.scrollTop, selector: state.selector });
      await page.waitForTimeout(state.settleMilliseconds);
    }
  };

  const releaseScenario = async (scenario) => {
    if (scenario === 'S004') {
      await page.mouse.up();
    }
  };

  const captureScreenshot = async (path, label, requireStable = false) => {
    let lastError;
    let previous;
    const maximumAttempts = requireStable ? 6 : 3;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const current = await page.screenshot({ path, animations: 'disabled', timeout: 60000 });
        if (!requireStable) return;
        if (
          previous
          && current.length === previous.length
          && current.every((value, index) => value === previous[index])
        ) {
          return;
        }
        previous = current;
      } catch (error) {
        lastError = error;
      }
      await page.waitForTimeout(150);
    }
    if (previous) {
      throw new Error(`${label} did not stabilize across consecutive screenshots.`);
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${label} failed after ${maximumAttempts} screenshot attempts: ${reason}`);
  };

  const captureRawPublicCanvas = async (scenario) => {
    const fileName = `${scenario}-canvas.png`;
    const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
    const serializedCanvas = await page.evaluate(async ({ fileName: browserFileName, selector }) => {
      const canvas = document.querySelector(selector);
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Legacy public uniform canvas was not found.');
      }
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Legacy public uniform canvas does not expose a 2D context.');
      }
      const dataUrl = canvas.toDataURL('image/png');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonTransparentPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) nonTransparentPixels += 1;
      }
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      const sha256 = Array.from(
        new Uint8Array(digest),
        byte => byte.toString(16).padStart(2, '0'),
      ).join('');
      const anchor = document.createElement('a');
      anchor.download = browserFileName;
      anchor.href = dataUrl;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      return { width: canvas.width, height: canvas.height, nonTransparentPixels, sha256 };
    }, { fileName, selector: publicUniformCanvasSelector });
    const download = await downloadPromise;
    if (download.suggestedFilename() !== fileName) {
      throw new Error(
        `${scenario} raw canvas download was named ${download.suggestedFilename()}.`,
      );
    }
    await download.saveAs(`${outputDirectory}/${fileName}`);
    const { sha256, ...canvasEvidence } = serializedCanvas;
    return {
      artifact: {
        artifactPath: `dpr-${devicePixelRatio}/${fileName}`, captureRun: 1,
        selector: publicUniformCanvasSelector, serialization: rawPublicCanvasCaptureMethod,
        transfer: rawPublicCanvasTransferMethod, ...canvasEvidence,
      },
      sha256,
    };
  };

  const validateGeometry = async (scenario) => {
    const currentMetadata = await page.evaluate(() => window.__legacyOracle?.getMetadata());
    if (!currentMetadata) throw new Error(`${scenario} did not expose oracle metadata.`);
    const expectations = expectedGeometry[scenario];
    if (currentMetadata.materials.length !== expectations.length) {
      throw new Error(`${scenario} material count is ${currentMetadata.materials.length}, expected ${expectations.length}.`);
    }
    currentMetadata.materials.forEach((material, index) => {
      const { rect } = material;
      const intersectsViewport = rect.right > 0
        && rect.bottom > 0
        && rect.left < viewport.width
        && rect.top < viewport.height;
      if (!intersectsViewport) {
        throw new Error(`${scenario} material ${material.id} does not intersect the viewport.`);
      }
      const expectation = expectations[index];
      if (expectation
        && (Math.abs(rect.width - expectation.width) > 2
          || Math.abs(rect.height - expectation.height) > 2)) {
        throw new Error(
          `${scenario} material ${material.id} is ${rect.width}x${rect.height}, expected ${expectation.width}x${expectation.height}.`,
        );
      }
    });
  };

  const sceneResults = [];
  for (const scenario of scenarios) {
    await navigate(scenario, 'warm-up');
    await prepareScenario(scenario);
    await waitForStablePublicUniformCanvas(scenario, 'warm-up');
    await validateGeometry(scenario);
    await releaseScenario(scenario);

    const runErrors = [];
    let metadata;
    let publicUniformCanvas;
    let rawPublicCanvas;
    for (let run = 1; run <= runCount; run += 1) {
      await navigate(scenario, `run ${run}`);
      await prepareScenario(scenario);
      const runPublicUniformCanvas = await waitForStablePublicUniformCanvas(
        scenario,
        `run ${run}`,
      );

      if (run === 1) {
        metadata = await page.evaluate(() => window.__legacyOracle?.getMetadata());
        if (!metadata) throw new Error(`${scenario} did not expose oracle metadata.`);
        const rawCapture = await captureRawPublicCanvas(scenario);
        if (rawCapture.sha256 !== runPublicUniformCanvas.sha256) {
          throw new Error(
            `${scenario} raw canvas changed after its stable capture point.`,
          );
        }
        publicUniformCanvas = runPublicUniformCanvas.evidence;
        rawPublicCanvas = rawCapture.artifact;
      }

      const runName = String(run).padStart(2, '0');
      const calibrationPath = `${calibrationDirectory}/${scenario}-run-${runName}.png`;
      await captureScreenshot(calibrationPath, `${scenario} run ${run} calibration screenshot`);

      if (run === 1) {
        await captureScreenshot(
          `${outputDirectory}/${scenario}-glass-on.png`,
          `${scenario} glass-on screenshot`,
          true,
        );
        await page.evaluate(() => window.__legacyOracle?.setGlassEnabled(false));
        await page.waitForTimeout(100);
        await captureScreenshot(
          `${outputDirectory}/${scenario}-glass-off.png`,
          `${scenario} glass-off screenshot`,
          true,
        );
        await page.evaluate(() => window.__legacyOracle?.setGlassEnabled(true));
      }

      if (activeErrors.length > 0) {
        runErrors.push({ run, errors: [...activeErrors] });
      }
      await releaseScenario(scenario);
    }
    if (!publicUniformCanvas) {
      throw new Error(`${scenario} did not record public uniform canvas evidence.`);
    }
    if (!rawPublicCanvas) {
      throw new Error(`${scenario} did not record a raw public canvas artifact.`);
    }

    sceneResults.push({
      id: scenario,
      metadata,
      publicUniformCanvas,
      rawPublicCanvas,
      scenarioState: scenarioStates[scenario],
      consoleErrors: runErrors,
    });
  }

  return {
    schemaVersion: 3,
    capturedAt: new Date().toISOString(),
    browserName: 'Google Chrome',
    browserVersion,
    browserProtocol: {
      jsVersion: browserProtocol.jsVersion,
      product: browserProtocol.product,
      protocolVersion: browserProtocol.protocolVersion,
      revision: browserProtocol.revision,
    },
    captureContractSha256,
    captureId,
    captureMode: 'full',
    colorScheme,
    effectiveBrowserArguments,
    locale,
    reducedMotion,
    sourceCommit,
    timezoneId,
    userAgent,
    webGlFingerprint,
    viewport,
    devicePixelRatio,
    runCount,
    publicUniformCanvasReadiness: {
      trigger: 'window-resize',
      minimumNonTransparentPixels: publicUniformCanvasMinimumNonTransparentPixels,
      stability: {
        consecutiveFrames: publicUniformCanvasStableFrameCount,
        fingerprint: 'SHA-256 RGBA',
        sampling: 'requestAnimationFrame',
      },
    },
    scenarios: sceneResults,
  };
}
