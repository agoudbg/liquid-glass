import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  REQUIRED_BROWSER_ARGUMENTS,
  validateLegacyCaptureConfigs,
} from './legacy-capture-config.mjs';

function createConfig(deviceScaleFactor) {
  return {
    browser: {
      browserName: 'chromium',
      isolated: true,
      launchOptions: {
        args: [...REQUIRED_BROWSER_ARGUMENTS],
        channel: 'chrome',
        headless: true,
      },
      contextOptions: {
        colorScheme: 'light',
        deviceScaleFactor,
        locale: 'en-US',
        reducedMotion: 'reduce',
        timezoneId: 'UTC',
        viewport: {
          width: 1440,
          height: 900,
        },
      },
    },
  };
}

function createConfigs() {
  return [createConfig(1), createConfig(2)];
}

function readRepositoryConfigs() {
  return [1, 2].map((devicePixelRatio) => JSON.parse(readFileSync(
    new URL(
      `../../tests/legacy-oracle/config/dpr-${devicePixelRatio}.json`,
      import.meta.url,
    ),
    'utf8',
  )));
}

function assertRejectsDrift(mutator, expectedMessage) {
  const configs = createConfigs();
  mutator(configs);
  assert.throws(
    () => validateLegacyCaptureConfigs(configs),
    expectedMessage,
  );
}

test('accepts only the frozen legacy capture configuration', () => {
  assert.deepEqual(validateLegacyCaptureConfigs(readRepositoryConfigs()), {
    browserArguments: [...REQUIRED_BROWSER_ARGUMENTS],
    context: {
      colorScheme: 'light',
      devicePixelRatios: [1, 2],
      locale: 'en-US',
      reducedMotion: 'reduce',
      timezoneId: 'UTC',
      viewport: {
        width: 1440,
        height: 900,
      },
    },
  });
});

test('rejects a missing or additional DPR configuration', async (t) => {
  await t.test('missing', () => {
    assert.throws(
      () => validateLegacyCaptureConfigs([createConfig(1)]),
      /exactly DPR 1 and DPR 2/u,
    );
  });
  await t.test('additional', () => {
    assert.throws(
      () => validateLegacyCaptureConfigs([
        createConfig(1),
        createConfig(2),
        createConfig(3),
      ]),
      /exactly DPR 1 and DPR 2/u,
    );
  });
});

test('rejects browser name drift', () => {
  assertRejectsDrift(
    (configs) => {
      configs[0].browser.browserName = 'chrome';
    },
    /browserName must be "chromium"/u,
  );
});

test('rejects browser isolation drift', () => {
  assertRejectsDrift(
    (configs) => {
      configs[0].browser.isolated = false;
    },
    /isolated must be true/u,
  );
});

test('rejects browser channel drift', () => {
  assertRejectsDrift(
    (configs) => {
      configs[0].browser.launchOptions.channel = 'chromium';
    },
    /channel must be "chrome"/u,
  );
});

test('rejects headless mode drift', () => {
  assertRejectsDrift(
    (configs) => {
      configs[0].browser.launchOptions.headless = false;
    },
    /headless must be true/u,
  );
});

test('rejects missing, reordered, or additional browser arguments', async (t) => {
  const argumentDrifts = {
    additional: [...REQUIRED_BROWSER_ARGUMENTS, '--disable-gpu'],
    missing: REQUIRED_BROWSER_ARGUMENTS.slice(0, -1),
    reordered: REQUIRED_BROWSER_ARGUMENTS.toReversed(),
  };
  for (const [name, args] of Object.entries(argumentDrifts)) {
    await t.test(name, () => {
      assertRejectsDrift(
        (configs) => {
          configs[0].browser.launchOptions.args = args;
        },
        /launchOptions\.args must be/u,
      );
    });
  }
});

test('rejects viewport drift', async (t) => {
  await t.test('width', () => {
    assertRejectsDrift(
      (configs) => {
        configs[0].browser.contextOptions.viewport.width = 1366;
      },
      /viewport\.width must be 1440/u,
    );
  });
  await t.test('height', () => {
    assertRejectsDrift(
      (configs) => {
        configs[0].browser.contextOptions.viewport.height = 768;
      },
      /viewport\.height must be 900/u,
    );
  });
});

test('rejects color scheme drift', () => {
  assertRejectsDrift(
    (configs) => {
      configs[0].browser.contextOptions.colorScheme = 'dark';
    },
    /colorScheme must be "light"/u,
  );
});

test('rejects locale drift', () => {
  assertRejectsDrift(
    (configs) => {
      configs[0].browser.contextOptions.locale = 'zh-CN';
    },
    /locale must be "en-US"/u,
  );
});

test('rejects reduced motion drift', () => {
  assertRejectsDrift(
    (configs) => {
      configs[0].browser.contextOptions.reducedMotion = 'no-preference';
    },
    /reducedMotion must be "reduce"/u,
  );
});

test('rejects timezone drift', () => {
  assertRejectsDrift(
    (configs) => {
      configs[0].browser.contextOptions.timezoneId = 'Asia/Shanghai';
    },
    /timezoneId must be "UTC"/u,
  );
});

test('rejects any DPR drift', async (t) => {
  await t.test('DPR 1', () => {
    assertRejectsDrift(
      (configs) => {
        configs[0].browser.contextOptions.deviceScaleFactor = 2;
      },
      /DPR 1.*deviceScaleFactor must be 1/u,
    );
  });
  await t.test('DPR 2', () => {
    assertRejectsDrift(
      (configs) => {
        configs[1].browser.contextOptions.deviceScaleFactor = 1;
      },
      /DPR 2.*deviceScaleFactor must be 2/u,
    );
  });
});
