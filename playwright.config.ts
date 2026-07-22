import { defineConfig, devices } from '@playwright/test';

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const localBaseURL = 'http://127.0.0.1:4173';

/** Browser smoke-test configuration for the current playground surface. */
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseURL ?? localBaseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command:
          'pnpm --filter @agou/liquid-glass-playground dev --host 127.0.0.1 --port 4173 --strictPort',
        reuseExistingServer: !process.env.CI,
        url: localBaseURL,
      },
});
