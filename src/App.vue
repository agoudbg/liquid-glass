<template>
  <div class="liquid-glass-container">
  </div>

  <h2>LiquidGlass Demo</h2>
  <div class="single-glass-container">
    <LiquidGlass class="liquid-glass-container" :debug="true">
      <div class="single-glass-layout">
        <LgBackdropConverter :capture-lib="'html2canvas'">
          <template #default="{ requestBackdropRedraw }">
            <div class="demo-backdrop">
              <div class="demo-pill"><input class="inputs" value="Input" @change="requestBackdropRedraw()"></div>
              <div class="demo-tiles">
                <div class="demo-tile">Color</div>
                <div class="demo-tile">Noise</div>
                <div class="demo-tile">Texture</div>
                <div class="demo-tile">Shape</div>
              </div>
            </div>
          </template>
        </LgBackdropConverter>

        <div class="demo-materials">
          <LiquidGlassMaterial :radius="20">
            <div class="demo-card">
              <h3>Glass card</h3>
              <p>Scoped provider demo with html2canvas backdrop.</p>
            </div>
          </LiquidGlassMaterial>
        </div>
      </div>
      <LiquidGlassDebugger initiallyOpen />
    </LiquidGlass>
  </div>

  <div class="playground-container">
    <h2>Playground</h2>
    <LiquidGlassPlayground />
  </div>

  <div class="spacer"></div>

  <div class="multi-glass-container">
    <h2>Multi-Glass Demo</h2>
    <MultiGlassDemo />
  </div>

</template>

<script setup lang="ts">
import LiquidGlassPlayground from './components/LiquidGlassPlayground.vue';
import MultiGlassDemo from './components/MultiGlassDemo.vue';
import {
  LgBackdropCanvas,
  LgBackdropConverter,
  LgBackdropScrollArea,
  LiquidGlass,
  LiquidGlassDebugger,
  LiquidGlassMaterial,
} from './index';

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

.playground-container {
  width: 1100px;
  height: 750px;
  border: 1px solid #ccc;
  border-radius: 12px;
  overflow: hidden;
  margin: 100vh 20px 0;
  position: relative;
}

.single-glass-container {
  width: 80vw;
  height: 420px;
  border: 1px solid #ccc;
  border-radius: 12px;
  overflow: hidden;
  margin: 20px;
  position: relative;
  color: #e8ecf8;
}

.liquid-glass-container {
  background-color: #2d7cf1;
}

.single-glass-layout {
  height: calc(100% - 42px);
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  padding: 12px 16px 16px;
}

.demo-backdrop {
  height: 100%;
  border-radius: 12px;
  background: radial-gradient(circle at 20% 20%, #2d7cf1 0%, rgba(45, 124, 241, 0) 40%),
    radial-gradient(circle at 80% 30%, #a24df0 0%, rgba(162, 77, 240, 0) 38%),
    linear-gradient(135deg, #0f1427 0%, #131931 60%, #0f1427 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.demo-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 14px;
  letter-spacing: 0.2px;
}

.demo-pill .inputs {
  background: #a24df0;
  border: none;
  outline: none;
  color: #fff;
  font-size: 18px;
  width: 800px;
}

.demo-tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.demo-tile {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px 10px;
  text-align: center;
  font-weight: 600;
  letter-spacing: 0.1px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
}

.demo-materials {
  position: absolute;
  z-index: 99;
  top: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 140px;
}

.demo-card {
  width: 100%;
  height: 100%;
  min-height: 220px;
  border-radius: 18px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.12);
  color: #0b0e1a;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
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
