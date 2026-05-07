/**
 * Liquid Glass — Playground Entrance
 *
 * This file is the entry point for the playground app.
 * Framework-specific demos will be mounted here as they are built.
 */

const app = document.getElementById('app')

if (!app) {
  throw new Error('Could not find #app mount point')
}

app.innerHTML = `
  <div style="
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    flex-direction: column;
    gap: 1rem;
    font-size: 1.5rem;
    color: #666;
  ">
    <h1>Liquid Glass — Playground</h1>
    <p>Framework demos coming soon.</p>
    <p style="font-size: 0.8rem;">
      Phase 0 infrastructure verified — all packages build successfully.
    </p>
  </div>
`
