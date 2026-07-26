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
  LEGACY_ORACLE_SCROLL_BANDS,
  resolveBackdropBackgroundColor,
  resolveDomCaptureContent,
  resolveViewportCapture,
  SCROLL_BANDS,
  shouldRenderMaterialsBeforeBackdrop,
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
  const refreshBackdrop = (): void => {
    void converterRef.current?.refresh();
  };
  const materialNodes = materials.map((material, index) => (
    <LiquidGlassMaterial
      {...material.options}
      key={material.id}
      className={material.className}
      data-interaction-preset={material.options.interactionPreset}
      data-material-id={material.id}
      data-oracle-material={state.oracleMode ? material.id : undefined}
      data-testid={material.testId ?? (index === 0 ? 'primary-material' : undefined)}
    >
      {state.oracleMode ? (
        material.detail ? (
          <>
            <strong>{material.name}</strong>
            <span>{material.detail}</span>
          </>
        ) : material.name
      ) : material.control ? (
        <InteractionFixtureControl control={material.control} />
      ) : (
        <div className="material-copy">
          <span>{material.label}</span>
          <strong>{material.name}</strong>
          <small>
            {material.options.thickness} px ·{' '}
            {material.options.refractIndex?.toFixed(2)} IOR
          </small>
        </div>
      )}
    </LiquidGlassMaterial>
  ));
  const materialsBeforeBackdrop = shouldRenderMaterialsBeforeBackdrop(state);

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
      {materialsBeforeBackdrop ? materialNodes : null}
      {domScene ? (
        <BackdropConverter
          ref={converterRef}
          backgroundColor={resolveBackdropBackgroundColor(state)}
          className={state.oracleMode
            ? 'scene-backdrop oracle-backdrop-converter'
            : editorialDomScene
              ? 'scene-backdrop dom-capture-backdrop'
              : `scene-backdrop scroll-backdrop ${
                  state.scene === 'S005'
                    ? 'body-scroll-backdrop'
                    : 'internal-scroll-backdrop'
                }`}
          viewportCapture={resolveViewportCapture(state)}
        >
          {state.oracleMode && state.scene === 'S003' ? (
            <div className="oracle-dom-backdrop">
              <div className="oracle-dom-stripe oracle-stripe-one">
                Structured DOM
              </div>
              <div className="oracle-dom-stripe oracle-stripe-two">
                Capture parity
              </div>
              <div className="oracle-dom-stripe oracle-stripe-three">
                Text and color
              </div>
              <button
                data-testid="manual-refresh"
                type="button"
                onClick={refreshBackdrop}
              >
                Refresh
              </button>
            </div>
          ) : state.oracleMode ? (
            <div
              className={[
                'oracle-long-backdrop',
                state.scene === 'S005'
                  ? 'oracle-body-backdrop'
                  : 'oracle-internal-backdrop',
              ].join(' ')}
            >
              {LEGACY_ORACLE_SCROLL_BANDS.map((index) => (
                <div className="oracle-scroll-band" key={index}>
                  <strong>
                    {state.scene === 'S005' ? 'Body' : 'Internal'} band {index}
                  </strong>
                  <span>
                    {state.scene === 'S005'
                      ? index % 2 === 0 ? 'cool field' : 'warm field'
                      : index % 2 === 0 ? 'north' : 'south'}
                  </span>
                </div>
              ))}
            </div>
          ) : editorialDomScene ? (
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
      {materialsBeforeBackdrop ? null : materialNodes}
    </LiquidGlass>
  );
}
