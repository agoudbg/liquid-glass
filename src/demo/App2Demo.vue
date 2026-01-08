<template>
  <div class="page-container">
    <LiquidGlass :render-precision="0.8">
      <div class="float-header">
        <div class="left">
          <div class="button">
            <LiquidGlassMaterial :blur="1" :radius="20">
              <span>H</span>
            </LiquidGlassMaterial>
          </div>
        </div>
        <div class="center">
          <div class="button">
            <LiquidGlassMaterial :blur="2" :radius="10">
              <span>My Tiny Blog</span>
            </LiquidGlassMaterial>
          </div>
        </div>
        <div class="right">
          <div class="button">
            <LiquidGlassMaterial :blur="4" :radius="10">
              <span>About</span>
            </LiquidGlassMaterial>
          </div>
        </div>
      </div>
      <div class="main-content">
        <LiquidGlass :scrollable="true">
          <LgBackdropConverter :capture-lib="'html-to-image'">
            <div class="blog">
              <header class="site-header">
                <h1 class="site-title">My Tiny Blog</h1>
                <p class="site-subtitle">A small example page built with Vue — for demos and testing.</p>
              </header>

              <div class="container">
                <main class="content">
                  <div class="controls">
                    <input v-model="search" placeholder="Search posts..." class="search" />
                  </div>

                  <section class="posts">
                    <article v-for="post in filteredPosts" :key="post.id" class="post-card" @click="selectPost(post)">
                      <h2 class="post-title">{{ post.title }}</h2>
                      <div class="meta">{{ formatDate(post.date) }} · <span class="tag" v-for="t in post.tags"
                          :key="t">{{
                            t
                          }}</span></div>
                      <p class="excerpt">{{ post.excerpt }}</p>
                      <button class="read-more" @click.stop="selectPost(post)">Read</button>
                    </article>
                    <p v-if="filteredPosts.length === 0" class="no-results">No posts matched your query.</p>
                  </section>

                  <section v-if="selected" class="post-detail">
                    <h2>{{ selected.title }}</h2>
                    <div class="meta">{{ formatDate(selected.date) }} · <span class="tag" v-for="t in selected.tags"
                        :key="t">{{
                          t
                        }}</span></div>
                    <div class="body" v-html="selected.body"></div>
                    <button class="close" @click="selected = null">Close</button>
                  </section>
                </main>

                <aside class="sidebar">
                  <section class="about">
                    <h3>About</h3>
                    <p>Just a minimal demo page to show how `App2.vue` can look as a simple blog layout.</p>
                  </section>

                  <section class="recent">
                    <h3>Recent Posts</h3>
                    <ul>
                      <li v-for="p in recentPosts" :key="p.id">{{ p.title }}</li>
                    </ul>
                  </section>
                </aside>
              </div>

              <footer class="site-footer">© {{ new Date().getFullYear() }} — Tiny Blog Demo</footer>
            </div>
          </LgBackdropConverter>
        </LiquidGlass>
      </div>
      <!-- <LiquidGlassDebugger /> -->
    </LiquidGlass>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import LiquidGlassMaterial from '../components/LiquidGlassMaterial.vue';
import { LgBackdropConverter, LiquidGlass, LiquidGlassDebugger } from '../index';

type Post = {
  id: number
  title: string
  date: string
  tags: string[]
  excerpt: string
  body: string
}

const posts = ref<Post[]>([
  {
    id: 1,
    title: 'Getting started with Liquid Glass',
    date: '2025-12-01',
    tags: ['ui', 'canvas'],
    excerpt: 'An introductory look at building a Liquid Glass effect on the web.',
    body: `
      <p>Liquid Glass materials can be created using HTML5 canvas and WebGL. Start by setting up a canvas element and initializing a rendering context.</p>
      <p>Use shaders to create the refractive and blurred effects characteristic of Liquid Glass. Experiment with different parameters to achieve the desired look.</p>
      <h2>Basic Setup</h2>
      <pre><code>&lt;canvas id="liquid-glass-canvas"&gt;&lt;/canvas&gt;
const canvas = document.getElementById('liquid-glass-canvas');
const ctx = canvas.getContext('webgl');</code></pre>
      <h2>Shaders</h2>
      <p>Write vertex and fragment shaders to handle the rendering of the Liquid Glass effect.</p>
      <pre><code>// Vertex Shader
attribute vec4 a_position;  

</code></pre>
      <p>With these basics, you can start building more complex Liquid Glass effects by layering multiple shaders and adding interactivity.</p

<h2>Further Exploration</h2>
      <p>Explore additional features such as dynamic lighting, reflections,
      and user interactions to enhance the Liquid Glass experience.</p>

      <p>Happy coding!</p>
      
      `,
  },
  {
    id: 2,
    title: 'Performance tips for canvas',
    date: '2025-11-18',
    tags: ['performance'],
    excerpt: 'Small, practical optimizations to keep animations smooth.',
    body: '<p>Use <code>ImageBitmap</code> and transferable objects, keep draw calls minimal, and push heavy raster work into workers.</p>',
  },
  {
    id: 3,
    title: 'Designing for glass-like materials',
    date: '2025-10-05',
    tags: ['design'],
    excerpt: 'Visual language and affordances for semi-transparent UI elements.',
    body: '<p>Consider contrast and accessible color choices when using blurred or refractive surfaces to avoid readability issues.</p>',
  },
]);

const search = ref('');
const selected = ref<Post | null>(null);

const filteredPosts = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return posts.value;
  return posts.value.filter((p) => (
    p.title.toLowerCase().includes(q)
    || p.excerpt.toLowerCase().includes(q)
    || p.tags.join(' ').toLowerCase().includes(q)
  ));
});

const recentPosts = computed(() => posts.value.slice(0, 3));

function formatDate(s: string) {
  const d = new Date(s);
  return d.toLocaleDateString();
}

function selectPost(p: Post) {
  selected.value = p;
  // scroll into view for small screens
  setTimeout(() => {
    const el = document.querySelector('.post-detail') as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 10);
}
</script>

<style scoped>
.page-container {
  height: 100vh;
  overflow: hidden;
  padding: 0;
  margin: 0;
}

.float-header {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 12px 24px;
  position: fixed;
  top: 0;
  z-index: 10002;
}

.float-header .left,
.float-header .center,
.float-header .right {
  display: flex;
  align-items: center;
}

.float-header .main {
  padding: 0 24px;
}

.float-header .button span {
  display: block;
  margin: 0 6px;
  padding: 10px;
  cursor: pointer;
}

.main-content {
  height: calc(100vh - 80px);
  overflow: auto;
}

.blog {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;
  color: #111;
  padding: 24px;
}

.site-header {
  text-align: center;
  margin-bottom: 18px
}

.site-title {
  margin: 0;
  font-size: 28px
}

.site-subtitle {
  margin: 4px 0 0;
  color: #555
}

.container {
  display: flex;
  gap: 24px;
  align-items: flex-start
}

.content {
  flex: 1
}

.sidebar {
  width: 260px
}

.controls {
  margin-bottom: 12px
}

.search {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px
}

.posts {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px
}

.post-card {
  padding: 14px;
  border: 1px solid #eee;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: transform .14s ease, box-shadow .14s ease
}

.post-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 18px rgba(15, 15, 15, 0.06)
}

.post-title {
  margin: 0 0 6px
}

.meta {
  font-size: 12px;
  color: #777;
  margin-bottom: 8px
}

.tag {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 8px;
  margin-left: 6px;
  font-size: 11px
}

.excerpt {
  margin: 0 0 8px;
  color: #333
}

.read-more {
  background: #2b6cb0;
  color: white;
  border: none;
  padding: 6px 10px;
  border-radius: 6px
}

.post-detail {
  margin-top: 18px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid #eee;
  background: #fff
}

.post-detail .body {
  margin-top: 12px;
  color: #222
}

.close {
  margin-top: 12px;
  background: #e2e8f0;
  border: none;
  padding: 6px 10px;
  border-radius: 6px
}

.about,
.recent {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  background: #fafafa
}

.site-footer {
  text-align: center;
  margin-top: 20px;
  color: #666
}

.no-results {
  color: #888
}

@media (max-width: 900px) {
  .container {
    flex-direction: column
  }

  .sidebar {
    width: 100%
  }
}
</style>
