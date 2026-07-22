# Legacy Visual Oracle

This harness renders deterministic scenarios against the exact legacy commit
`345a9be6906bcc8a801208054e7fe134c6bfe641`. It is copied into an isolated Git
archive by `scripts/legacy/capture-legacy-oracle.ps1`; the rewrite runtime never
imports it.

The six scenarios correspond to the first six rewrite acceptance scenarios:

| ID | Legacy capability |
| --- | --- |
| S001 | Static material over a custom canvas backdrop |
| S002 | Multiple overlapping materials and render order |
| S003 | DOM capture and manual refresh |
| S004 | Button, context-menu, and slider interaction presets |
| S005 | Body scrolling with a fixed material |
| S006 | Internal scrolling, sticky material, and viewport capture |

Capture is performed in installed Google Chrome at 1440 by 900 CSS pixels with
explicit DPR 1 and DPR 2 contexts. Each scene is reconstructed and captured 20
times. The analyzer ignores RGB channel deltas of three or less, records the
maximum self-diff, and computes the threshold as
`min(0.5%, max(0.1%, 3 * selfDiff))`.

Run from the repository root:

```powershell
& .\scripts\legacy\capture-legacy-oracle.ps1
```

After one DPR has completed successfully, a failed second-DPR refresh can be
resumed without recapturing the valid metadata and screenshots:

```powershell
& .\scripts\legacy\capture-legacy-oracle.ps1 -DevicePixelRatios 2
```

The glass-off control disables the WebGL canvas and the material tint,
highlight, border, and shadow while retaining backdrop and content. A focused
refresh of those comparison images is available without recalibrating runs:

```powershell
& .\scripts\legacy\capture-legacy-oracle.ps1 -GlassOffOnly
```

The script installs JavaScript dependencies only inside its isolated temporary
copy and uses a separate Codex pnpm store. It uses the globally installed
`playwright-cli` and installed Chrome channel; it never downloads a browser.
