import { describe, expect, it } from 'vitest';

describe('SSR-safe primitive imports', () => {
  it('does not access browser globals at module evaluation time', async () => {
    const [errors, events, types, utils] = await Promise.all([
      import('../../src/errors/index'),
      import('../../src/events/index'),
      import('../../src/types/index'),
      import('../../src/utils/index'),
    ]);

    expect(errors.GlassError).toBeTypeOf('function');
    expect(events.TypedEventEmitter).toBeTypeOf('function');
    expect(Object.keys(types)).toEqual([]);
    expect(utils.generateUUID).toBeTypeOf('function');
  });

  it('imports the public entry point without browser globals', async () => {
    await expect(import('../../src/index.js')).resolves.toMatchObject({
      CORE_VERSION: '0.1.0',
    });
  });
});
