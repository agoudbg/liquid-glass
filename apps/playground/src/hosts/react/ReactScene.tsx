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
  isDomCaptureState,
  isEditorialDomCaptureState,
  resolveBackdropBackgroundColor,
  resolveDomCaptureContent,
  resolveViewportCapture,
  SCROLL_BANDS,
} from '../../shared/scene-backdrops';
import { resolveSceneMaterials } from '../../shared/scene-materials';
import { resolveSceneRenderPrecision } from '../../shared/scene-render-options';
import type { FrameworkHostProps } from '../../shared/types';
import { InteractionFixtureControl } from './InteractionFixtureControl';

/** Render the canonical scene through the React public adapter. */
export function ReactScene({
  callbacks,
  state,
}: FrameworkHostProps): React.JSX.Element {
  const contextOptions: GlassContextOptions = {
    canvasZIndex: state.oracleMode ? 10 : undefined,
    renderMode: state.renderMode,
    renderPrecision: resolveSceneRenderPrecision(state),
    scrollable: state.scrollable,
  };
  const materials = resolveSceneMaterials(state);
  const converterRef = useRef<BackdropConverterHandle>(null);
  const domContent = resolveDomCaptureContent(state.domVariant);
  const domScene = isDomCaptureState(state);
  const editorialDomScene = isEditorialDomCaptureState(state);

  useEffect(() => {
    if (!domScene) {
      callbacks.onBackdropRefreshReady(null);
      return undefined;
    }
    callbacks.onBackdropRefreshReady(() => converterRef.current?.refresh());
    return () => callbacks.onBackdropRefreshReady(null);
  }, [callbacks, domScene]);

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
      data-lab-source={state.scene === 'S001' ? state.lab.source.kind : undefined}
      data-scene={state.scene}
      options={contextOptions}
      onError={callbacks.onError}
      onReady={callbacks.onContextReady}
    >
      {domScene ? (
        <BackdropConverter
          ref={converterRef}
          backgroundColor={resolveBackdropBackgroundColor(state)}
          className={editorialDomScene
            ? 'scene-backdrop dom-capture-backdrop'
            : `scene-backdrop scroll-backdrop ${
                state.scene === 'S005'
                  ? 'body-scroll-backdrop'
                  : 'internal-scroll-backdrop'
              }`}
          viewportCapture={resolveViewportCapture(state)}
        >
          {editorialDomScene ? (
            <>
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
            </>
          ) : (
            <div className="scroll-band-grid" data-testid="scroll-band-grid">
              {SCROLL_BANDS.map((band) => (
                <section className={`scroll-band tone-${band.tone}`} key={band.id}>
                  <span>{state.scene === 'S005' ? 'BODY' : 'INTERNAL'} {band.id}</span>
                  <strong>{band.title}</strong>
                  <small>{band.detail}</small>
                </section>
              ))}
            </div>
          )}
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
          data-interaction-preset={material.options.interactionPreset}
          data-material-id={material.id}
          data-oracle-material={state.oracleMode ? material.id : undefined}
          data-testid={material.testId ?? (index === 0 ? 'primary-material' : undefined)}
        >
          {material.control ? (
            <InteractionFixtureControl control={material.control} />
          ) : (
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
          )}
        </LiquidGlassMaterial>
      ))}
    </LiquidGlass>
  );
}
