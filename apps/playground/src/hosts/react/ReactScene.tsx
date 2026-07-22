/** @jsxImportSource react */
import type { GlassContextOptions } from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-react';

import { getBackdropDraw, resolveSceneMaterials } from '../../shared/scenes';
import type { FrameworkHostProps } from '../../shared/types';

/** Render the canonical scene through the React public adapter. */
export function ReactScene({
  callbacks,
  state,
}: FrameworkHostProps): React.JSX.Element {
  const contextOptions: GlassContextOptions = {
    canvasZIndex: state.oracleMode ? 10 : undefined,
    renderMode: state.renderMode,
    renderPrecision: state.renderPrecision,
    scrollable: state.scrollable,
  };
  const materials = resolveSceneMaterials(state);

  return (
    <LiquidGlass
      className={[
        'glass-context',
        state.testMode ? 'is-test-mode' : '',
        state.oracleMode ? 'is-oracle-mode' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-framework="react"
      data-glass-enabled={String(state.glassEnabled)}
      data-scene={state.scene}
      options={contextOptions}
      onError={callbacks.onError}
      onReady={callbacks.onContextReady}
    >
      <BackdropCanvas
        className="scene-backdrop"
        draw={getBackdropDraw(state.scene, state.oracleMode)}
      />
      {materials.map((material, index) => (
        <LiquidGlassMaterial
          {...material.options}
          key={material.id}
          className={material.className}
          data-material-id={material.id}
          data-testid={index === 0 ? 'primary-material' : undefined}
        >
          <div className="material-copy">
            {state.oracleMode ? (
              <>
                <strong>{material.name}</strong>
                {material.detail ? <span>{material.detail}</span> : null}
              </>
            ) : (
              <>
                <span>{material.label}</span>
                <strong>{material.name}</strong>
                <small>
                  {material.options.thickness} px ·{' '}
                  {material.options.refractIndex?.toFixed(2)} IOR
                </small>
              </>
            )}
          </div>
        </LiquidGlassMaterial>
      ))}
    </LiquidGlass>
  );
}
