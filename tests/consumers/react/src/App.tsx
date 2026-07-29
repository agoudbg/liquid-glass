import type {
  CustomDrawCallback,
  GlassContextOptions,
} from '@agou/liquid-glass-core';
import {
  BackdropCanvas,
  CORE_VERSION,
  LiquidGlass,
  LiquidGlassMaterial,
  REACT_ADAPTER_VERSION,
} from '@agou/liquid-glass-react';
import type { JSX } from 'react';

const CONTEXT_OPTIONS = {
  debug: true,
  renderPrecision: 1,
} satisfies GlassContextOptions;

const drawBackdrop: CustomDrawCallback = (context, width, height) => {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#d8e9e2');
  gradient.addColorStop(0.52, '#f4d45f');
  gradient.addColorStop(1, '#e8816d');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(24, 83, 74, 0.32)';
  context.lineWidth = Math.max(1, width / 480);
  for (let x = 0; x < width; x += width / 8) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
};

export function App(): JSX.Element {
  return (
    <LiquidGlass className="consumer-glass" options={CONTEXT_OPTIONS}>
      <BackdropCanvas draw={drawBackdrop} />
      <LiquidGlassMaterial
        className="consumer-material"
        radius={32}
        thickness={42}
        refractIntensity={0.76}
      >
        <main className="consumer-copy">
          <span>PACKED CONSUMER</span>
          <h1>React adapter package loaded</h1>
          <output>
            adapter {REACT_ADAPTER_VERSION}, core {CORE_VERSION}
          </output>
        </main>
      </LiquidGlassMaterial>
    </LiquidGlass>
  );
}
