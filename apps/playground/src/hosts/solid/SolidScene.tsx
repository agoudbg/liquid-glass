/** @jsxImportSource solid-js */
import type { GlassContextOptions } from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  BackdropConverter,
  type BackdropConverterHandle,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-solid';
import { For, Show } from 'solid-js';

import {
  getBackdropDraw,
  isDomCaptureScene,
  resolveDomCaptureContent,
  resolveViewportCapture,
  SCROLL_BANDS,
} from '../../shared/scene-backdrops';
import { resolveSceneMaterials } from '../../shared/scene-materials';
import type { FrameworkHostProps } from '../../shared/types';

/** Render the canonical scene through the Solid public adapter. */
export function SolidScene(props: FrameworkHostProps): import('solid-js').JSX.Element {
  const contextOptions = (): GlassContextOptions => ({
    canvasZIndex: props.state.oracleMode ? 10 : undefined,
    renderMode: props.state.renderMode,
    renderPrecision: props.state.renderPrecision,
    scrollable: props.state.scrollable,
  });
  const publishBackdropHandle = (handle: BackdropConverterHandle | null): void => {
    props.callbacks.onBackdropRefreshReady(
      handle ? () => handle.refresh() : null,
    );
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
      data-scene={props.state.scene}
      options={contextOptions()}
      onError={props.callbacks.onError}
      onReady={props.callbacks.onContextReady}
    >
      <Show
        when={isDomCaptureScene(props.state.scene)}
        fallback={(
          <BackdropCanvas
            class="scene-backdrop"
            draw={getBackdropDraw(props.state.scene, props.state.oracleMode)}
          />
        )}
      >
        <BackdropConverter
          apiRef={publishBackdropHandle}
          backgroundColor="#dce4df"
          class={props.state.scene === 'S003'
            ? 'scene-backdrop dom-capture-backdrop'
            : `scene-backdrop scroll-backdrop ${
                props.state.scene === 'S005'
                  ? 'body-scroll-backdrop'
                  : 'internal-scroll-backdrop'
              }`}
          viewportCapture={resolveViewportCapture(props.state)}
        >
          <Show
            when={props.state.scene === 'S003'}
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
        </BackdropConverter>
      </Show>
      <For each={resolveSceneMaterials(props.state)}>
        {(material, index) => (
          <LiquidGlassMaterial
            {...material.options}
            class={material.className}
            data-interaction-preset={material.options.interactionPreset}
            data-material-id={material.id}
            data-oracle-material={props.state.oracleMode ? material.id : undefined}
            data-testid={material.testId ?? (
              index() === 0 ? 'primary-material' : undefined
            )}
          >
            <div class="material-copy">
              <Show
                when={props.state.oracleMode}
                fallback={(
                  <>
                    <span>{material.label}</span>
                    <strong>{material.name}</strong>
                    <small>
                      {material.options.thickness} px ·{' '}
                      {material.options.refractIndex?.toFixed(2)} IOR
                    </small>
                  </>
                )}
              >
                <strong>{material.name}</strong>
                <Show when={material.detail}>
                  {(detail) => <span>{detail()}</span>}
                </Show>
              </Show>
            </div>
          </LiquidGlassMaterial>
        )}
      </For>
    </LiquidGlass>
  );
}
