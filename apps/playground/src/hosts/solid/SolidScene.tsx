/** @jsxImportSource solid-js */
import type { GlassContextOptions } from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  BackdropConverter,
  type BackdropConverterHandle,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-solid';
import { For, Index, Show } from 'solid-js';

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
import type { SceneMaterial } from '../../shared/scene-material-types';
import { resolveSceneMaterials } from '../../shared/scene-materials';
import { resolveSceneRenderPrecision } from '../../shared/scene-render-options';
import type { FrameworkHostProps } from '../../shared/types';
import { InteractionFixtureControl } from './InteractionFixtureControl';

interface SolidSceneMaterialsProps {
  materials: readonly SceneMaterial[];
  oracleMode: boolean;
}

function SolidSceneMaterials(
  props: SolidSceneMaterialsProps,
): import('solid-js').JSX.Element {
  return (
    <Index each={props.materials}>
      {(material, index) => (
        <LiquidGlassMaterial
          {...material().options}
          class={material().className}
          data-interaction-preset={material().options.interactionPreset}
          data-material-id={material().id}
          data-oracle-material={props.oracleMode ? material().id : undefined}
          data-testid={material().testId ?? (
            index === 0 ? 'primary-material' : undefined
          )}
        >
          <Show
            when={props.oracleMode}
            fallback={(
              <Show
                when={material().control}
                fallback={(
                  <div class="material-copy">
                    <span>{material().label}</span>
                    <strong>{material().name}</strong>
                    <small>
                      {material().options.thickness} px ·{' '}
                      {material().options.refractIndex?.toFixed(2)} IOR
                    </small>
                  </div>
                )}
              >
                {(control) => <InteractionFixtureControl control={control()} />}
              </Show>
            )}
          >
            <Show
              when={material().detail}
              fallback={material().name}
            >
              {(detail) => (
                <>
                  <strong>{material().name}</strong>
                  <span>{detail()}</span>
                </>
              )}
            </Show>
          </Show>
        </LiquidGlassMaterial>
      )}
    </Index>
  );
}

/** Render the canonical scene through the Solid public adapter. */
export function SolidScene(props: FrameworkHostProps): import('solid-js').JSX.Element {
  let converterHandle: BackdropConverterHandle | null = null;
  const contextOptions = (): GlassContextOptions => ({
    canvasZIndex: props.state.oracleMode ? 10 : undefined,
    renderMode: props.state.renderMode,
    renderPrecision: resolveSceneRenderPrecision(props.state),
    scrollable: props.state.scrollable,
  });
  const publishBackdropHandle = (handle: BackdropConverterHandle | null): void => {
    converterHandle = handle;
    props.callbacks.onBackdropRefreshReady(
      handle ? () => handle.refresh() : null,
    );
  };
  const refreshBackdrop = (): void => {
    void converterHandle?.refresh();
  };
  const domContent = () => resolveDomCaptureContent(props.state.domVariant);

  return (
    <LiquidGlass
      class={[
        'glass-context',
        props.state.testMode ? 'is-test-mode' : '',
        props.state.oracleMode ? 'is-oracle-mode' : '',
      ].filter(Boolean).join(' ')}
      data-framework="solid"
      data-glass-enabled={String(props.state.glassEnabled)}
      data-lab-source={props.state.scene === 'S001'
        ? props.state.lab.source.kind
        : undefined}
      data-scene={props.state.scene}
      options={contextOptions()}
      onError={props.callbacks.onError}
      onReady={props.callbacks.onContextReady}
    >
      <Show when={shouldRenderMaterialsBeforeBackdrop(props.state)}>
        <SolidSceneMaterials
          materials={resolveSceneMaterials(props.state)}
          oracleMode={props.state.oracleMode}
        />
      </Show>
      <Show
        when={isDomCaptureState(props.state)}
        fallback={(
          <BackdropCanvas
            class="scene-backdrop"
            draw={getBackdropDraw(props.state.scene, props.state.oracleMode)}
          />
        )}
      >
        <BackdropConverter
          apiRef={publishBackdropHandle}
          backgroundColor={resolveBackdropBackgroundColor(props.state)}
          class={props.state.oracleMode
            ? 'scene-backdrop oracle-backdrop-converter'
            : isEditorialDomCaptureState(props.state)
              ? 'scene-backdrop dom-capture-backdrop'
              : `scene-backdrop scroll-backdrop ${
                  props.state.scene === 'S005'
                    ? 'body-scroll-backdrop'
                    : 'internal-scroll-backdrop'
                }`}
          viewportCapture={resolveViewportCapture(props.state)}
        >
          <Show
            when={props.state.oracleMode}
            fallback={(
              <Show
                when={isEditorialDomCaptureState(props.state)}
                fallback={(
                  <div class="scroll-band-grid" data-testid="scroll-band-grid">
                    <For each={SCROLL_BANDS}>
                      {(band) => (
                        <section class={`scroll-band tone-${band.tone}`}>
                          <span>
                            {props.state.scene === 'S005' ? 'BODY' : 'INTERNAL'}{' '}
                            {band.id}
                          </span>
                          <strong>{band.title}</strong>
                          <small>{band.detail}</small>
                        </section>
                      )}
                    </For>
                  </div>
                )}
              >
                <div class="dom-capture-photo">
                  <img
                    alt="Boats crossing a turquoise alpine lake below the Dolomites"
                    data-testid="dom-capture-image"
                    draggable={false}
                    src="/dolomites.jpg"
                  />
                  <span>IMG / LOCAL ASSET</span>
                </div>
                <article
                  class={`dom-capture-copy ${domContent().phaseClass}`}
                  data-dom-phase={props.state.domVariant}
                  data-testid="dom-capture-copy"
                >
                  <p>{domContent().eyebrow}</p>
                  <h3>{domContent().title}</h3>
                  <span>{domContent().description}</span>
                  <div class="dom-capture-swatches" aria-hidden="true">
                    <i /><i /><i />
                  </div>
                  <small>Pietro De Grandi / Unsplash</small>
                </article>
              </Show>
            )}
          >
            <Show
              when={props.state.scene === 'S003'}
              fallback={(
                <div
                  class={[
                    'oracle-long-backdrop',
                    props.state.scene === 'S005'
                      ? 'oracle-body-backdrop'
                      : 'oracle-internal-backdrop',
                  ].join(' ')}
                >
                  <For each={LEGACY_ORACLE_SCROLL_BANDS}>
                    {(index) => (
                      <div class="oracle-scroll-band">
                        <strong>
                          {props.state.scene === 'S005' ? 'Body' : 'Internal'}{' '}
                          band {index}
                        </strong>
                        <span>
                          {props.state.scene === 'S005'
                            ? index % 2 === 0 ? 'cool field' : 'warm field'
                            : index % 2 === 0 ? 'north' : 'south'}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              )}
            >
              <div class="oracle-dom-backdrop">
                <div class="oracle-dom-stripe oracle-stripe-one">
                  Structured DOM
                </div>
                <div class="oracle-dom-stripe oracle-stripe-two">
                  Capture parity
                </div>
                <div class="oracle-dom-stripe oracle-stripe-three">
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
            </Show>
          </Show>
        </BackdropConverter>
      </Show>
      <Show when={!shouldRenderMaterialsBeforeBackdrop(props.state)}>
        <SolidSceneMaterials
          materials={resolveSceneMaterials(props.state)}
          oracleMode={props.state.oracleMode}
        />
      </Show>
    </LiquidGlass>
  );
}
