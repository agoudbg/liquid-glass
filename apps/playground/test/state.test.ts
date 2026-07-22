import { describe, expect, it } from 'vitest';

import { createInitialState } from '../src/shell/state';

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
});
