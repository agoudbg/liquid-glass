import assert from 'node:assert/strict';

const FRAMEWORKS = ['react', 'solid', 'vue'];
const SCENES = ['S003', 'S009', 'S010', 'S011', 'S012'];
const TEARDOWN_EVENT = 'liquid-glass-playground-test-teardown';

function collectBrowserErrors(page) {
  const errors = [];
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

async function waitForReady(page, expected) {
  await page.waitForFunction((next) => (
    document.documentElement.dataset.playgroundReady === 'true'
    && document.querySelector('#app')?.getAttribute('data-ready') === 'true'
    && document.querySelector('#app')?.getAttribute('data-framework') === next.framework
    && document.querySelector('#app')?.getAttribute('data-scene') === next.scene
  ), expected);
}

async function readCaptureCount(page) {
  return Number(
    await page.locator('#app').getAttribute('data-capture-count') ?? '0',
  );
}

async function waitForCaptureAdvance(page, previous) {
  await page.waitForFunction((captureCount) => (
    Number(document.querySelector('#app')?.getAttribute('data-capture-count') ?? '0')
      > captureCount
  ), previous);
}

async function readResourceState(page) {
  return page.locator('#app').evaluate((element) => {
    const read = (name) => Number(element.dataset[name] ?? '0');
    return {
      activeContexts: read('activeContexts'),
      glError: element.dataset.glError ?? 'missing',
      liveResources: read('liveResources'),
      retiredContexts: read('retiredContexts'),
      retiredDestroyedContexts: read('retiredDestroyedContexts'),
      retiredResources: read('retiredResources'),
    };
  });
}

function assertLiveResourceState(state) {
  assert(
    state.activeContexts >= 1 && state.activeContexts <= 2,
    `Unexpected active context count: ${String(state.activeContexts)}.`,
  );
  assert(state.liveResources > 0, 'Active contexts reported no live resources.');
  assert.equal(state.retiredResources, 0, 'A retired context retained resources.');
  assert.equal(
    state.retiredDestroyedContexts,
    state.retiredContexts,
    'A retired context did not reach the destroyed lifecycle.',
  );
  assert.equal(state.glError, 'NO_ERROR', `WebGL reported ${state.glError}.`);
}

async function readCanvasEvidence(page) {
  return page.locator('.liquid-glass-canvas').evaluateAll((elements) => (
    elements.map((element, index) => {
      if (!(element instanceof HTMLCanvasElement)) {
        throw new Error('Stability scene exposed a non-canvas presentation element.');
      }
      const context = element.getContext('2d');
      if (!context) throw new Error('Presentation canvas is not readable.');
      const pixels = context.getImageData(0, 0, element.width, element.height).data;
      let nonTransparentPixels = 0;
      for (let pixelIndex = 3; pixelIndex < pixels.length; pixelIndex += 16) {
        if (pixels[pixelIndex] !== 0) nonTransparentPixels += 1;
      }
      return {
        height: element.height,
        index,
        nonTransparentPixels,
        width: element.width,
      };
    })
  ));
}

async function assertNonEmptyCanvas(page, metadata) {
  const deadline = Date.now() + 15_000;
  let evidence = [];
  while (Date.now() < deadline) {
    evidence = await readCanvasEvidence(page);
    if (evidence.some((canvas) => (
      canvas.width > 0
      && canvas.height > 0
      && canvas.nonTransparentPixels > 250
    ))) {
      return;
    }
    await page.waitForTimeout(200);
  }
  assert.fail(
    `Stability canvas did not become non-empty: ${JSON.stringify({
      ...metadata,
      canvases: evidence,
    })}`,
  );
}

async function exerciseScene(page, scene, iteration) {
  if (scene === 'S003') {
    const beforeMutation = await readCaptureCount(page);
    await page.locator('[data-action="mutate-dom"]').click();
    await waitForCaptureAdvance(page, beforeMutation);
    const afterMutation = await readCaptureCount(page);
    await page.locator('[data-action="refresh-backdrop"]').click();
    await waitForCaptureAdvance(page, afterMutation);
    let stableCount = await readCaptureCount(page);
    let stableChecks = 0;
    while (stableChecks < 3) {
      await page.waitForTimeout(200);
      const nextCount = await readCaptureCount(page);
      if (nextCount === stableCount) {
        stableChecks += 1;
      } else {
        stableCount = nextCount;
        stableChecks = 0;
      }
    }
    return;
  }
  if (scene === 'S009') {
    await page.setViewportSize({
      height: iteration % 2 === 0 ? 860 : 900,
      width: iteration % 2 === 0 ? 1360 : 1440,
    });
    return;
  }
  if (scene === 'S010') {
    await page.locator('[data-material-id="proxy"]').evaluate((element, index) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error('Proxy material is not an HTML element.');
      }
      element.style.left = `${String(24 + (index % 7))}%`;
      window.dispatchEvent(new Event('scroll'));
    }, iteration);
    return;
  }
  if (scene === 'S012' && iteration % 4 === 0) {
    await page.locator('[data-action="lose-context"]').click();
    await page.waitForFunction(() => (
      document.querySelector('#app')?.getAttribute('data-renderer-state')
        === 'context-lost'
    ));
    await page.locator('[data-action="restore-context"]').click();
    await page.waitForFunction(() => (
      document.querySelector('#app')?.getAttribute('data-renderer-state') === 'ready'
    ));
  }
}

async function readHeapSample(cdpSession, startedAt) {
  const usage = await cdpSession.send('Runtime.getHeapUsage');
  return {
    elapsedMs: Date.now() - startedAt,
    usedSize: usage.usedSize,
  };
}

function summarizeHeap(samples) {
  if (samples.length === 0) {
    return {
      deltaBytes: 0,
      endBytes: 0,
      maximumBytes: 0,
      minimumBytes: 0,
      slopeBytesPerMinute: 0,
      startBytes: 0,
    };
  }
  const count = samples.length;
  const xMean = samples.reduce((total, sample) => total + sample.elapsedMs, 0) / count;
  const yMean = samples.reduce((total, sample) => total + sample.usedSize, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (const sample of samples) {
    numerator += (sample.elapsedMs - xMean) * (sample.usedSize - yMean);
    denominator += (sample.elapsedMs - xMean) ** 2;
  }
  const first = samples[0];
  const last = samples.at(-1);
  assert(first && last, 'Heap summary lost its boundary samples.');
  return {
    deltaBytes: last.usedSize - first.usedSize,
    endBytes: last.usedSize,
    maximumBytes: Math.max(...samples.map(({ usedSize }) => usedSize)),
    minimumBytes: Math.min(...samples.map(({ usedSize }) => usedSize)),
    slopeBytesPerMinute: denominator === 0
      ? 0
      : (numerator / denominator) * 60_000,
    startBytes: first.usedSize,
  };
}

/** Stress framework, scene, capture, context, and teardown lifecycles for five minutes. */
export async function runFiveMinuteStabilityAcceptance(options) {
  const context = await options.browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    locale: 'en-US',
    reducedMotion: 'no-preference',
    timezoneId: 'UTC',
    viewport: { height: 900, width: 1440 },
  });
  await context.addInitScript(() => {
    window.__runtimeStabilityLongTasks = [];
    const observer = typeof PerformanceObserver === 'undefined'
      ? null
      : new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__runtimeStabilityLongTasks?.push(entry.duration);
          }
        });
    try {
      observer?.observe({ entryTypes: ['longtask'] });
    } catch {
      // Long Task API availability is represented by an empty sample.
    }
    window.__runtimeStabilityLongTaskObserver = observer;
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(30_000);
  page.setDefaultTimeout(30_000);
  const errors = collectBrowserErrors(page);
  const cdpSession = await context.newCDPSession(page);
  const startedAt = Date.now();
  const heapSamples = [];
  let nextHeapSampleAt = 0;
  let iteration = 0;

  try {
    await page.goto(
      `${options.candidateUrl}/?test=1&framework=vue&scene=S012&debug=on&precision=1`,
      { waitUntil: 'domcontentloaded' },
    );
    await waitForReady(page, { framework: 'vue', scene: 'S012' });
    heapSamples.push(await readHeapSample(cdpSession, startedAt));
    nextHeapSampleAt = 15_000;

    while (Date.now() - startedAt < options.config.durationMs) {
      const scene = SCENES[iteration % SCENES.length];
      const framework = FRAMEWORKS[iteration % FRAMEWORKS.length];
      const currentFramework = iteration === 0
        ? 'vue'
        : FRAMEWORKS[(iteration - 1) % FRAMEWORKS.length];
      if (iteration % 10 === 0) {
        console.log(
          `Stability progress: iteration ${String(iteration)}, ${scene}/${framework}.`,
        );
      }
      try {
        await page.locator('[data-testid="scene-select"]').selectOption(scene);
        await waitForReady(page, {
          framework: currentFramework,
          scene,
        });
        await page.locator(`button[data-framework="${framework}"]`).click();
        await waitForReady(page, { framework, scene });
        await exerciseScene(page, scene, iteration);
        await waitForReady(page, { framework, scene });
        const resourceState = await readResourceState(page);
        assertLiveResourceState(resourceState);
        if (iteration % 8 === 0) {
          await assertNonEmptyCanvas(page, { framework, iteration, scene });
        }
      } catch (error) {
        throw new Error(
          `Stability iteration ${String(iteration)} failed in ${scene}/${framework}.`,
          { cause: error },
        );
      }

      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= nextHeapSampleAt) {
        heapSamples.push(await readHeapSample(cdpSession, startedAt));
        nextHeapSampleAt += 15_000;
      }
      iteration += 1;
      await page.waitForTimeout(options.config.actionPauseMs);
    }

    const currentFramework = iteration === 0
      ? 'vue'
      : FRAMEWORKS[(iteration - 1) % FRAMEWORKS.length];
    await page.setViewportSize({ height: 900, width: 1440 });
    const sceneSelect = page.locator('[data-testid="scene-select"]');
    // A synthetic change on the current scene resets readiness without remounting.
    if (await sceneSelect.inputValue() !== 'S012') {
      await sceneSelect.selectOption('S012');
    }
    await waitForReady(page, {
      framework: currentFramework,
      scene: 'S012',
    });
    await page.locator('[data-action="remount-context"]').click();
    await waitForReady(page, {
      framework: currentFramework,
      scene: 'S012',
    });
    assertLiveResourceState(await readResourceState(page));
    await page.evaluate((eventName) => window.dispatchEvent(new Event(eventName)), TEARDOWN_EVENT);
    await page.waitForFunction(() => (
      document.querySelector('#app')?.getAttribute('data-active-contexts') === '0'
    ));
    const finalResources = await readResourceState(page);
    assert.equal(finalResources.activeContexts, 0);
    assert.equal(finalResources.liveResources, 0);
    assert.equal(finalResources.retiredResources, 0);
    assert.equal(
      finalResources.retiredDestroyedContexts,
      finalResources.retiredContexts,
    );
    heapSamples.push(await readHeapSample(cdpSession, startedAt));
    const longTasks = await page.evaluate(() => {
      window.__runtimeStabilityLongTaskObserver?.disconnect();
      return window.__runtimeStabilityLongTasks ?? [];
    });
    assert.deepEqual(errors, [], 'Five-minute stability run emitted browser errors.');
    return {
      actionCount: iteration,
      config: options.config,
      elapsedMs: Date.now() - startedAt,
      finalResources,
      formal: options.config.durationMs === 300_000,
      heap: {
        diagnosticOnly: true,
        sampleCount: heapSamples.length,
        ...summarizeHeap(heapSamples),
      },
      longTasks: {
        count: longTasks.length,
        totalDurationMs: longTasks.reduce((total, duration) => total + duration, 0),
      },
      scenes: SCENES,
    };
  } finally {
    await context.close();
  }
}
