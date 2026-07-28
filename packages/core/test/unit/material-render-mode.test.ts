import { describe, expect, it } from 'vitest';

import {
  resolveEffectiveMaterialRenderMode,
} from '../../src/engine/material-render-mode';
import type { RenderMode } from '../../src/types/context';

describe('resolveEffectiveMaterialRenderMode', () => {
  it.each([
    [undefined, 'uniform', 'uniform'],
    [undefined, 'dedicated', 'dedicated'],
    ['uniform', 'dedicated', 'uniform'],
    ['dedicated', 'uniform', 'dedicated'],
  ] satisfies [RenderMode | undefined, RenderMode, RenderMode][])(
    'resolves material %s over context %s as %s',
    (materialRenderMode, contextRenderMode, expected) => {
      expect(resolveEffectiveMaterialRenderMode(
        materialRenderMode,
        contextRenderMode,
      )).toBe(expected);
    },
  );
});
