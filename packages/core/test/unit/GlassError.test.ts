import { describe, expect, it } from 'vitest';

import { GlassError } from '../../src/errors/GlassError';

describe('GlassError', () => {
  it('retains resource context and the original thrown value', () => {
    const cause = { response: 'context lost' };
    const error = new GlassError('RENDER_FAILED', 'Unable to render material.', {
      phase: 'render',
      cause,
      materialId: 'material-1',
      details: { frame: 42 },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GlassError);
    expect(error.code).toBe('RENDER_FAILED');
    expect(error.cause).toBe(cause);
    expect(error.toContext()).toEqual({
      code: 'RENDER_FAILED',
      phase: 'render',
      message: 'Unable to render material.',
      error: cause,
      materialId: 'material-1',
      backdropId: undefined,
      details: { frame: 42 },
    });
  });

  it('does not double-wrap an existing contextual error', () => {
    const original = new GlassError('CAPTURE_FAILED', 'Capture failed.', {
      phase: 'capture',
    });

    expect(GlassError.fromUnknown(
      original,
      'LIFECYCLE_FAILED',
      'Unexpected failure.',
      { phase: 'lifecycle' },
    )).toBe(original);
  });

  it('wraps arbitrary thrown values without discarding them', () => {
    const thrownValue = 'shader compiler rejected source';
    const error = GlassError.fromUnknown(
      thrownValue,
      'SHADER_COMPILE_FAILED',
      'Shader compilation failed.',
      { phase: 'shader', details: { stage: 'fragment' } },
    );

    expect(error.cause).toBe(thrownValue);
    expect(error.toContext().error).toBe(thrownValue);
  });

  it.each([null, undefined])('retains a nullish thrown value: %s', (thrownValue) => {
    const error = GlassError.fromUnknown(
      thrownValue,
      'LIFECYCLE_FAILED',
      'Lifecycle callback failed.',
      { phase: 'lifecycle' },
    );

    expect(error.toContext().error).toBe(thrownValue);
  });

  it('uses itself as event context when no cause was supplied', () => {
    const error = new GlassError('INVALID_CONFIG', 'Invalid configuration.', {
      phase: 'configuration',
    });

    expect(error.toContext().error).toBe(error);
  });
});
