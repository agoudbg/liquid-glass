import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateBrowserMetadataAgainstCaptureContract,
} from './legacy-capture-evidence.mjs';

function createFixture() {
  const webGlFingerprint = {
    renderer: 'WebKit WebGL',
    shadingLanguageVersion: 'WebGL GLSL ES 3.00',
    unmaskedRenderer: 'ANGLE SwiftShader',
    unmaskedVendor: 'Google Inc.',
    vendor: 'WebKit',
    version: 'WebGL 2.0',
  };
  return {
    contract: {
      browser: {
        browserName: 'Google Chrome',
        browserVersion: '150.0.0.0',
        effectiveArguments: [
          '--enable-automation',
          '--force-color-profile=srgb',
        ],
        protocol: {
          jsVersion: '14.0.0',
          product: 'Chrome/150.0.0.0',
          protocolVersion: '1.3',
          revision: '@fixture',
        },
        webGlFingerprint,
      },
      context: {
        colorScheme: 'light',
        devicePixelRatios: [1, 2],
        locale: 'en-US',
        reducedMotion: 'reduce',
        timezoneId: 'UTC',
        viewport: { height: 900, width: 1440 },
      },
    },
    metadata: {
      browserName: 'Google Chrome',
      browserVersion: '150.0.0.0',
      browserProtocol: {
        jsVersion: '14.0.0',
        product: 'Chrome/150.0.0.0',
        protocolVersion: '1.3',
        revision: '@fixture',
      },
      colorScheme: 'light',
      devicePixelRatio: 1,
      effectiveBrowserArguments: [
        '--enable-automation',
        '--force-color-profile=srgb',
      ],
      locale: 'en-US',
      reducedMotion: 'reduce',
      timezoneId: 'UTC',
      viewport: { height: 900, width: 1440 },
      webGlFingerprint,
    },
  };
}

test('accepts metadata bound to the complete browser contract', () => {
  const fixture = createFixture();
  assert.doesNotThrow(() => validateBrowserMetadataAgainstCaptureContract(
    fixture.metadata,
    1,
    fixture.contract,
    'fixture',
  ));
});

test('rejects browser, WebGL, viewport, and DPR drift', () => {
  const cases = [
    {
      label: 'browser',
      mutate: (metadata) => {
        metadata.browserVersion = '151.0.0.0';
      },
    },
    {
      label: 'WebGL',
      mutate: (metadata) => {
        metadata.webGlFingerprint = {
          ...metadata.webGlFingerprint,
          unmaskedRenderer: 'Hardware GPU',
        };
      },
    },
    {
      label: 'viewport',
      mutate: (metadata) => {
        metadata.viewport = { height: 901, width: 1440 };
      },
    },
    {
      label: 'DPR',
      mutate: (metadata) => {
        metadata.devicePixelRatio = 3;
      },
    },
  ];
  for (const { label, mutate } of cases) {
    const fixture = createFixture();
    mutate(fixture.metadata);
    assert.throws(
      () => validateBrowserMetadataAgainstCaptureContract(
        fixture.metadata,
        1,
        fixture.contract,
        'fixture',
      ),
      new RegExp(label, 'u'),
    );
  }
});

test('rejects browser launch, protocol, and context drift', () => {
  const cases = [
    {
      label: 'launch',
      mutate: (metadata) => {
        metadata.effectiveBrowserArguments = ['--enable-automation'];
      },
    },
    {
      label: 'identity',
      mutate: (metadata) => {
        metadata.browserProtocol = {
          ...metadata.browserProtocol,
          revision: '@drift',
        };
      },
    },
    ...[
      ['colorScheme', 'dark'],
      ['locale', 'fr-FR'],
      ['reducedMotion', 'no-preference'],
      ['timezoneId', 'Asia/Shanghai'],
    ].map(([field, value]) => ({
      label: field,
      mutate: (metadata) => {
        metadata[field] = value;
      },
    })),
  ];
  for (const { label, mutate } of cases) {
    const fixture = createFixture();
    mutate(fixture.metadata);
    assert.throws(
      () => validateBrowserMetadataAgainstCaptureContract(
        fixture.metadata,
        1,
        fixture.contract,
        'fixture',
      ),
      new RegExp(label, 'u'),
    );
  }
});
