import { createApp } from 'vue';

// Demo Switcher for browsing all demos
import App from './demo/DemoSwitcher.vue';

// Individual demos (uncomment to use directly):
// import App from './demo/LiquidGlassBlogDemo.vue';
// import App from './demo/LiquidGlassShowcase.vue';
// import App from './demo/LiquidGlassPlayground.vue';
// import App from './demo/MultiGlassDemo.vue';

// Development:
// import App from './App.vue';

createApp(App).mount('#app');
