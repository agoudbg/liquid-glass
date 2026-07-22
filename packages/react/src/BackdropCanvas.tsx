import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
} from '@agou/liquid-glass-core';
import { useEffect, useRef } from 'react';

import { useLiquidGlassContext } from './LiquidGlassContext';
import type { BackdropCanvasProps } from './types';

/** React custom-canvas backdrop registered with the nearest container. */
export function BackdropCanvas({
  className,
  draw,
  zIndex,
  ...canvasProps
}: BackdropCanvasProps): React.JSX.Element {
  const { context } = useLiquidGlassContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<BackdropSourceHandle<CanvasBackdropSourceConfig> | null>(null);
  const drawRef = useRef(draw);
  const zIndexRef = useRef(zIndex);
  const lastConfigRef = useRef({ draw, zIndex });

  useEffect(() => {
    drawRef.current = draw;
    zIndexRef.current = zIndex;
  }, [draw, zIndex]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!context || !element) {
      return undefined;
    }

    const registration = context.addBackdropSource({
      kind: 'canvas',
      element,
      draw: drawRef.current,
      zIndex: zIndexRef.current,
      watchPositionChanges: true,
      watchResize: true,
    });
    handleRef.current = registration;
    return () => {
      registration.destroy();
      if (handleRef.current === registration) {
        handleRef.current = null;
      }
    };
  }, [context]);

  useEffect(() => {
    const previous = lastConfigRef.current;
    if (previous.draw === draw && previous.zIndex === zIndex) {
      return;
    }
    lastConfigRef.current = { draw, zIndex };
    handleRef.current?.update({ draw, zIndex });
  }, [draw, zIndex]);

  return (
    <canvas
      {...canvasProps}
      ref={canvasRef}
      aria-hidden="true"
      className={['liquid-glass-backdrop-canvas', className].filter(Boolean).join(' ')}
    />
  );
}
