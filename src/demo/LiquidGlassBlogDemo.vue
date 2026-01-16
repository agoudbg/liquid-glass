<template>
  <div class="blog-demo">
    <LiquidGlass class="blog-container" :scrollable="true" :render-mode="'dedicated'" :render-precision="0.5"
      :z-index="10" ref="liquidGlassRef">
      <!-- Colorful Background for Glass Effect -->
      <LgBackdropConverter>
        <template #default>
          <div class="backdrop-content">
            <!-- Hero Section with Vibrant Colors -->
            <div class="hero-section">
              <div class="hero-gradient"></div>
              <div class="hero-content">
                <h1>Liquid Glass</h1>
                <p>A Vue 3 component library for stunning glass effects</p>
              </div>
            </div>

            <!-- Content Sections with Colorful Backgrounds -->
            <section class="content-section gradient-1">
              <div class="section-inner">
                <h2>🌈 Features</h2>
                <div class="feature-grid">
                  <div class="feature-card" style="--accent: #ff6b6b">
                    <div class="feature-icon">🔮</div>
                    <h3>Realistic Refraction</h3>
                    <p>Physics-based light bending through glass materials</p>
                  </div>
                  <div class="feature-card" style="--accent: #4ecdc4">
                    <div class="feature-icon">✨</div>
                    <h3>Light Dispersion</h3>
                    <p>Rainbow chromatic aberration at glass edges</p>
                  </div>
                  <div class="feature-card" style="--accent: #a855f7">
                    <div class="feature-icon">🎯</div>
                    <h3>Touch Response</h3>
                    <p>Interactive deformation with fluid animations</p>
                  </div>
                  <div class="feature-card" style="--accent: #f59e0b">
                    <div class="feature-icon">🚀</div>
                    <h3>GPU Accelerated</h3>
                    <p>WebGL powered for smooth 60fps performance</p>
                  </div>
                </div>
              </div>
            </section>

            <section class="content-section gradient-2">
              <div class="section-inner">
                <h2>🎨 Color Palette</h2>
                <div class="color-grid">
                  <div class="color-swatch" v-for="color in colors" :key="color.hex" :style="{ background: color.hex }">
                    <span class="color-name">{{ color.name }}</span>
                  </div>
                </div>
              </div>
            </section>

            <section class="content-section gradient-3">
              <div class="section-inner">
                <h2>📝 Sample Content</h2>
                <article class="article">
                  <p class="lead">
                    Vue 3 has revolutionized the way we build user interfaces with its Composition API
                    and improved TypeScript support.
                  </p>
                  <p>
                    The web development landscape has evolved dramatically over the past few years.
                    With the release of Vue 3, developers now have access to a more powerful and
                    flexible framework that addresses many pain points of its predecessor.
                  </p>
                  <div class="code-block">
                    <pre><code>const { ref, computed } = Vue
const count = ref(0)
const doubled = computed(() => count.value * 2)</code></pre>
                  </div>
                </article>
              </div>
            </section>

            <!-- Image Gallery -->
            <section class="content-section gradient-4">
              <div class="section-inner">
                <h2>🖼️ Gallery</h2>
                <div class="gallery">
                  <div class="gallery-item" v-for="i in 6" :key="i" :style="{ background: galleryColors[i - 1] }">
                    <span>{{ i }}</span>
                  </div>
                </div>
              </div>
            </section>

            <footer class="footer">
              <p>© 2026 Liquid Glass Vue Library</p>
            </footer>
          </div>
        </template>
      </LgBackdropConverter>

      <!-- Fixed Glass Header -->
      <header class="glass-header">
        <LiquidGlassMaterial :radius="16" :thickness="19" :dispersion="0.025" class="header-glass">
          <div class="header-content">
            <h1 class="logo">✨ Liquid</h1>
            <nav class="nav-links">
              <a href="#">Home</a>
              <a href="#">Docs</a>
              <a href="#">Examples</a>
            </nav>
            <div class="header-actions">
              <button class="icon-btn" @click="showSearch = true">🔍</button>
              <button class="icon-btn" @click="showNav = !showNav">☰</button>
            </div>
          </div>
        </LiquidGlassMaterial>
      </header>

      <!-- Floating Action Button -->
      <div class="fab-container">
        <LiquidGlassMaterial :radius="28" :thickness="30" :dispersion="0.03" class="fab">
          <button class="fab-btn">↑</button>
        </LiquidGlassMaterial>
      </div>

      <!-- Navigation Drawer Overlay -->
      <Transition name="fade">
        <div v-if="showNav" class="drawer-overlay" @click="showNav = false"></div>
      </Transition>

      <!-- Navigation Drawer Glass -->
      <Transition name="slide-drawer">
        <LiquidGlassMaterial v-if="showNav" :radius="0" :radius-t-l="24" :radius-b-l="24" :thickness="30"
          :dispersion="0.02" class="drawer-glass">
          <div class="drawer-content">
            <h2>Menu</h2>
            <nav class="drawer-nav">
              <a href="#" @click="showNav = false">🏠 Home</a>
              <a href="#" @click="showNav = false">📖 Documentation</a>
              <a href="#" @click="showNav = false">🎮 Playground</a>
              <a href="#" @click="showNav = false">💡 Examples</a>
              <a href="#" @click="showNav = false">📦 Installation</a>
              <a href="#" @click="showNav = false">❓ FAQ</a>
            </nav>
          </div>
        </LiquidGlassMaterial>
      </Transition>

      <!-- Search Modal Overlay -->
      <Transition name="fade">
        <div v-if="showSearch" class="modal-overlay" @click="showSearch = false"></div>
      </Transition>

      <!-- Search Modal Glass -->
      <Transition name="fade-up">
        <LiquidGlassMaterial v-if="showSearch" :radius="24" :thickness="30" :dispersion="0.02" class="search-glass">
          <div class="search-content">
            <input type="text" placeholder="Search..." class="search-input" autofocus />
            <button class="close-btn" @click="showSearch = false">✕</button>
          </div>
        </LiquidGlassMaterial>
      </Transition>
      <!-- <LiquidGlassDebugger /> -->
    </LiquidGlass>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import { LiquidGlassDebugger } from '..';
import LgBackdropConverter from '../components/LgBackdropConverter.vue';
import LiquidGlass from '../components/LiquidGlass.vue';
import LiquidGlassMaterial from '../components/LiquidGlassMaterial.vue';

const showNav = ref(false);
const showSearch = ref(false);
const liquidGlassRef = ref<InstanceType<typeof LiquidGlass> | null>(null);

const colors = [
  { name: 'Coral', hex: '#ff6b6b' },
  { name: 'Teal', hex: '#4ecdc4' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Indigo', hex: '#6366f1' },
];

const galleryColors = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
];
</script>

<style scoped>
.blog-demo {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

* {
  font-size: 16px;
}

.blog-container {
  height: 100%;
  background: #0a0a0a;
}

/* Backdrop Content */
.backdrop-content {
  min-height: 100vh;
}

/* Hero Section */
.hero-section {
  position: relative;
  height: 50vh;
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.hero-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg,
      #667eea 0%,
      #764ba2 25%,
      #f093fb 50%,
      #f5576c 75%,
      #fa709a 100%);
}

.hero-content {
  position: relative;
  text-align: center;
  color: white;
  z-index: 1;
}

.hero-content h1 {
  font-size: 3.5rem;
  font-weight: 800;
  margin: 0;
  text-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
}

.hero-content p {
  font-size: 1.15rem;
  opacity: 0.9;
  margin-top: 12px;
}

/* Content Sections */
.content-section {
  padding: 60px 24px;
}

.gradient-1 {
  background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
}

.gradient-2 {
  background: linear-gradient(180deg, #16213e 0%, #0f3460 100%);
}

.gradient-3 {
  background: linear-gradient(180deg, #0f3460 0%, #1a1a2e 100%);
}

.gradient-4 {
  background: linear-gradient(180deg, #1a1a2e 0%, #0a0a0a 100%);
}

.section-inner {
  max-width: 900px;
  margin: 0 auto;
}

.section-inner h2 {
  color: white;
  font-size: 1.75rem;
  margin: 0 0 32px;
}

/* Feature Grid */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.feature-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
}

.feature-icon {
  font-size: 2rem;
  margin-bottom: 12px;
}

.feature-card h3 {
  color: var(--accent);
  margin: 0 0 8px;
  font-size: 1rem;
}

.feature-card p {
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
}

/* Color Grid */
.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.color-swatch {
  height: 80px;
  border-radius: 12px;
  display: flex;
  align-items: flex-end;
  padding: 10px;
}

.color-name {
  color: white;
  font-weight: 600;
  font-size: 0.8rem;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

/* Article */
.article {
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.7;
}

.article .lead {
  font-size: 1.1rem;
  border-left: 4px solid #6366f1;
  padding-left: 16px;
  margin-bottom: 20px;
}

.article p {
  margin: 0 0 16px;
}

.code-block {
  background: rgba(0, 0, 0, 0.4);
  border-radius: 12px;
  padding: 16px;
  margin: 20px 0;
  overflow-x: auto;
}

.code-block code {
  font-family: 'Fira Code', monospace;
  font-size: 0.85rem;
  color: #a5f3fc;
}

/* Gallery */
.gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.gallery-item {
  aspect-ratio: 1;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  font-weight: 800;
  color: white;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

/* Footer */
.footer {
  padding: 32px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  background: #0a0a0a;
}

/* Glass Header */
.glass-header {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  width: calc(100% - 32px);
  max-width: 700px;
}

.header-glass {
  border-radius: 16px;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
}

.logo {
  font-size: 1.2rem;
  font-weight: 700;
  color: white;
  margin: 0;
}

.nav-links {
  display: flex;
  gap: 20px;
}

.nav-links a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9rem;
}

.nav-links a:hover {
  color: white;
}

.header-actions {
  display: flex;
  gap: 6px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* FAB */
.fab-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;
}

.fab {
  border-radius: 28px;
}

.fab-btn {
  width: 50px;
  height: 50px;
  border: none;
  background: transparent;
  font-size: 1.25rem;
  cursor: pointer;
}

/* Drawer */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 199;
}

.drawer-glass {
  position: fixed;
  top: 0;
  right: 0;
  width: 260px;
  height: 100vh;
  z-index: 200;
}

.drawer-content {
  padding: 28px 20px;
  color: white;
}

.drawer-content h2 {
  margin: 0 0 20px;
  font-size: 1.25rem;
}

.drawer-nav {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drawer-nav a {
  display: block;
  padding: 12px 14px;
  color: rgba(255, 255, 255, 0.9);
  text-decoration: none;
  border-radius: 10px;
  font-size: 0.95rem;
}

.drawer-nav a:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Search Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 299;
}

.search-glass {
  position: fixed;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  width: 450px;
  max-width: 90vw;
  z-index: 300;
  border-radius: 20px;
}

.search-content {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 0.95rem;
  outline: none;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.close-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1.1rem;
  cursor: pointer;
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-drawer-enter-active,
.slide-drawer-leave-active {
  transition: transform 0.3s ease;
}

.slide-drawer-enter-from,
.slide-drawer-leave-to {
  transform: translateX(100%);
}

.fade-up-enter-active,
.fade-up-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

/* Responsive */
@media (max-width: 600px) {
  .nav-links {
    display: none;
  }

  .hero-content h1 {
    font-size: 2.5rem;
  }

  .gallery {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
