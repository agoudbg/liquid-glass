<template>
  <h2>LiquidGlass Demo</h2>
  <div class="single-glass-container">
    <LiquidGlass class="liquid-glass-container" :scrollable="true" :debug="false" :render-precision="0.8">
      <div style="width: 120%; height: 120%">
        <div class="single-glass-layout">
          <LiquidGlass :scrollable="true" ref="scrollableLiquidGlass">
            <div style="width: 2800px;">
              <LiquidGlassDebugger v-if="showDebug" />
              <LgBackdropConverter :capture-lib="'html-to-image'">
                <template #default="{ requestBackdropRedraw }">
                  <div class="demo-backdrop">
                    <div class="demo-pill"><input class="inputs" value="Input" @input="requestBackdropRedraw()"></div>
                    <div class="demo-tiles">
                      <div class="demo-tile">Color</div>
                      <div class="demo-tile">Noise</div>
                      <div class="demo-tile">Texture</div>
                      <div class="demo-tile">Shape</div>
                    </div>
                    <LiquidGlassMaterial :radius="20" ref="demoMaterial9">
                      <div class="demo-card">
                        <h3>Glass card</h3>
                        <button @click="updateDemoMaterial0Position()">Click</button>
                      </div>
                    </LiquidGlassMaterial>
                    <div>
                      <label>
                        <input type="checkbox" v-model="showImage" @change="requestBackdropRedraw()" />
                        Show Susu
                      </label>
                    </div>
                    <img src="/susu.webp" v-if="showImage" />
                  </div>
                </template>
              </LgBackdropConverter>
            </div>
          </LiquidGlass>
        </div>

        <div class="canvas-container">
          <LgBackdropCanvas :draw="drawBlueRect" />
        </div>

        <div class="demo-material" :position="demoMaterial0Position">
          <LiquidGlassMaterial :radius="20" ref="demoMaterial0" :proxy-target="scrollableLiquidGlassProxy"
            :interaction="{ activeScale: 1.1 }">
            <div class="demo-card">
              <h3>Glass card</h3>
              <button @click="updateDemoMaterial0Position()">Click</button>
            </div>
          </LiquidGlassMaterial>
        </div>

        <div class="demo-material-2" :style="demoMaterial1Style" @pointerdown="onDemoMaterial1DragStart">
          <LiquidGlassMaterial :radius="28" :radiusBR="60" :dispersion="0.1" :blur="0" :thickness="28"
            ref="demoMaterial1" :only-click-interactions="true" :is-moveable="true" :background-color="'#00000000'">
            <div class="demo-card">
              <span>Drag or Resize</span>
            </div>
          </LiquidGlassMaterial>

          <div class="demo-material-2__resize-handle" @pointerdown.stop="onDemoMaterial1ResizeStart"></div>
        </div>
      </div>
    </LiquidGlass>
  </div>

  <div class="settings">
    <label>
      <input type="checkbox" v-model="showDebug" />
      Show Debugger
    </label>
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
import {
  computed, onBeforeUnmount, onMounted, reactive, ref,
  watch,
} from 'vue';

import LiquidGlassPlayground from './components/LiquidGlassPlayground.vue';
import MultiGlassDemo from './components/MultiGlassDemo.vue';
import {
  CustomDrawCallback,
  LgBackdropCanvas,
  LgBackdropConverter,
  LiquidGlass,
  LiquidGlassDebugger,
  LiquidGlassMaterial,
  ProxyTargetInterface,
} from './index';

const showDebug = ref<boolean>(localStorage.getItem('liquid-glass-debugger-open') === 'true');
const showImage = ref<boolean>(false);

watch(showDebug, (newVal) => {
  localStorage.setItem('liquid-glass-debugger-open', newVal ? 'true' : 'false');
});

const demoMaterial0Position = ref<number>(0);
const demoMaterial0 = ref<InstanceType<typeof LiquidGlassMaterial> | null>(null);
const demoMaterial1 = ref<InstanceType<typeof LiquidGlassMaterial> | null>(null);

// Reference to the scrollable LiquidGlass for proxy delegation
const scrollableLiquidGlass = ref<InstanceType<typeof LiquidGlass> | null>(null);

// Computed proxy interface from the scrollable LiquidGlass
const scrollableLiquidGlassProxy = computed<ProxyTargetInterface | null>(
  () => scrollableLiquidGlass.value?.proxyInterface ?? null,
);

const demoMaterial1Helper = reactive({
  x: 300,
  y: 50,
  width: 200,
  height: 140,
  dragOffsetX: 0,
  dragOffsetY: 0,
  isDragging: false,
  isResizing: false,
  resizeStartX: 0,
  resizeStartY: 0,
  resizeStartWidth: 200,
  resizeStartHeight: 140,
});

const MIN_WIDTH = 140;
const MIN_HEIGHT = 100;

const demoMaterial1Style = computed(() => ({
  left: `${demoMaterial1Helper.x}px`,
  top: `${demoMaterial1Helper.y}px`,
  width: `${demoMaterial1Helper.width}px`,
  height: `${demoMaterial1Helper.height}px`,
}));

const updateDemoMaterial0Position = () => {
  demoMaterial0Position.value = (demoMaterial0Position.value + 1) % 4;

  // Trigger re-rendering
  console.log('App.vue: triggering reRender on demoMaterial0');
  demoMaterial0.value?.updating(600);
};

const clampSize = (value: number, min: number) => (value < min ? min : value);

const onDemoMaterial1DragStart = (event: PointerEvent) => {
  demoMaterial1Helper.isDragging = true;
  demoMaterial1Helper.dragOffsetX = event.clientX - demoMaterial1Helper.x;
  demoMaterial1Helper.dragOffsetY = event.clientY - demoMaterial1Helper.y;
  demoMaterial1.value?.startUpdating();
};

const onDemoMaterial1ResizeStart = (event: PointerEvent) => {
  demoMaterial1Helper.isResizing = true;
  demoMaterial1Helper.resizeStartX = event.clientX;
  demoMaterial1Helper.resizeStartY = event.clientY;
  demoMaterial1Helper.resizeStartWidth = demoMaterial1Helper.width;
  demoMaterial1Helper.resizeStartHeight = demoMaterial1Helper.height;
  demoMaterial1.value?.startUpdating();
};

const handlePointerMove = (event: PointerEvent) => {
  if (demoMaterial1Helper.isDragging) {
    demoMaterial1Helper.x = event.clientX - demoMaterial1Helper.dragOffsetX;
    demoMaterial1Helper.y = event.clientY - demoMaterial1Helper.dragOffsetY;
  } else if (demoMaterial1Helper.isResizing) {
    const deltaX = event.clientX - demoMaterial1Helper.resizeStartX;
    const deltaY = event.clientY - demoMaterial1Helper.resizeStartY;
    demoMaterial1Helper.width = clampSize(demoMaterial1Helper.resizeStartWidth + deltaX, MIN_WIDTH);
    demoMaterial1Helper.height = clampSize(demoMaterial1Helper.resizeStartHeight + deltaY, MIN_HEIGHT);
  }
};

const handlePointerUp = () => {
  demoMaterial1Helper.isDragging = false;
  demoMaterial1Helper.isResizing = false;
  demoMaterial1.value?.stopUpdating();
};

const drawBlueRect: CustomDrawCallback = (ctx, w, h) => {
  // 绘制一个半透明的蓝色矩形，占据 Canvas 中间部分
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  const rectW = w * 0.4;
  const rectH = h * 0.4;
  ctx.fillRect(w * 0.3, h * 0.3, rectW, rectH);

  // 绘制一些文字
  ctx.font = '24px sans-serif';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.fillText('Custom Draw Layer', w / 2, h / 2);
};

onMounted(() => {
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
});

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointerup', handlePointerUp);
});
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
  width: 70vw;
  height: 920px;
  border: 1px solid #ccc;
  border-radius: 12px;
  overflow: hidden;
  margin: 20px;
  position: relative;
  color: #e8ecf8;
}

.liquid-glass-container {
  background-color: #2d7cf1;
  /* background-image: url(./assets/pietro-de-grandi-T7K4aEPoGGk-unsplash.jpg); */
  background-size: contain;
  background-position: center left;
  background-repeat: no-repeat;
}

.single-glass-layout {
  width: 40vw;
  height: calc(100% - 42px);
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  padding: 12px 16px 16px;
  overflow: auto;
}

.demo-backdrop {
  width: 60vw;
  height: 100%;
  border-radius: 12px;
  background: radial-gradient(circle at 20% 20%, #2d7cf1 0%, rgba(45, 124, 241, 0) 40%),
    radial-gradient(circle at 80% 30%, #a24df0 0%, rgba(162, 77, 240, 0) 38%),
    linear-gradient(135deg, #0f1427 0%, #131931 60%, #0f1427 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  /* background-image: url(./assets/pietro-de-grandi-T7K4aEPoGGk-unsplash.jpg); */
}

.demo-pill {
  display: inline-flex;
  align-items: center;
  width: 70%;
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

.canvas-container {
  position: absolute;
  top: 20px;
  right: 20px;
  width: min(20vw, 200px);
  height: 150px;
  border-radius: 12px;
  overflow: hidden;
}

.demo-material {
  position: absolute;
  top: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 140px;
  transition: all 0.5s;

  &[position="0"] {
    left: 40px;
    top: 20px;
  }

  &[position="1"] {
    left: 140px;
    top: 80px;
  }

  &[position="2"] {
    left: 100px;
    top: 150px;
  }

  &[position="3"] {
    left: 30px;
    top: 120px;
  }
}

.demo-material-2 {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 290px;
  height: 200px;
  touch-action: none;
}

.demo-material-2__resize-handle {
  position: absolute;
  width: 14px;
  height: 14px;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px 0 0 0;
  cursor: se-resize;
  z-index: 19999;
}

.demo-card {
  width: 100%;
  height: 100%;
  min-height: 220px;
  border-radius: 18px;
  padding: 20px;
  color: #0b0e1a;
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

.page-test {
  width: 80vw;
  height: 1200px;
  border: 1px solid #ccc;
  border-radius: 12px;
  overflow: hidden;
  margin: 20px;
  position: relative;
  color: #333;
}

.liquid-glass-container-page {
  background-color: #f0f0f0;
}

header {
  position: absolute;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  /* backdrop-filter: blur(10px); */
  z-index: 99;
}

header .left,
header .right {
  flex: 0 0 auto;
}

header .title {
  flex: 1 1 auto;
  text-align: center;
}

header .title-text {
  font-size: 20px;
  font-weight: bold;
  color: #333;
}

button {
  position: relative;
  background: none;
  border: none;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  color: inherit;
  z-index: 10009;
}

.info-card {
  display: block;
  margin: 20px 0;
  width: 100%;
  max-width: 400px;
}

.card-content {
  padding: 16px;
}

.content-section {
  padding: 20px;
  height: 200px;
  overflow: auto;
}

.spacer-large {
  height: 400px;
}

footer {
  position: sticky;
  bottom: 0;
  padding: 10px 20px;
  background: #ffffffcc;
  backdrop-filter: blur(10px);
  text-align: center;
  box-shadow: 0 -2px 8px #0000001a;
}

.footer-glass {
  display: block;
  width: 100%;
}

.footer-content {
  padding: 8px 0;
  font-size: 14px;
  color: #555;
}
</style>
