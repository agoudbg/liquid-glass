async page => {
  const initialState = await page.evaluate(() => {
    const currentUrl = new window.URL(window.location.href);
    return {
      artifactRoot: currentUrl.searchParams.get('artifactRoot'),
      baseUrl: `${currentUrl.origin}${currentUrl.pathname}`,
    };
  });
  if (!initialState.artifactRoot) throw new Error('artifactRoot query parameter is required.');

  const scenarios = ['S001', 'S002', 'S003', 'S004', 'S005', 'S006'];
  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  const outputDirectory = `${initialState.artifactRoot}/dpr-${devicePixelRatio}`;
  let activeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      activeErrors.push({ kind: 'console', text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    activeErrors.push({ kind: 'pageerror', text: error.message });
  });

  const navigate = async (scenario) => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.goto('about:blank', { waitUntil: 'commit' });
        if (typeof page.requestGC === 'function') await page.requestGC();
        activeErrors = [];
        await page.goto(`${initialState.baseUrl}?scene=${scenario}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          () => window.__LEGACY_ORACLE_READY__ === true,
          undefined,
          { timeout: 60000 },
        );
        await page.waitForFunction(() => {
          const canvases = Array.from(document.querySelectorAll('canvas'));
          return canvases.length > 0 && canvases.every((canvas) => canvas.width > 0 && canvas.height > 0);
        }, undefined, { timeout: 60000 });
        await page.waitForTimeout(350);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${scenario} failed after three navigation attempts: ${reason}`);
  };

  const prepareScenario = async (scenario) => {
    if (scenario === 'S003') {
      await page.getByTestId('manual-refresh').click();
      await page.waitForTimeout(1200);
    } else if (scenario === 'S004') {
      const bounds = await page.getByTestId('interaction-button').boundingBox();
      if (!bounds) throw new Error('S004 interaction target has no bounding box.');
      await page.mouse.move(bounds.x + bounds.width * 0.72, bounds.y + bounds.height * 0.36);
      await page.waitForTimeout(300);
      await page.mouse.down();
      await page.waitForTimeout(900);
    } else if (scenario === 'S005') {
      await page.evaluate(() => window.scrollTo(0, 420));
      await page.waitForTimeout(900);
    } else if (scenario === 'S006') {
      await page.evaluate(() => {
        const scroller = document.querySelector('.liquid-glass-content.scrollable');
        if (!(scroller instanceof HTMLElement)) throw new Error('S006 scroll container was not found.');
        scroller.scrollTop = 360;
        scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await page.waitForTimeout(1200);
    }
  };

  const captureScreenshot = async (path, scenario) => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await page.screenshot({ path, animations: 'disabled', timeout: 60000 });
        return;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(500);
      }
    }
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${scenario} glass-off screenshot failed after three attempts: ${reason}`);
  };

  const results = [];
  for (const scenario of scenarios) {
    await navigate(scenario);
    await prepareScenario(scenario);
    await page.evaluate(() => window.__legacyOracle?.setGlassEnabled(false));
    await page.waitForTimeout(100);
    await captureScreenshot(`${outputDirectory}/${scenario}-glass-off.png`, scenario);
    if (scenario === 'S004') await page.mouse.up();
    results.push({ id: scenario, consoleErrors: [...activeErrors] });
  }

  return {
    browserVersion: page.context().browser()?.version() ?? 'unknown',
    devicePixelRatio,
    scenarios: results,
  };
}
