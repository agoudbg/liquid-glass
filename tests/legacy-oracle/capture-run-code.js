async page => {
  const initialState = await page.evaluate(() => {
    const currentUrl = new window.URL(window.location.href);
    return {
      artifactRoot: currentUrl.searchParams.get('artifactRoot'),
      calibrationRoot: currentUrl.searchParams.get('calibrationRoot'),
      baseUrl: `${currentUrl.origin}${currentUrl.pathname}`,
    };
  });
  const { artifactRoot, calibrationRoot, baseUrl } = initialState;
  if (!artifactRoot || !calibrationRoot) {
    throw new Error('artifactRoot and calibrationRoot query parameters are required.');
  }

  const scenarios = ['S001', 'S002', 'S003', 'S004', 'S005', 'S006'];
  const expectedGeometry = {
    S001: [{ width: 420, height: 220 }],
    S002: [
      { width: 350, height: 210 },
      { width: 350, height: 210 },
      { width: 350, height: 210 },
    ],
    S003: [{ width: 420, height: 220 }],
    S004: [null, null, null],
    S005: [{ width: 340, height: 190 }],
    S006: [{ width: 350, height: 190 }],
  };
  const runCount = 20;
  const viewport = page.viewportSize();
  const browser = page.context().browser();
  const browserVersion = browser?.version() ?? 'unknown';
  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  const userAgent = await page.evaluate(() => navigator.userAgent);
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
        return;
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${scenario} ${label} failed after three navigation attempts: ${reason}`);
  };

  const prepareScenario = async (scenario) => {
    if (scenario === 'S003') {
      await page.getByTestId('manual-refresh').click();
      await page.waitForTimeout(1200);
      return;
    }

    if (scenario === 'S004') {
      const target = page.getByTestId('interaction-button');
      const bounds = await target.boundingBox();
      if (!bounds) throw new Error('S004 interaction target has no bounding box.');
      await page.mouse.move(bounds.x + bounds.width * 0.72, bounds.y + bounds.height * 0.36);
      await page.waitForTimeout(300);
      await page.mouse.down();
      await page.waitForTimeout(900);
      return;
    }

    if (scenario === 'S005') {
      await page.evaluate(() => window.scrollTo(0, 420));
      await page.waitForTimeout(900);
      return;
    }

    if (scenario === 'S006') {
      await page.evaluate(() => {
        const scroller = document.querySelector('.liquid-glass-content.scrollable');
        if (!(scroller instanceof HTMLElement)) {
          throw new Error('S006 internal scroll container was not found.');
        }
        scroller.scrollTop = 360;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await page.waitForTimeout(1200);
    }
  };

  const releaseScenario = async (scenario) => {
    if (scenario === 'S004') {
      await page.mouse.up();
    }
  };

  const captureScreenshot = async (path, label) => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.screenshot({
          path,
          animations: 'disabled',
          timeout: 60000,
        });
        return;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(500);
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${label} failed after three screenshot attempts: ${reason}`);
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
    await validateGeometry(scenario);
    await releaseScenario(scenario);

    const runErrors = [];
    let metadata;
    for (let run = 1; run <= runCount; run += 1) {
      await navigate(scenario, `run ${run}`);
      await prepareScenario(scenario);

      const runName = String(run).padStart(2, '0');
      const calibrationPath = `${calibrationDirectory}/${scenario}-run-${runName}.png`;
      await captureScreenshot(calibrationPath, `${scenario} run ${run} calibration screenshot`);

      if (run === 1) {
        metadata = await page.evaluate(() => window.__legacyOracle?.getMetadata());
        if (!metadata) throw new Error(`${scenario} did not expose oracle metadata.`);

        await captureScreenshot(
          `${outputDirectory}/${scenario}-glass-on.png`,
          `${scenario} glass-on screenshot`,
        );
        await page.evaluate(() => window.__legacyOracle?.setGlassEnabled(false));
        await page.waitForTimeout(100);
        await captureScreenshot(
          `${outputDirectory}/${scenario}-glass-off.png`,
          `${scenario} glass-off screenshot`,
        );
        await page.evaluate(() => window.__legacyOracle?.setGlassEnabled(true));
      }

      if (activeErrors.length > 0) {
        runErrors.push({ run, errors: [...activeErrors] });
      }
      await releaseScenario(scenario);
    }

    sceneResults.push({
      id: scenario,
      metadata,
      consoleErrors: runErrors,
    });
  }

  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    browserName: 'Google Chrome',
    browserVersion,
    userAgent,
    viewport,
    devicePixelRatio,
    runCount,
    scenarios: sceneResults,
  };
}
