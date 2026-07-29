import { describe, expect, it } from 'vitest';

import { buildExternalMaterialConfig } from '../../src/engine/material-delegation-config';
import { InteractionEngine } from '../../src/interaction';
import type { MaterialPresentationState } from '../../src/types';
import {
  createRuntimeHarness,
  FakeElement,
} from '../fixtures/glass-context-rendering';

function presentation(): MaterialPresentationState {
  const engine = new InteractionEngine('button');
  const output = {
    ...engine.getOutput(),
    scaleX: 1.2,
    scaleY: 1.1,
    translateX: -5,
    translateY: 7,
  };
  const interactionConfig = engine.getConfig();
  engine.destroy();
  return {
    blurred: false,
    fallbackMode: false,
    interactionConfig,
    interactionOutput: output,
    themeColorMode: 'light',
  };
}

describe('buildExternalMaterialConfig', () => {
  it('shares local optical defaults while preserving viewport transform data', () => {
    const harness = createRuntimeHarness();
    const element = new FakeElement({
      x: 50,
      y: 60,
      width: 100,
      height: 40,
    });
    element.setClientRect({ x: 40, y: 55, width: 120, height: 44 });

    const config = buildExternalMaterialConfig(
      {
        element: element as unknown as HTMLElement,
        radiusTL: 8,
        radiusTR: 10,
        radiusBR: 12,
        radiusBL: 14,
        refractIntensity: 0,
      },
      presentation(),
      harness.runtime,
    );

    expect(config).toEqual({
      clientRect: { x: 40, y: 55, width: 120, height: 44 },
      borderRadius: {
        topLeft: 8,
        topRight: 10,
        bottomRight: 12,
        bottomLeft: 14,
      },
      blur: 0,
      thickness: 10,
      refractIndex: 1.1,
      refractIntensity: 0,
      dispersion: 0.01,
      transform: {
        scaleX: 1.2,
        scaleY: 1.1,
        translateX: -5,
        translateY: 7,
      },
    });
  });
});
