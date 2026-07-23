import { describe, expect, it } from 'vitest';

import {
  createInitialState,
  replacePlaygroundUrl,
} from '../src/shell/state';

describe('playground URL state', () => {
  it('defaults S007 to forced fallback while preserving explicit overrides', () => {
    expect(createInitialState(new URL('https://example.test/?scene=S007')))
      .toMatchObject({ scene: 'S007', fallbackEnabled: true });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S007&fallback=off',
    ))).toMatchObject({ scene: 'S007', fallbackEnabled: false });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S001&fallback=on',
    ))).toMatchObject({ scene: 'S001', fallbackEnabled: true });
  });

  it('parses reproducible DOM capture state without enabling legacy oracle mode', () => {
    expect(createInitialState(new URL(
      'https://example.test/?scene=S003&content=mutated&oracle=1',
    ))).toMatchObject({
      domVariant: 'mutated',
      oracleMode: false,
      scene: 'S003',
    });
  });

  it('enables legacy oracle mode only for scenes with durable fixtures', () => {
    expect(createInitialState(new URL(
      'https://example.test/?scene=S004&oracle=1',
    ))).toMatchObject({
      oracleMode: true,
      radius: 40,
      refractIndex: 1.1,
      refractIntensity: 0.5,
      scene: 'S004',
      thickness: 10,
    });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S004',
    ))).toMatchObject({
      oracleMode: false,
      radius: 28,
      refractIndex: 1.1,
      refractIntensity: 0.5,
      scene: 'S004',
      thickness: 30,
    });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S005&oracle=1',
    ))).toMatchObject({ oracleMode: false, scene: 'S005' });
  });

  it('removes inactive test-only flags when serializing state', () => {
    window.history.replaceState(null, '', '/?scene=S005&oracle=1&test=1');
    const state = createInitialState(new URL(window.location.href));

    replacePlaygroundUrl({ ...state, oracleMode: false, testMode: false });

    const serializedUrl = new URL(window.location.href);
    expect(serializedUrl.searchParams.has('oracle')).toBe(false);
    expect(serializedUrl.searchParams.has('test')).toBe(false);
  });

  it('defaults S006 to bounded internal scrolling while preserving overrides', () => {
    expect(createInitialState(new URL('https://example.test/?scene=S006')))
      .toMatchObject({
        scene: 'S006',
        scrollable: true,
        viewportEnabled: true,
      });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S006&scroll=off&viewport=off',
    ))).toMatchObject({
      scene: 'S006',
      scrollable: false,
      viewportEnabled: false,
    });
    expect(createInitialState(new URL('https://example.test/?scene=S005')))
      .toMatchObject({
        scene: 'S005',
        scrollable: false,
        viewportEnabled: false,
      });
    expect(createInitialState(new URL(
      'https://example.test/?scene=S005&scroll=on&viewport=on',
    ))).toMatchObject({
      scene: 'S005',
      scrollable: false,
      viewportEnabled: false,
    });
  });
});
