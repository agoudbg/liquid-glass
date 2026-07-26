import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import {
  resolveLegacyVisualChromeExecutable,
} from './tests/browser/support/legacy-visual-environment';

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const localBaseURL = 'http://127.0.0.1:4173';
const playgroundRoot = realpathSync.native(
  fileURLToPath(new URL('./apps/playground/', import.meta.url)),
);
const visualParityTest = /(?:^|[/\\])legacy-visual-parity\.spec\.ts$/u;
const visualPreflightTest =
  /(?:^|[/\\])legacy-visual-(?:browser-capture|metadata|provenance|raw-artifacts|support)\.spec\.ts$/u;
const visualChromeArguments = [
  '--disable-blink-features=AutomationControlled',
  '--enable-automation',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--force-color-profile=srgb',
];
const visualChromeExecutablePath = process.platform === 'win32'
  ? resolveLegacyVisualChromeExecutable()
  : undefined;

/** Browser smoke-test configuration for the current playground surface. */
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  preserveOutput: process.env.CI ? 'failures-only' : 'always',
  use: {
    baseURL: externalBaseURL ?? localBaseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome',
      testIgnore: [visualParityTest, visualPreflightTest],
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'visual-preflight',
      retries: 0,
      testMatch: visualPreflightTest,
    },
    {
      name: 'visual-dpr-1',
      dependencies: ['visual-preflight'],
      retries: 0,
      testMatch: visualParityTest,
      use: {
        baseURL: localBaseURL,
        colorScheme: 'light',
        deviceScaleFactor: 1,
        headless: true,
        launchOptions: {
          args: visualChromeArguments,
          chromiumSandbox: true,
          executablePath: visualChromeExecutablePath,
        },
        locale: 'en-US',
        reducedMotion: 'reduce',
        timezoneId: 'UTC',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'visual-dpr-2',
      dependencies: ['visual-preflight'],
      retries: 0,
      testMatch: visualParityTest,
      use: {
        baseURL: localBaseURL,
        colorScheme: 'light',
        deviceScaleFactor: 2,
        headless: true,
        launchOptions: {
          args: visualChromeArguments,
          chromiumSandbox: true,
          executablePath: visualChromeExecutablePath,
        },
        locale: 'en-US',
        reducedMotion: 'reduce',
        timezoneId: 'UTC',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort',
        cwd: playgroundRoot,
        reuseExistingServer: false,
        url: localBaseURL,
      },
});
