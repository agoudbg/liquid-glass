/** @jsxImportSource solid-js */
import type {
  GlassContext,
  GlassContextOptions,
} from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-solid';
import {
  createSignal,
  For,
  Show,
} from 'solid-js';

import {
  type CompositionSceneId,
  createProxyMaterial,
  drawNestedChildBackdrop,
  getCompositionBackdropDraw,
  resolveCompositionMaterials,
} from '../../shared/composition-scenes';
import type { SceneMaterial } from '../../shared/scene-material-types';
import { resolveSceneRenderPrecision } from '../../shared/scene-render-options';
import type { FrameworkHostProps } from '../../shared/types';

interface SolidCompositionSceneProps extends FrameworkHostProps {
  scene: CompositionSceneId;
}

/** Render advanced context composition through the Solid public adapter. */
export function SolidCompositionScene(
  props: SolidCompositionSceneProps,
): import('solid-js').JSX.Element {
  const [outerContext, setOuterContext] = createSignal<GlassContext | null>(null);
  const outerOptions = (): GlassContextOptions => ({
    debug: props.state.debugEnabled,
    renderMode: props.state.renderMode,
    renderPrecision: resolveSceneRenderPrecision(props.state),
  });
  const auxiliaryOptions = (): GlassContextOptions => ({
    debug: props.state.debugEnabled,
    renderMode: 'uniform',
    renderPrecision: resolveSceneRenderPrecision(props.state),
  });
  const materials = (): readonly SceneMaterial[] => (
    resolveCompositionMaterials(props.scene)
  );
  const handleOuterReady = (context: GlassContext): void => {
    setOuterContext(context);
    props.callbacks.onContextReady(context);
  };
  const handleAuxiliaryReady = (context: GlassContext): void => {
    props.callbacks.onAuxiliaryContextReady?.(context);
  };

  return (
    <LiquidGlass
      class="glass-context composition-context"
      data-framework="solid"
      data-glass-enabled={String(props.state.glassEnabled)}
      data-scene={props.scene}
      data-testid="composition-scene"
      options={outerOptions()}
      onError={props.callbacks.onError}
      onReady={handleOuterReady}
    >
      <BackdropCanvas
        class="scene-backdrop composition-backdrop"
        draw={getCompositionBackdropDraw(props.scene)}
      />

      <Show when={props.scene === 'S009'}>
        <LiquidGlass
          class="nested-child-context"
          data-testid="nested-child-context"
          options={auxiliaryOptions()}
          onError={props.callbacks.onError}
          onReady={handleAuxiliaryReady}
        >
          <BackdropCanvas
            class="scene-backdrop nested-child-backdrop"
            draw={drawNestedChildBackdrop}
          />
          <CompositionMaterial material={materials()[1]} />
        </LiquidGlass>
        <CompositionMaterial material={materials()[0]} />
      </Show>

      <Show when={props.scene === 'S010'}>
        <div class="proxy-target-label" aria-hidden="true">
          TARGET CONTEXT
        </div>
        <LiquidGlass
          class="proxy-source-context"
          data-testid="proxy-source-context"
          options={auxiliaryOptions()}
          onError={props.callbacks.onError}
          onReady={handleAuxiliaryReady}
        >
          <CompositionMaterial material={createProxyMaterial(
            outerContext()?.createProxyInterface(),
          )} />
        </LiquidGlass>
      </Show>

      <Show when={props.scene !== 'S009' && props.scene !== 'S010'}>
        <For each={materials()}>
          {(material) => <CompositionMaterial material={material} />}
        </For>
      </Show>
    </LiquidGlass>
  );
}

function CompositionMaterial(
  props: { material: SceneMaterial | undefined },
): import('solid-js').JSX.Element {
  return (
    <Show when={props.material}>
      {(material) => (
        <LiquidGlassMaterial
          {...material().options}
          class={material().className}
          data-material-id={material().id}
          data-testid={`composition-material-${material().id}`}
        >
          <div class="material-copy">
            <span>{material().label}</span>
            <strong>{material().name}</strong>
            <small>
              {material().options.thickness} px ·{' '}
              {material().options.refractIndex?.toFixed(2)} IOR
            </small>
          </div>
        </LiquidGlassMaterial>
      )}
    </Show>
  );
}
