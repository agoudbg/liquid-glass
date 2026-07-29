# Visual Baseline Policy

Committed visual baselines are correct and intentional. They are executable
compatibility evidence, not disposable test output.

## Files That Belong In Git

The legacy oracle includes:

- `tests/baselines/legacy/visual/dpr-{1,2}/S00{1..6}-glass-on.png`
- `tests/baselines/legacy/visual/dpr-{1,2}/S00{1..6}-glass-off.png`
- `tests/baselines/legacy/visual/dpr-{1,2}/S00{1..6}-canvas.png`
- browser metadata for DPR 1 and DPR 2;
- `visual-calibration.json`;
- the legacy manifest and physics traces.

Playground regression snapshots stored beside
`tests/browser/workbench-visual.spec.ts` also belong in Git.

These artifacts make optical drift reviewable and allow CI to compare against a
fixed legacy result. A file such as
`tests/baselines/legacy/visual/dpr-2/S005-glass-off.png` should therefore remain
tracked.

## Files That Do Not Belong In Git

The following stay ignored:

- `test-results/`
- Playwright reports;
- actual/diff screenshots from failed runs;
- partial legacy captures;
- staging, backup, quarantine, and lock directories;
- runtime performance and stability JSON generated for one machine;
- arbitrary manual screenshots without provenance.

## Promotion Rules

Never overwrite a baseline just to make a test green.

A publishable legacy update requires:

1. one uninterrupted full capture at DPR 1 and DPR 2;
2. the fixed source commit;
3. the installed Chrome channel and recorded browser identity;
4. all expected screenshots, raw canvas PNGs, and metadata;
5. successful self-diff calibration and glass-on/off checks;
6. transactional promotion through the repository script;
7. an explicit review explanation for the intended change.

Partial and glass-off-only runs are diagnostic and cannot update committed
baselines.

## Why Glass-Off Images Are Kept

Glass-on alone proves that an image exists. The glass-off control preserves
backdrop and content while removing the WebGL canvas and material appearance.
Comparing both states proves that the glass implementation causes the measured
pixel change.

## Raw Canvas Images

`*-canvas.png` files are serialized from the public presentation canvas backing
store. They are not element screenshots and do not contain unrelated DOM
compositing. Metadata records exact dimensions and non-transparent alpha counts.

## Privacy

Only deterministic local fixtures may be promoted. Never commit captures of
consumer pages, authenticated content, private data, or network-fetched assets.
