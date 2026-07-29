/** @jsxImportSource react */
import type {
  GlassContext,
  GlassContextOptions,
} from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  LiquidGlass,
  LiquidGlassMaterial,
} from '@agou/liquid-glass-react';
import {
  useMemo,
  useState,
} from 'react';

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

interface ReactCompositionSceneProps extends FrameworkHostProps {
  scene: CompositionSceneId;
}

/** Render advanced context composition through the React public adapter. */
export function ReactCompositionScene({
  callbacks,
  scene,
  state,
}: ReactCompositionSceneProps): React.JSX.Element {
  const [outerContext, setOuterContext] = useState<GlassContext | null>(null);
  const renderPrecision = resolveSceneRenderPrecision(state);
  const outerOptions = useMemo<GlassContextOptions>(() => ({
    debug: true,
    renderMode: state.renderMode,
    renderPrecision,
  }), [renderPrecision, state.renderMode]);
  const auxiliaryOptions = useMemo<GlassContextOptions>(() => ({
    debug: true,
    renderMode: 'uniform',
    renderPrecision,
  }), [renderPrecision]);
  const materials = resolveCompositionMaterials(scene);
  const proxyTarget = scene === 'S010'
    ? outerContext?.createProxyInterface()
    : undefined;
  const handleOuterReady = (context: GlassContext): void => {
    setOuterContext(context);
    callbacks.onContextReady(context);
  };
  const handleAuxiliaryReady = (context: GlassContext): void => {
    callbacks.onAuxiliaryContextReady?.(context);
  };

  return (
    <LiquidGlass
      className="glass-context composition-context"
      data-framework="react"
      data-glass-enabled={String(state.glassEnabled)}
      data-scene={scene}
      data-testid="composition-scene"
      options={outerOptions}
      onError={callbacks.onError}
      onReady={handleOuterReady}
    >
      <BackdropCanvas
        className="scene-backdrop composition-backdrop"
        draw={getCompositionBackdropDraw(scene)}
      />

      {scene === 'S009' ? (
        <>
          <LiquidGlass
            className="nested-child-context"
            data-testid="nested-child-context"
            options={auxiliaryOptions}
            onError={callbacks.onError}
            onReady={handleAuxiliaryReady}
          >
            <BackdropCanvas
              className="scene-backdrop nested-child-backdrop"
              draw={drawNestedChildBackdrop}
            />
            <CompositionMaterial material={materials[1] ?? materials[0]} />
          </LiquidGlass>
          <CompositionMaterial material={materials[0]} />
        </>
      ) : null}

      {scene === 'S010' ? (
        <>
          <div className="proxy-target-label" aria-hidden="true">
            TARGET CONTEXT
          </div>
          <LiquidGlass
            className="proxy-source-context"
            data-testid="proxy-source-context"
            options={auxiliaryOptions}
            onError={callbacks.onError}
            onReady={handleAuxiliaryReady}
          >
            <CompositionMaterial material={createProxyMaterial(proxyTarget)} />
          </LiquidGlass>
        </>
      ) : null}

      {scene !== 'S009' && scene !== 'S010'
        ? materials.map((material) => (
            <CompositionMaterial key={material.id} material={material} />
          ))
        : null}
    </LiquidGlass>
  );
}

function CompositionMaterial({
  material,
}: {
  material: SceneMaterial | undefined;
}): React.JSX.Element | null {
  if (!material) return null;
  return (
    <LiquidGlassMaterial
      {...material.options}
      className={material.className}
      data-material-id={material.id}
      data-testid={`composition-material-${material.id}`}
    >
      <div className="material-copy">
        <span>{material.label}</span>
        <strong>{material.name}</strong>
        <small>
          {material.options.thickness} px ·{' '}
          {material.options.refractIndex?.toFixed(2)} IOR
        </small>
      </div>
    </LiquidGlassMaterial>
  );
}
