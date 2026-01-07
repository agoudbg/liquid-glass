<template>
  <div class="demo-switcher">
    <!-- Demo Content -->
    <div class="demo-content">
      <Suspense>
        <component :is="currentComponent" />
      </Suspense>
    </div>

    <!-- Demo Navigation (Bottom Left) -->
    <nav class="demo-nav" :class="{ collapsed: isCollapsed }">
      <button class="toggle-btn" @click="isCollapsed = !isCollapsed">
        {{ isCollapsed ? '▶' : '◀' }}
      </button>
      <div class="nav-items" v-show="!isCollapsed">
        <button
          v-for="demo in demos"
          :key="demo.id"
          :class="['nav-btn', { active: currentDemo === demo.id }]"
          @click="currentDemo = demo.id"
          :title="demo.label"
        >
          <span class="nav-icon">{{ demo.icon }}</span>
          <span class="nav-label">{{ demo.label }}</span>
        </button>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';

// Define demos
const demos = [
  {
    id: 'blog',
    label: 'Blog Demo',
    icon: '📝',
    component: defineAsyncComponent(() => import('./LiquidGlassBlogDemo.vue')),
  },
  {
    id: 'showcase',
    label: 'Showcase',
    icon: '🎨',
    component: defineAsyncComponent(() => import('./LiquidGlassShowcase.vue')),
  },
  {
    id: 'playground',
    label: 'Playground',
    icon: '🎮',
    component: defineAsyncComponent(() => import('./LiquidGlassPlayground.vue')),
  },
  {
    id: 'multi',
    label: 'Multi Glass',
    icon: '💎',
    component: defineAsyncComponent(() => import('./MultiGlassDemo.vue')),
  },
  {
    id: 'app',
    label: 'App Demo',
    icon: '🧪',
    component: defineAsyncComponent(() => import('./AppDemo.vue')),
  },
  {
    id: 'app2',
    label: 'App2 Demo',
    icon: '📰',
    component: defineAsyncComponent(() => import('./App2Demo.vue')),
  },
];

const currentDemo = ref('blog');
const isCollapsed = ref(false);

const currentComponent = computed(() => {
  const demo = demos.find(d => d.id === currentDemo.value);
  return demo?.component;
});
</script>

<style scoped>
.demo-switcher {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: hidden;
  background: #0a0a0a;
}

/* Demo Content */
.demo-content {
  position: absolute;
  inset: 0;
}

.demo-content > * {
  width: 100%;
  height: 100%;
}

/* Navigation (Bottom Left) */
.demo-nav {
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 2147483647;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}

.toggle-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  font-size: 0.9rem;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: background 0.2s;
}

.toggle-btn:hover {
  background: rgba(40, 40, 40, 0.9);
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 12px;
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-height: calc(100vh - 100px);
  overflow-y: auto;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  text-align: left;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.nav-btn.active {
  background: rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
}

.nav-icon {
  font-size: 1.1rem;
  width: 24px;
  text-align: center;
}

.nav-label {
  font-weight: 500;
}

/* Responsive */
@media (max-width: 500px) {
  .nav-label {
    display: none;
  }
  
  .nav-btn {
    padding: 10px 12px;
  }
}
</style>
