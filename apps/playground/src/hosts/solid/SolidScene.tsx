/** @jsxImportSource solid-js */
import type { GlassContextOptions } from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-solid';
import { For, Show } from 'solid-js';

import { getBackdropDraw, resolveSceneMaterials } from '../../shared/scenes';
import type { FrameworkHostProps } from '../../shared/types';

/** Render the canonical scene through the Solid public adapter. */
export function SolidScene(props: FrameworkHostProps): import('solid-js').JSX.Element {
  const contextOptions = (): GlassContextOptions => ({
    canvasZIndex: props.state.oracleMode ? 10 : undefined,
    renderMode: props.state.renderMode,
    renderPrecision: props.state.renderPrecision,
  });

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
      <BackdropCanvas
        class="scene-backdrop"
        draw={getBackdropDraw(props.state.scene, props.state.oracleMode)}
      />
      <For each={resolveSceneMaterials(props.state)}>
        {(material, index) => (
          <LiquidGlassMaterial
            {...material.options}
            class={material.className}
            data-material-id={material.id}
            data-testid={index() === 0 ? 'primary-material' : undefined}
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
