<template>
  <LiquidGlassBackdropLayer>
    <LgBackdropScrollArea class="scroll-container">
      <div class="content">
        <h1>Liquid Glass Demo</h1>

        <LgBackdropConverter class="converter-box">
          <div class="gradient-box">
            <h2>This is a DOM Element</h2>
            <p>It will be converted to a texture.</p>
          </div>
        </LgBackdropConverter>

        <div class="spacer"></div>

        <LiquidGlassMaterial class="glass-card" border-radius="20px" fallback-blur="20px">
          <h3>Glass Card</h3>
          <p>This card should have a liquid glass effect.</p>
          <button>Click Me</button>
        </LiquidGlassMaterial>

        <div class="spacer"></div>

        <LgBackdropCanvas :draw-function="drawPattern" class="canvas-box" />

        <div class="spacer"></div>

        <div class="playground-container">
          <h2>Playground</h2>
          <LiquidGlassPlayground />
        </div>

        <div class="spacer"></div>

        <div class="multi-glass-container">
          <h2>Multi-Glass Demo</h2>
          <MultiGlassDemo />
        </div>

      </div>
    </LgBackdropScrollArea>
  </LiquidGlassBackdropLayer>
</template>

<script setup lang="ts">
import LiquidGlassPlayground from './components/LiquidGlassPlayground.vue';
import MultiGlassDemo from './components/MultiGlassDemo.vue';
import {
  LgBackdropCanvas,
  LgBackdropConverter,
  LgBackdropScrollArea,
  LiquidGlassBackdropLayer,
  LiquidGlassMaterial,
} from './index';

const drawPattern = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0000ff';
  ctx.font = '20px Arial';
  ctx.fillText('Canvas Content', 20, 40);
};
</script>

<style>
body,
html {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: sans-serif;
}

#app {
  height: 100%;
}

.scroll-container {
  height: 100vh;
  background: #e0e0e0;
}

.content {
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 200vh;
  /* Ensure scrolling */
}

.converter-box {
  margin-bottom: 20px;
}

.gradient-box {
  width: 300px;
  height: 200px;
  background: linear-gradient(45deg, #ff9a9e 0%, #fad0c4 99%, #fad0c4 100%);
  padding: 20px;
  border-radius: 10px;
  color: white;
}

.glass-card {
  width: 300px;
  height: 200px;
  padding: 20px;
  color: #333;
  /* Glass effect will be applied here */
  background: rgba(255, 255, 255, 0.1);
  /* Fallback or base */
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
}

.canvas-box {
  width: 300px;
  height: 200px;
}

.playground-container {
  width: 1100px;
  height: 750px;
  border: 1px solid #ccc;
  border-radius: 12px;
  overflow: hidden;
  margin: 20px;
  position: relative;
}

.multi-glass-container {
  width: 1100px;
  height: 750px;
  border: 1px solid #ccc;
  border-radius: 12px;
  overflow: hidden;
  margin: 20px;
  position: relative;
  background: #000;
}

.spacer {
  height: 50px;
}
</style>
