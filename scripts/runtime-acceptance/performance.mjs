import assert from 'node:assert/strict';

const TARGETS = {
  candidate: {
    captureRootSelector: 'html',
    label: 'candidate',
    path: 'performance.html',
  },
  legacy: {
    captureRootSelector: 'html',
    label: 'legacy',
    path: '',
  },
};

function percentile(values, fraction) {
  assert(values.length > 0, 'Cannot calculate a percentile without samples.');
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

function median(values) {
  return percentile(values, 0.5);
}

function round(value) {
  return Number(value.toFixed(3));
}

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

async function createPage(browser) {
  const context = await browser.newContext({
    colorScheme: 'light',
    deviceScaleFactor: 1,
    locale: 'en-US',
    reducedMotion: 'no-preference',
    timezoneId: 'UTC',
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(30_000);
  page.setDefaultTimeout(30_000);
  return { context, page };
}

async function waitForReady(page) {
  await page.waitForFunction(() => (
    document.documentElement.dataset.performanceReady === 'true'
  ));
}

function sceneUrl(baseUrl, target, scene) {
  const url = new URL(target.path, `${baseUrl}/`);
  url.searchParams.set('scene', scene);
  return url.href;
}

async function runFrameWindow(page, durationMs) {
  return page.evaluate(async ({ duration }) => {
    const target = document.querySelector('[data-testid="interaction-button"]');
    if (!(target instanceof HTMLElement)) {
      throw new Error('Interaction performance target is missing.');
    }
    const intervals = [];
    const longTasks = [];
    const observer = typeof PerformanceObserver === 'undefined'
      ? null
      : new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push(entry.duration);
        });
    try {
      observer?.observe({ entryTypes: ['longtask'] });
    } catch {
      // Long Task API availability is recorded by the empty result.
    }
    const bounds = target.getBoundingClientRect();
    target.dispatchEvent(new PointerEvent('pointerenter', {
      bubbles: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      pointerId: 1,
      pointerType: 'mouse',
    }));
    await new Promise((resolvePromise) => {
      let previous = 0;
      let startedAt = 0;
      const sample = (timestamp) => {
        if (startedAt === 0) {
          startedAt = timestamp;
          previous = timestamp;
        } else {
          intervals.push(timestamp - previous);
          previous = timestamp;
        }
        const phase = (timestamp - startedAt) / 420;
        target.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true,
          clientX: bounds.left + bounds.width * (0.5 + Math.sin(phase) * 0.38),
          clientY: bounds.top + bounds.height * (0.5 + Math.cos(phase) * 0.3),
          pointerId: 1,
          pointerType: 'mouse',
        }));
        if (timestamp - startedAt >= duration) {
          resolvePromise();
        } else {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    });
    target.dispatchEvent(new PointerEvent('pointerleave', {
      bubbles: true,
      pointerId: 1,
      pointerType: 'mouse',
    }));
    observer?.disconnect();
    return { intervals, longTasks };
  }, { duration: durationMs });
}

async function measureFrameScenario(browser, baseUrl, target, config) {
  const { context, page } = await createPage(browser);
  const errors = collectBrowserErrors(page);
  try {
    await page.goto(sceneUrl(baseUrl, target, 'S004'), {
      waitUntil: 'domcontentloaded',
    });
    await waitForReady(page);
    await runFrameWindow(page, config.warmupMs);
    const sample = await runFrameWindow(page, config.sampleMs);
    assert(sample.intervals.length >= 10, 'Frame window returned too few samples.');
    assert.deepEqual(errors, [], `${target.label} frame scene emitted browser errors.`);
    return {
      longTaskCount: sample.longTasks.length,
      longTaskDurationP95Ms: sample.longTasks.length > 0
        ? round(percentile(sample.longTasks, 0.95))
        : 0,
      p95Ms: round(percentile(sample.intervals, 0.95)),
      sampleCount: sample.intervals.length,
    };
  } finally {
    await context.close();
  }
}

async function waitForCaptureQuiet(page, rootSelector) {
  await page.waitForFunction(async (selector) => {
    const root = document.querySelector(selector);
    if (!(root instanceof HTMLElement)) return false;
    const before = root.dataset.captureCount;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    return root.dataset.captureCount === before;
  }, rootSelector);
}

async function startLongTaskWindow(page) {
  await page.evaluate(() => {
    window.__runtimeAcceptanceLongTasks = [];
    window.__runtimeAcceptanceLongTaskObserver?.disconnect();
    const observer = typeof PerformanceObserver === 'undefined'
      ? null
      : new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__runtimeAcceptanceLongTasks?.push(entry.duration);
          }
        });
    try {
      observer?.observe({ entryTypes: ['longtask'] });
    } catch {
      // Long Task API availability is represented by an empty sample.
    }
    window.__runtimeAcceptanceLongTaskObserver = observer;
  });
}

async function stopLongTaskWindow(page) {
  return page.evaluate(() => {
    window.__runtimeAcceptanceLongTaskObserver?.disconnect();
    return window.__runtimeAcceptanceLongTasks ?? [];
  });
}

async function measureOneCapture(page, rootSelector) {
  return page.evaluate(async (selector) => {
    const root = document.querySelector(selector);
    const button = document.querySelector('[data-testid="manual-refresh"]');
    if (!(root instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
      throw new Error('Capture performance controls are missing.');
    }
    const initialCount = Number(root.dataset.captureCount ?? '0');
    return new Promise((resolvePromise, rejectPromise) => {
      const observer = new MutationObserver(() => {
        const nextCount = Number(root.dataset.captureCount ?? '0');
        if (nextCount <= initialCount) return;
        observer.disconnect();
        clearTimeout(timeout);
        resolvePromise(performance.now() - startedAt);
      });
      observer.observe(root, {
        attributeFilter: ['data-capture-count'],
        attributes: true,
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        rejectPromise(new Error('Backdrop capture did not complete within 30 seconds.'));
      }, 30_000);
      const startedAt = performance.now();
      button.click();
    });
  }, rootSelector);
}

async function measureCaptureScenario(browser, baseUrl, target, config) {
  const { context, page } = await createPage(browser);
  const errors = collectBrowserErrors(page);
  try {
    await page.goto(sceneUrl(baseUrl, target, 'S003'), {
      waitUntil: 'domcontentloaded',
    });
    await waitForReady(page);
    await page.waitForTimeout(config.warmupMs);
    await waitForCaptureQuiet(page, target.captureRootSelector);
    await startLongTaskWindow(page);
    const samples = [];
    const startedAt = Date.now();
    while (Date.now() - startedAt < config.sampleMs) {
      samples.push(await measureOneCapture(page, target.captureRootSelector));
      await page.waitForTimeout(50);
    }
    const longTasks = await stopLongTaskWindow(page);
    assert(samples.length >= 3, 'Capture window returned too few samples.');
    assert.deepEqual(errors, [], `${target.label} capture scene emitted browser errors.`);
    return {
      longTaskCount: longTasks.length,
      longTaskDurationP95Ms: longTasks.length > 0
        ? round(percentile(longTasks, 0.95))
        : 0,
      p95Ms: round(percentile(samples, 0.95)),
      sampleCount: samples.length,
    };
  } finally {
    await context.close();
  }
}

async function measureTargetRun(browser, baseUrl, target, config) {
  const frame = await measureFrameScenario(browser, baseUrl, target, config);
  const capture = await measureCaptureScenario(browser, baseUrl, target, config);
  return {
    capture,
    frame,
    longTaskCount: frame.longTaskCount + capture.longTaskCount,
  };
}

function summarizeRuns(runs) {
  return {
    captureP95MedianMs: round(median(runs.map(({ capture }) => capture.p95Ms))),
    frameP95MedianMs: round(median(runs.map(({ frame }) => frame.p95Ms))),
    longTaskCountMedian: median(runs.map(({ longTaskCount }) => longTaskCount)),
  };
}

/** Measure live legacy and candidate builds and enforce the approved relative budgets. */
export async function runRelativePerformanceAcceptance(options) {
  const runs = { candidate: [], legacy: [] };
  for (let index = 0; index < options.config.runs; index += 1) {
    const order = index % 2 === 0
      ? ['legacy', 'candidate']
      : ['candidate', 'legacy'];
    for (const name of order) {
      const target = TARGETS[name];
      const baseUrl = name === 'legacy'
        ? options.legacyUrl
        : options.candidateUrl;
      console.log(
        `Measuring ${target.label} runtime, run ${String(index + 1)}/${
          String(options.config.runs)
        }...`,
      );
      runs[name].push(await measureTargetRun(
        options.browser,
        baseUrl,
        target,
        options.config,
      ));
    }
  }

  const summary = {
    candidate: summarizeRuns(runs.candidate),
    legacy: summarizeRuns(runs.legacy),
  };
  const budgets = {
    captureP95MaximumMs: round(summary.legacy.captureP95MedianMs * 1.15),
    frameP95MaximumMs: round(summary.legacy.frameP95MedianMs * 1.1),
    longTaskCountMaximum: summary.legacy.longTaskCountMedian,
  };
  const failures = [];
  if (summary.candidate.frameP95MedianMs > budgets.frameP95MaximumMs) {
    failures.push(
      `Candidate P95 frame time ${
        String(summary.candidate.frameP95MedianMs)
      }ms exceeds ${String(budgets.frameP95MaximumMs)}ms.`,
    );
  }
  if (summary.candidate.captureP95MedianMs > budgets.captureP95MaximumMs) {
    failures.push(
      `Candidate P95 capture latency ${
        String(summary.candidate.captureP95MedianMs)
      }ms exceeds ${String(budgets.captureP95MaximumMs)}ms.`,
    );
  }
  if (summary.candidate.longTaskCountMedian > budgets.longTaskCountMaximum) {
    failures.push(
      `Candidate long-task count ${
        String(summary.candidate.longTaskCountMedian)
      } exceeds legacy ${String(budgets.longTaskCountMaximum)}.`,
    );
  }
  return {
    budgets,
    config: options.config,
    failures,
    formal: options.config.runs === 3
      && options.config.sampleMs === 15_000
      && options.config.warmupMs === 5_000,
    passed: failures.length === 0,
    runs,
    scenarios: {
      capture: 'S003',
      frame: 'S004',
    },
    summary,
  };
}
