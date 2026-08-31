import { describe, expect, it } from 'vitest';

import packageJson from '../../package.json';

const COLD_IMPORT_TIMEOUT_MS = 15_000;

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
  }, COLD_IMPORT_TIMEOUT_MS);

  it('imports the public entry point without browser globals', async () => {
    await expect(import('../../src/index.js')).resolves.toMatchObject({
      CORE_VERSION: packageJson.version,
    });
  }, COLD_IMPORT_TIMEOUT_MS);

  it('imports renderer and engine modules without creating browser objects', async () => {
    const [renderer, engine] = await Promise.all([
      import('../../src/renderer/index'),
      import('../../src/engine/index'),
    ]);

    expect(renderer.WebGLRenderer).toBeTypeOf('function');
    expect(engine.GlassEngine).toBeTypeOf('function');
  }, COLD_IMPORT_TIMEOUT_MS);
});
