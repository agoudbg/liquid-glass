/** @jsxImportSource react */
import type { GlassContextOptions } from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  BackdropConverter,
  type BackdropConverterHandle,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-react';
import { useEffect, useRef } from 'react';

import {
  getBackdropDraw,
  resolveDomCaptureContent,
  resolveSceneMaterials,
} from '../../shared/scenes';
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
  const converterRef = useRef<BackdropConverterHandle>(null);
  const domContent = resolveDomCaptureContent(state.domVariant);

  useEffect(() => {
    if (state.scene !== 'S003') {
      callbacks.onBackdropRefreshReady(null);
      return undefined;
    }
    callbacks.onBackdropRefreshReady(() => converterRef.current?.refresh());
    return () => callbacks.onBackdropRefreshReady(null);
  }, [callbacks, state.scene]);

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
      {state.scene === 'S003' ? (
        <BackdropConverter
          ref={converterRef}
          backgroundColor="#dce4df"
          className="scene-backdrop dom-capture-backdrop"
        >
          <div className="dom-capture-photo">
            <img
              alt="Boats crossing a turquoise alpine lake below the Dolomites"
              data-testid="dom-capture-image"
              draggable={false}
              src="/dolomites.jpg"
            />
            <span>IMG / LOCAL ASSET</span>
          </div>
          <article
            key={state.domVariant}
            className={`dom-capture-copy ${domContent.phaseClass}`}
            data-dom-phase={state.domVariant}
            data-testid="dom-capture-copy"
          >
            <p>{domContent.eyebrow}</p>
            <h3>{domContent.title}</h3>
            <span>{domContent.description}</span>
            <div className="dom-capture-swatches" aria-hidden="true">
              <i /><i /><i />
            </div>
            <small>Pietro De Grandi / Unsplash</small>
          </article>
        </BackdropConverter>
      ) : (
        <BackdropCanvas
          className="scene-backdrop"
          draw={getBackdropDraw(state.scene, state.oracleMode)}
        />
      )}
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
