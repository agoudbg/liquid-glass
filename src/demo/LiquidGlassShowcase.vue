<template>
  <div class="showcase">
    <!-- Header -->
    <header class="showcase-header">
      <h1>🌊 Liquid Glass</h1>
      <p>A Vue 3 component library for stunning glass refraction effects</p>
    </header>

    <!-- Main Demo Area -->
    <LiquidGlass class="showcase-container" :scrollable="true" :debug="false"
      :render-precision="settings.renderPrecision">
      <!-- Background Content -->
      <LgBackdropConverter capture-lib="html-to-image">
        <template #default="{ requestBackdropRedraw }">
          <div class="backdrop-content">
            <!-- Gradient Background -->
            <div class="gradient-bg"></div>

            <!-- Sample Content -->
            <div class="content-grid">
              <div class="content-card" v-for="i in 6" :key="i">
                <div class="card-icon">{{ ['🎨', '⚡', '🔮', '💎', '🌈', '✨'][i - 1] }}</div>
                <h3>Feature {{ i }}</h3>
                <p>Sample background content for glass effect demonstration.</p>
              </div>
            </div>

            <!-- Image Section -->
            <div class="image-section">
              <img v-if="settings.showImage" src="../assets/susu.webp" alt="Demo" @load="requestBackdropRedraw()" />
              <div v-else class="image-placeholder">
                <span>Toggle image in settings</span>
              </div>
            </div>
          </div>
        </template>
      </LgBackdropConverter>

      <!-- Glass Materials -->
      <div class="glass-showcase">
        <!-- Basic Glass Card -->
        <LiquidGlassMaterial :radius="settings.radius" :thickness="settings.thickness"
          :refract-index="settings.refractIndex" :refract-intensity="settings.refractIntensity" :blur="settings.blur"
          :dispersion="settings.dispersion" :disable-interactions="!settings.enableInteractions"
          class="glass-card basic-card">
          <div class="card-content">
            <h2>Basic Glass</h2>
            <p>Standard liquid glass with customizable parameters</p>
            <div class="card-stats">
              <span>Thickness: {{ settings.thickness }}</span>
              <span>IOR: {{ settings.refractIndex.toFixed(2) }}</span>
            </div>
          </div>
        </LiquidGlassMaterial>

        <!-- Asymmetric Corners -->
        <LiquidGlassMaterial :radius="20" :radius-t-r="60" :radius-b-r="settings.radius" :radius-b-l="20"
          :radius-t-l="40" :thickness="settings.thickness" :dispersion="0.08" class="glass-card asymmetric-card">
          <div class="card-content">
            <h2>Asymmetric Corners</h2>
            <p>Each corner can have different radius</p>
            <code>:radius-t-r="60" :radius-b-r="40"</code>
          </div>
        </LiquidGlassMaterial>

        <!-- High Dispersion -->
        <LiquidGlassMaterial :radius="settings.radius" :thickness="40" :dispersion="0.15" :refract-intensity="1.2"
          class="glass-card dispersion-card">
          <div class="card-content">
            <h2>Chromatic Dispersion</h2>
            <p>Rainbow edge effect with high dispersion</p>
            <div class="rainbow-bar"></div>
          </div>
        </LiquidGlassMaterial>

        <!-- Draggable Glass -->
        <div class="draggable-wrapper" :style="draggableStyle" @pointerdown="onDragStart">
          <LiquidGlassMaterial :radius="28" :thickness="settings.thickness" :is-moveable="true"
            :only-click-interactions="true" ref="draggableGlass" class="glass-card draggable-card">
            <div class="card-content">
              <h2>🖐️ Drag Me!</h2>
              <p>This glass panel can be moved around</p>
              <small>Position: ({{ draggable.x.toFixed(0) }}, {{ draggable.y.toFixed(0) }})</small>
            </div>
          </LiquidGlassMaterial>
        </div>

        <!-- Nested Content -->
        <LiquidGlassMaterial :radius="24" :thickness="25" class="glass-card nested-card">
          <div class="card-content nested-content">
            <h2>Interactive Content</h2>
            <div class="button-group">
              <button @click="counter++">Count: {{ counter }}</button>
              <input v-model="inputText" placeholder="Type here..." />
            </div>
            <p class="input-preview">{{ inputText || 'Your text will appear here' }}</p>
          </div>
        </LiquidGlassMaterial>

        <!-- Circular Glass -->
        <LiquidGlassMaterial :radius="100" :thickness="50" :dispersion="0.05" class="glass-card circular-card">
          <div class="card-content circular-content">
            <div class="avatar">🌟</div>
            <span>Circular</span>
          </div>
        </LiquidGlassMaterial>

        <!-- iOS 26 Interaction Presets Section -->
        <div class="preset-section-header">
          <h2>🍎 iOS 26 Interaction Presets</h2>
          <p>Three preset interaction modes that mimic iOS 26 liquid glass behavior</p>
        </div>

        <!-- Button Preset Demo -->
        <LiquidGlassMaterial :radius="28" :thickness="30" interaction-preset="button"
          class="glass-card preset-card button-preset-card">
          <div class="card-content preset-content">
            <div class="preset-icon">🔘</div>
            <h2>Button Preset</h2>
            <p>Hover to see follow effect. Click and drag to stretch.</p>
            <ul class="preset-features">
              <li>✨ Hover follow with slight enlarge</li>
              <li>🖱️ Click enlarges significantly</li>
              <li>↔️ Drag stretches with origin shift</li>
              <li>⏱️ Idle returns to center</li>
            </ul>
            <code>interaction-preset="button"</code>
          </div>
        </LiquidGlassMaterial>

        <!-- Context Menu Preset Demo -->
        <LiquidGlassMaterial :radius="28" :thickness="30" interaction-preset="context-menu"
          class="glass-card preset-card context-menu-preset-card">
          <div class="card-content preset-content">
            <div class="preset-icon">📋</div>
            <h2>Context Menu Preset</h2>
            <p>No hover response. Click and drag to see stretch effect.</p>
            <ul class="preset-features">
              <li>🚫 No hover tracking</li>
              <li>📐 Slight scale on press</li>
              <li>↔️ Drag stretches with origin shift</li>
              <li>⏱️ Partial return on idle</li>
            </ul>
            <code>interaction-preset="context-menu"</code>
          </div>
        </LiquidGlassMaterial>

        <!-- Slider Preset Demo -->
        <LiquidGlassMaterial :radius="28" :thickness="30" interaction-preset="slider" :background-color="'#ff000033'"
          class="glass-card preset-card slider-preset-card">
          <div class="card-content preset-content">
            <div class="preset-icon">🎚️</div>
            <h2>Slider Preset</h2>
            <p>Click and drag horizontally for jelly-like stretch effect.</p>
            <ul class="preset-features">
              <li>🔍 Large scale on press</li>
              <li>🌊 Velocity-based jelly stretch</li>
              <li>🎯 Fixed center (no origin shift)</li>
              <li>💫 Extra bouncy release</li>
            </ul>
            <code>interaction-preset="slider"</code>
          </div>
        </LiquidGlassMaterial>

        <!-- Custom Configuration Demo -->
        <LiquidGlassMaterial :radius="28" :thickness="30" interaction-preset="button" :interaction-config="{
          hoverScale: 1.05,
          activeScale: 1.12,
          stretchFactor: 0.002,
          releaseSpring: { stiffness: 250, damping: 8, mass: 1 }
        }" class="glass-card preset-card custom-preset-card">
          <div class="card-content preset-content">
            <div class="preset-icon">⚙️</div>
            <h2>Custom Config</h2>
            <p>Override preset values with custom configuration.</p>
            <ul class="preset-features">
              <li>🎨 Based on button preset</li>
              <li>📈 Higher scales (1.05/1.12)</li>
              <li>💨 More stretch (0.002)</li>
              <li>🎾 Extra bouncy spring</li>
            </ul>
            <code>:interaction-config="{...}"</code>
          </div>
        </LiquidGlassMaterial>
      </div>
    </LiquidGlass>

    <!-- Control Panel -->
    <aside class="control-panel" :class="{ collapsed: panelCollapsed }">
      <button class="toggle-btn" @click="panelCollapsed = !panelCollapsed">
        {{ panelCollapsed ? '◀' : '▶' }}
      </button>

      <div class="panel-content" v-show="!panelCollapsed">
        <h2>⚙️ Settings</h2>

        <div class="control-section">
          <h3>Glass Properties</h3>

          <div class="control-item">
            <label>Thickness: {{ settings.thickness }}</label>
            <input type="range" v-model.number="settings.thickness" min="5" max="80" step="1" />
          </div>

          <div class="control-item">
            <label>Refract Index: {{ settings.refractIndex.toFixed(2) }}</label>
            <input type="range" v-model.number="settings.refractIndex" min="1.0" max="2.5" step="0.05" />
          </div>

          <div class="control-item">
            <label>Intensity: {{ settings.refractIntensity.toFixed(2) }}</label>
            <input type="range" v-model.number="settings.refractIntensity" min="0" max="2" step="0.05" />
          </div>

          <div class="control-item">
            <label>Corner Radius: {{ settings.radius }}</label>
            <input type="range" v-model.number="settings.radius" min="0" max="100" step="1" />
          </div>

          <div class="control-item">
            <label>Blur: {{ settings.blur.toFixed(1) }}</label>
            <input type="range" v-model.number="settings.blur" min="0" max="20" step="0.5" />
          </div>

          <div class="control-item">
            <label>Dispersion: {{ settings.dispersion.toFixed(3) }}</label>
            <input type="range" v-model.number="settings.dispersion" min="0" max="0.2" step="0.005" />
          </div>
        </div>

        <div class="control-section">
          <h3>Render Settings</h3>

          <div class="control-item">
            <label>Render Precision: {{ settings.renderPrecision.toFixed(2) }}</label>
            <input type="range" v-model.number="settings.renderPrecision" min="0.5" max="2" step="0.1" />
          </div>

          <div class="control-item checkbox">
            <label>
              <input type="checkbox" v-model="settings.enableInteractions" />
              Enable Interactions
            </label>
          </div>

          <div class="control-item checkbox">
            <label>
              <input type="checkbox" v-model="settings.showImage" />
              Show Background Image
            </label>
          </div>
        </div>

        <div class="control-section">
          <h3>Presets</h3>
          <div class="preset-buttons">
            <button @click="applyPreset('subtle')">Subtle</button>
            <button @click="applyPreset('standard')">Standard</button>
            <button @click="applyPreset('intense')">Intense</button>
            <button @click="applyPreset('rainbow')">Rainbow</button>
          </div>
        </div>

        <div class="control-section">
          <h3>Export</h3>
          <button class="export-btn" @click="exportSettings">📋 Copy Settings</button>
          <pre class="settings-preview">{{ settingsJson }}</pre>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import {
  computed, onMounted, onUnmounted, reactive, ref,
} from 'vue';

import LgBackdropConverter from '../components/LgBackdropConverter.vue';
import LiquidGlass from '../components/LiquidGlass.vue';
import LiquidGlassMaterial from '../components/LiquidGlassMaterial.vue';

// Settings
const settings = reactive({
  thickness: 30,
  refractIndex: 1.5,
  refractIntensity: 1.0,
  radius: 24,
  blur: 0,
  dispersion: 0.02,
  renderPrecision: 1.0,
  enableInteractions: true,
  showImage: false,
});

// UI State
const panelCollapsed = ref(false);
const counter = ref(0);
const inputText = ref('');
const draggableGlass = ref<InstanceType<typeof LiquidGlassMaterial> | null>(null);

// Draggable state
const draggable = reactive({
  x: 50, y: 400, isDragging: false, offsetX: 0, offsetY: 0,
});

const draggableStyle = computed(() => ({
  position: 'absolute' as const,
  left: `${draggable.x}px`,
  top: `${draggable.y}px`,
  cursor: draggable.isDragging ? 'grabbing' : 'grab',
}));

const settingsJson = computed(() => JSON.stringify({
  thickness: settings.thickness,
  refractIndex: settings.refractIndex,
  refractIntensity: settings.refractIntensity,
  radius: settings.radius,
  blur: settings.blur,
  dispersion: settings.dispersion,
}, null, 2));

// Drag handlers
const onDragStart = (e: PointerEvent) => {
  draggable.isDragging = true;
  draggable.offsetX = e.clientX - draggable.x;
  draggable.offsetY = e.clientY - draggable.y;
  draggableGlass.value?.startUpdating();
};

const onDragMove = (e: PointerEvent) => {
  if (!draggable.isDragging) return;
  draggable.x = e.clientX - draggable.offsetX;
  draggable.y = e.clientY - draggable.offsetY;
};

const onDragEnd = () => {
  draggable.isDragging = false;
  draggableGlass.value?.stopUpdating();
};

// Presets
const presets = {
  subtle: {
    thickness: 15, refractIndex: 1.2, refractIntensity: 0.5, dispersion: 0.01, blur: 0,
  },
  standard: {
    thickness: 30, refractIndex: 1.5, refractIntensity: 1.0, dispersion: 0.02, blur: 0,
  },
  intense: {
    thickness: 50, refractIndex: 2.0, refractIntensity: 1.5, dispersion: 0.05, blur: 0,
  },
  rainbow: {
    thickness: 40, refractIndex: 1.8, refractIntensity: 1.2, dispersion: 0.15, blur: 0,
  },
};

const applyPreset = (name: keyof typeof presets) => {
  Object.assign(settings, presets[name]);
};

const exportSettings = () => {
  navigator.clipboard.writeText(settingsJson.value);
  alert('Settings copied to clipboard!');
};

onMounted(() => {
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
});

onUnmounted(() => {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
});
</script>

<style scoped>
.showcase {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #1a1a2e;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.showcase-header {
  padding: 20px 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
  z-index: 10;
}

.showcase-header h1 {
  margin: 0;
  font-size: 2rem;
}

.showcase-header p {
  margin: 8px 0 0;
  opacity: 0.9;
}

.showcase-container {
  flex: 1;
  position: relative;
  overflow: auto;
}

/* Backdrop */
.backdrop-content {
  min-height: 100%;
  padding: 40px;
  position: relative;
}

.gradient-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  z-index: -1;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.content-card {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 24px;
  color: white;
}

.card-icon {
  font-size: 2rem;
  margin-bottom: 12px;
}

.content-card h3 {
  margin: 0 0 8px;
}

.content-card p {
  margin: 0;
  opacity: 0.7;
  font-size: 0.9rem;
}

.image-section {
  text-align: center;
  margin-top: 40px;
}

.image-section img {
  max-width: 400px;
  border-radius: 16px;
}

.image-placeholder {
  width: 300px;
  height: 200px;
  margin: 0 auto;
  background: rgba(255, 255, 255, 0.05);
  border: 2px dashed rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
}

/* Glass Cards */
.glass-showcase {
  position: absolute;
  inset: 0;
  padding: 40px;
  pointer-events: none;
}

.glass-card {
  pointer-events: auto;
}

.card-content {
  padding: 24px;
  color: white;
}

.card-content h2 {
  margin: 0 0 12px;
  font-size: 1.25rem;
}

.card-content p {
  margin: 0 0 12px;
  opacity: 0.85;
  font-size: 0.9rem;
}

.card-stats {
  display: flex;
  gap: 16px;
  font-size: 0.8rem;
  opacity: 0.7;
}

.basic-card {
  position: absolute;
  top: 40px;
  right: 400px;
  width: 280px;
}

.asymmetric-card {
  position: absolute;
  top: 220px;
  right: 400px;
  width: 280px;
}

.asymmetric-card code {
  display: block;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px;
  border-radius: 6px;
  font-size: 0.75rem;
}

.dispersion-card {
  position: absolute;
  top: 400px;
  right: 400px;
  width: 280px;
}

.rainbow-bar {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, red, orange, yellow, green, blue, purple);
}

.draggable-wrapper {
  z-index: 100;
}

.draggable-card {
  width: 240px;
}

.draggable-card small {
  opacity: 0.6;
  font-size: 0.75rem;
}

.nested-card {
  position: absolute;
  bottom: 40px;
  left: 40px;
  width: 320px;
}

.nested-content .button-group {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.nested-content button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}

.nested-content button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.nested-content input {
  flex: 1;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  outline: none;
}

.nested-content input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.input-preview {
  font-style: italic;
  opacity: 0.7;
}

.circular-card {
  position: absolute;
  bottom: 40px;
  right: 400px;
  width: 200px;
  height: 200px;
}

.circular-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

.avatar {
  font-size: 3rem;
  margin-bottom: 8px;
}

/* Control Panel */
.control-panel {
  position: fixed;
  right: 0;
  top: 80px;
  bottom: 0;
  width: 320px;
  background: rgba(26, 26, 46, 0.95);
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  overflow-y: auto;
  transition: transform 0.3s ease;
  z-index: 1000;
}

.control-panel.collapsed {
  transform: translateX(280px);
}

.toggle-btn {
  position: absolute;
  left: -40px;
  top: 20px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px 0 0 8px;
  background: rgba(26, 26, 46, 0.95);
  color: white;
  cursor: pointer;
  font-size: 1rem;
}

.panel-content {
  padding: 20px;
  color: white;
}

.panel-content h2 {
  margin: 0 0 20px;
  font-size: 1.25rem;
}

.control-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.control-section h3 {
  margin: 0 0 16px;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.7;
}

.control-item {
  margin-bottom: 16px;
}

.control-item label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.85rem;
}

.control-item input[type="range"] {
  width: 100%;
  accent-color: #667eea;
}

.control-item.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.preset-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.preset-buttons button {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: transparent;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-buttons button:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #667eea;
}

.export-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  cursor: pointer;
  font-weight: 500;
  margin-bottom: 12px;
}

.settings-preview {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px;
  border-radius: 8px;
  font-size: 0.75rem;
  overflow-x: auto;
  margin: 0;
}

/* iOS 26 Interaction Presets Section */
.preset-section-header {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 20px 20px;
  margin-top: 40px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.preset-section-header h2 {
  font-size: 1.8rem;
  margin-bottom: 8px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.preset-section-header p {
  opacity: 0.7;
  font-size: 1rem;
}

.preset-card {
  min-height: 280px;
}

.preset-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.preset-icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
}

.preset-content h2 {
  margin-bottom: 8px;
}

.preset-content p {
  font-size: 0.9rem;
  opacity: 0.8;
  margin-bottom: 12px;
}

.preset-features {
  list-style: none;
  padding: 0;
  margin: 0 0 auto 0;
  font-size: 0.85rem;
}

.preset-features li {
  padding: 4px 0;
  opacity: 0.9;
}

.preset-content code {
  display: block;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 0.75rem;
  margin-top: auto;
  text-align: center;
}

.button-preset-card {
  border: 1px solid rgba(102, 126, 234, 0.3);
}

.context-menu-preset-card {
  border: 1px solid rgba(118, 75, 162, 0.3);
}

.slider-preset-card {
  border: 1px solid rgba(234, 102, 126, 0.3);
}

.custom-preset-card {
  border: 1px solid rgba(126, 234, 102, 0.3);
}
</style>
