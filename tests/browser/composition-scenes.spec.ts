import {
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';

import {
  comparePngPixels,
  readCanvasMetrics,
  readNumericAttribute,
} from './support/renderer';

const FRAMEWORKS = ['vue', 'react', 'solid'] as const;
const COMPOSITION_SCENES = ['S008', 'S009', 'S010', 'S011', 'S012'] as const;

test('renders every advanced Composition scene through every adapter', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const runtimeErrors = collectRuntimeErrors(page);

  for (const framework of FRAMEWORKS) {
    for (const scene of COMPOSITION_SCENES) {
      await page.goto(
        `/?test=1&framework=${framework}&scene=${scene}`,
        { waitUntil: 'domcontentloaded' },
      );
      const shell = page.locator('#app');
      await expect(shell).toHaveAttribute('data-ready', 'true', {
        timeout: 15_000,
      });
      await expect(shell).toHaveAttribute('data-framework', framework);
      await expect(shell).toHaveAttribute('data-scene', scene);
      await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
      await expect(page.getByTestId('composition-scene')).toBeVisible();
      await expect(page.locator('.liquid-glass-material')).toHaveCount(
        materialCount(scene),
      );

      const outerCanvas = page.locator(
        '.composition-context > .liquid-glass-content > .liquid-glass-canvas',
      );
      const metrics = await readCanvasMetrics(outerCanvas);
      expect(metrics.width).toBeGreaterThan(0);
      expect(metrics.height).toBeGreaterThan(0);
      if (scene !== 'S008') {
        expect(metrics.nonTransparentPixels).toBeGreaterThan(1_000);
      }
    }
  }

  expect(runtimeErrors).toEqual([]);
});

test('keeps uniform and dedicated output equivalent for a deterministic fixture', async ({
  page,
}) => {
  for (const framework of FRAMEWORKS) {
    const captures: Buffer[] = [];
    for (const mode of ['uniform', 'dedicated'] as const) {
      await page.goto(
        `/?test=1&framework=${framework}&scene=S001&mode=${mode}`,
        { waitUntil: 'domcontentloaded' },
      );
      const shell = page.locator('#app');
      await waitForReady(page);
      await expect(shell).toHaveAttribute('data-render-mode', mode);
      await expect.poll(
        () => readNumericAttribute(shell, 'data-frame-count'),
      ).toBeGreaterThan(0);
      await page.evaluate(() => new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }));
      captures.push(await page.getByTestId('primary-material').screenshot({
        animations: 'disabled',
      }));
    }

    const [uniform, dedicated] = captures;
    if (!uniform || !dedicated) {
      throw new Error(`Missing ${framework} presentation parity capture.`);
    }
    const difference = await comparePngPixels(page, uniform, dedicated);
    expect(difference.changedPixelRatio).toBeLessThanOrEqual(0.005);
  }
});

test('proves dedicated, nested, proxy, and theme presentation behavior', async ({
  page,
}) => {
  for (const framework of FRAMEWORKS) {
    const route = (scene: typeof COMPOSITION_SCENES[number]): string => (
      `/?test=1&framework=${framework}&scene=${scene}`
    );

    await page.goto(route('S008'), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    await expect(page.locator('.liquid-glass-dedicated-canvas')).toHaveCount(2);
    for (const canvas of await page.locator(
      '.liquid-glass-dedicated-canvas',
    ).all()) {
      expect((await readCanvasMetrics(canvas)).nonTransparentPixels)
        .toBeGreaterThan(1_000);
    }

    await page.goto(route('S009'), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    await expect(page.getByTestId('nested-child-context')).toBeVisible();
    await expect(page.locator('.liquid-glass-container')).toHaveCount(2);
    const nestedCanvas = page.locator(
      '.nested-child-context > .liquid-glass-content > .liquid-glass-canvas',
    );
    expect((await readCanvasMetrics(nestedCanvas)).nonTransparentPixels)
      .toBeGreaterThan(1_000);

    await page.goto(route('S010'), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    await expect(page.getByTestId('proxy-source-context')).toBeVisible();
    const sourceCanvas = page.locator(
      '.proxy-source-context > .liquid-glass-content > .liquid-glass-canvas',
    );
    await expect.poll(async () => (
      await readCanvasMetrics(sourceCanvas)
    ).nonTransparentPixels).toBe(0);
    expect((await readCanvasMetrics(page.locator(
      '.composition-context > .liquid-glass-content > .liquid-glass-canvas',
    ))).nonTransparentPixels).toBeGreaterThan(1_000);

    await page.goto(route('S011'), { waitUntil: 'domcontentloaded' });
    await waitForReady(page);
    const expectedTints = [
      '#00000022',
      '#00000066',
      '#ffffff99',
      '#ffffff33',
    ];
    for (const [index, tint] of expectedTints.entries()) {
      await expect(page.locator(`.theme-material-${String(index + 1)}`))
        .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect.poll(() => page.locator(
        `.theme-material-${String(index + 1)}`,
      ).evaluate((element) => (
        getComputedStyle(element).getPropertyValue('--lg-background-tint').trim()
      ))).toBe(tint);
    }
  }
});

test('loses and restores the internal WebGL context through diagnostics', async ({
  page,
}) => {
  await page.goto('/?test=1&framework=vue&scene=S012', {
    waitUntil: 'domcontentloaded',
  });
  const shell = page.locator('#app');
  await waitForReady(page);
  await expect(shell).toHaveAttribute('data-renderer-state', 'ready');
  await expect(shell).toHaveAttribute('data-context-loss-count', '0');

  await page.locator('[data-action="lose-context"]').click();
  await expect(shell).toHaveAttribute('data-context-action-status', 'requested');
  await expect(shell).toHaveAttribute('data-renderer-state', 'context-lost');
  await expect(shell).toHaveAttribute('data-context-loss-count', '1');
  await expect(shell).toHaveAttribute('data-fallback', 'on');

  await page.locator('[data-action="restore-context"]').click();
  await expect(shell).toHaveAttribute('data-context-action-status', 'requested');
  await expect(shell).toHaveAttribute('data-renderer-state', 'ready');
  await expect(shell).toHaveAttribute('data-context-restore-count', '1');
  await expect(shell).toHaveAttribute('data-fallback', 'off');
  await expect(shell).toHaveAttribute('data-gl-error', 'NO_ERROR');
});

test('releases every resource through 20 framework switches and remounts', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto('/?test=1&framework=vue&scene=S012', {
    waitUntil: 'domcontentloaded',
  });
  const shell = page.locator('#app');
  await waitForReady(page);

  const switchSequence = ['react', 'solid', 'vue'] as const;
  for (let index = 0; index < 20; index += 1) {
    const framework = switchSequence[index % switchSequence.length];
    await page.getByRole('button', {
      exact: true,
      name: frameworkLabel(framework),
    }).click();
    await expect(shell).toHaveAttribute('data-framework', framework);
    await waitForReady(page);
    await expectCleanRetirement(shell, 1);
  }

  for (let index = 1; index <= 20; index += 1) {
    await page.locator('[data-action="remount-context"]').click();
    await expect(shell).toHaveAttribute('data-remount-count', String(index));
    await waitForReady(page);
    await expectCleanRetirement(shell, 1);
  }

  await expect(shell).toHaveAttribute('data-active-contexts', '1');
  expect(await readNumericAttribute(shell, 'data-live-resources'))
    .toBeGreaterThan(0);
  expect(runtimeErrors).toEqual([]);
});

test('returns every tracked resource to zero through the test teardown hook', async ({
  page,
}) => {
  await page.goto('/?test=1&framework=vue&scene=S009', {
    waitUntil: 'domcontentloaded',
  });
  const shell = page.locator('#app');
  await waitForReady(page);
  await expect(shell).toHaveAttribute('data-active-contexts', '2');

  await page.evaluate(() => {
    window.dispatchEvent(new Event('liquid-glass-playground-test-teardown'));
  });

  await expect(shell).toHaveAttribute('data-active-contexts', '0');
  await expect(shell).toHaveAttribute('data-live-resources', '0');
  await expect(shell).toHaveAttribute('data-retired-resources', '0');
  await expect(shell).toHaveAttribute('data-retired-contexts', '2');
  await expect(shell).toHaveAttribute('data-retired-destroyed-contexts', '2');
});

test('keeps nested and delegated scenes live across resize, removal, and remount', async ({
  page,
}) => {
  for (const [index, framework] of FRAMEWORKS.entries()) {
    await page.goto(
      `/?test=1&framework=${framework}&scene=S009`,
      { waitUntil: 'domcontentloaded' },
    );
    await waitForReady(page);
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    const nestedCanvas = page.locator(
      '.nested-child-context > .liquid-glass-content > .liquid-glass-canvas',
    );
    await expect.poll(async () => (
      await readCanvasMetrics(nestedCanvas)
    ).nonTransparentPixels).toBeGreaterThan(1_000);

    await page.getByTestId('scene-select').selectOption('S010');
    const shell = page.locator('#app');
    await expect(shell).toHaveAttribute('data-scene', 'S010');
    await waitForReady(page);
    await expect(page.getByTestId('nested-child-context')).toHaveCount(0);
    await expect(page.getByTestId('proxy-source-context')).toBeVisible();
    const frameCount = await readNumericAttribute(shell, 'data-frame-count');
    await page.locator('[data-material-id="proxy"]').evaluate((element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error('Proxy material is not an HTML element.');
      }
      element.style.left = '31%';
      window.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(
      () => readNumericAttribute(shell, 'data-frame-count'),
    ).toBeGreaterThan(frameCount);

    const nextFramework = FRAMEWORKS[(index + 1) % FRAMEWORKS.length];
    if (!nextFramework) throw new Error('Missing framework remount target.');
    await page.getByRole('button', {
      exact: true,
      name: frameworkLabel(nextFramework),
    }).click();
    await expect(shell).toHaveAttribute('data-framework', nextFramework);
    await waitForReady(page);
    await expect(page.getByTestId('proxy-source-context')).toBeVisible();
    await expectCleanRetirement(shell, 2);
  }
});

function materialCount(scene: typeof COMPOSITION_SCENES[number]): number {
  if (scene === 'S008' || scene === 'S009') return 2;
  if (scene === 'S011') return 4;
  return 1;
}

async function waitForReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
}

function collectRuntimeErrors(page: Page): string[] {
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

function frameworkLabel(framework: typeof FRAMEWORKS[number]): string {
  if (framework === 'vue') return 'Vue';
  if (framework === 'react') return 'React';
  return 'Solid';
}

async function expectCleanRetirement(
  shell: Locator,
  expectedContextCount?: number,
): Promise<void> {
  await expect(shell).toHaveAttribute('data-retired-resources', '0');
  const retired = await readNumericAttribute(shell, 'data-retired-contexts');
  const destroyed = await readNumericAttribute(
    shell,
    'data-retired-destroyed-contexts',
  );
  expect(retired).toBeGreaterThan(0);
  expect(destroyed).toBe(retired);
  if (expectedContextCount !== undefined) {
    expect(retired).toBe(expectedContextCount);
  }
}
