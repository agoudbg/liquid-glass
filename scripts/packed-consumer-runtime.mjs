import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

async function reserveLoopbackPort() {
  const server = createServer();
  server.unref();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'Could not reserve a preview port.');
  await new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => {
      if (error) rejectPromise(error);
      else resolvePromise();
    });
  });
  return address.port;
}

async function waitForPreview(url, child, readOutput) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packed consumer preview exited early.\n${readOutput()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview is expected to refuse connections while Vite starts.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Packed consumer preview did not start at ${url}.\n${readOutput()}`);
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolvePromise) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.off('exit', handleExit);
      resolvePromise(exited);
    };
    const handleExit = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('exit', handleExit);
  });
}

async function startPreview(consumerDirectory) {
  const port = await reserveLoopbackPort();
  const url = `http://127.0.0.1:${String(port)}`;
  const viteEntry = join(consumerDirectory, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [viteEntry, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: consumerDirectory,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => output.push(chunk));
  const readOutput = () => Buffer.concat(output).toString('utf8').trim();
  await waitForPreview(url, child, readOutput);
  return {
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      if (!(await waitForChildExit(child, 2_000))) {
        child.kill('SIGKILL');
        await waitForChildExit(child, 2_000);
      }
    },
    url,
  };
}

function runNodeProbe(args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`Node SSR probe exited with code ${String(code)}.`));
    });
  });
}

/** Launch the isolated Chrome shared by all packed consumer probes. */
export function launchPackedConsumerBrowser() {
  return chromium.launch({
    channel: 'chrome',
    headless: true,
  });
}

/** Prove a packed adapter can be imported without browser globals. */
export async function verifyPackedConsumerSsrImport(consumerDirectory, consumer) {
  const probe = `
    const adapter = await import(${JSON.stringify(consumer.adapter)});
    if (adapter.CORE_VERSION !== '0.1.0') {
      throw new Error('Packed adapter did not expose the expected core version.');
    }
  `;
  await runNodeProbe(
    ['--input-type=module', '--eval', probe],
    consumerDirectory,
  );
  console.log(`Verified packed ${consumer.fixture} SSR import.`);
}

/** Prove a packed adapter mounts visible, non-empty glass in Chrome. */
export async function verifyPackedConsumerBrowserRuntime(
  browser,
  consumerDirectory,
  consumer,
) {
  const preview = await startPreview(consumerDirectory);
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
  page.setDefaultNavigationTimeout(15_000);
  page.setDefaultTimeout(15_000);
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));

  try {
    await page.goto(preview.url, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: consumer.heading }).waitFor();
    await page.locator('.liquid-glass-material').waitFor();
    await page.locator('.liquid-glass-canvas').waitFor();
    const evidence = await page.locator('.liquid-glass-canvas').evaluate(
      (element) => {
        if (!(element instanceof globalThis.HTMLCanvasElement)) {
          throw new Error('Packed consumer did not create a presentation canvas.');
        }
        const context = element.getContext('2d');
        if (!context) throw new Error('Packed consumer presentation is not a 2D canvas.');
        const pixels = context.getImageData(0, 0, element.width, element.height).data;
        let nonTransparentPixels = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] !== 0) nonTransparentPixels += 1;
        }
        return {
          height: element.height,
          nonTransparentPixels,
          width: element.width,
        };
      },
    );
    assert(evidence.width > 0 && evidence.height > 0, 'Packed canvas has no size.');
    assert(
      evidence.nonTransparentPixels > 1_000,
      `Packed ${consumer.fixture} canvas is visually empty.`,
    );
    assert.deepEqual(browserErrors, [], `Packed ${consumer.fixture} emitted browser errors.`);
  } catch (error) {
    const details = browserErrors.length > 0
      ? `\nBrowser errors:\n${browserErrors.join('\n')}`
      : '';
    throw new Error(
      `Packed ${consumer.fixture} browser runtime failed.${details}`,
      { cause: error },
    );
  } finally {
    await Promise.allSettled([
      Promise.race([
        page.close(),
        new Promise((resolvePromise) => setTimeout(resolvePromise, 2_000)),
      ]),
      preview.close(),
    ]);
  }
  console.log(`Verified packed ${consumer.fixture} browser runtime.`);
}
