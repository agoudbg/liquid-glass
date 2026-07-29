# Legacy Visual Oracle

This harness renders deterministic scenarios against the exact legacy commit
`345a9be6906bcc8a801208054e7fe134c6bfe641`. The capture script resolves the
requested revision to its full commit SHA before creating an isolated Git
archive, and the analyzer records that resolved SHA instead of assuming a
hard-coded source. The rewrite runtime never imports the archive.

The six scenarios correspond to the first six rewrite acceptance scenarios:

| ID | Legacy capability |
| --- | --- |
| S001 | Static material over a custom canvas backdrop |
| S002 | Multiple overlapping materials and render order |
| S003 | DOM capture and manual refresh |
| S004 | Button, context-menu, and slider interaction presets |
| S005 | Body scrolling with a fixed material |
| S006 | Internal scrolling, sticky material, and viewport capture |

Capture is performed in the pinned Chrome for Testing `150.0.7871.129`
distribution at 1440 by 900 CSS pixels with explicit DPR 1 and DPR 2 contexts.
Each scene is reconstructed and captured 20 times. The analyzer ignores RGB
channel deltas of three or less, records the maximum self-diff, and computes the
threshold as
`min(0.5%, max(0.1%, 3 * selfDiff))`.

The legacy ready flag only confirms that the fixture mounted; it does not prove
that the public uniform canvas received the internal WebGL output. After fonts
are ready, the capture dispatches one deterministic window resize event and
polls `canvas.liquid-glass-uniform-canvas` until more than 1,000 pixels have
non-zero alpha. Every glass-on capture and every transition into glass-off is
guarded by the same check. Schema version 3 records the exact public canvas
classes, physical dimensions, and non-transparent pixel count for every scene
and DPR, plus the content-addressed repository toolchain, host, browser,
normalized effective Chrome switches, WebGL, and browser-context contract used
by the capture. A tint-only screenshot with a transparent glass canvas
therefore cannot become a valid oracle, and a toolchain or capture-environment
drift cannot be mistaken for visual parity.

Run 1 also preserves the public canvas backing store itself at
`visual/dpr-{1,2}/S00{1..6}-canvas.png`. The capture calls
`HTMLCanvasElement.toDataURL("image/png")` and transfers the resulting browser
download with Playwright `Download.saveAs`; it never substitutes an element
screenshot. Serialization occurs immediately after scene preparation and
before any full-page screenshot. The same synchronous browser task records a
raw-specific alpha count because an active legacy spring can advance between
separate readiness samples. During a publishable full capture, the analyzer
validates both DPR metadata files against the capture contract, decodes every
raw PNG, requires RGBA encoding, checks its physical dimensions against the
public canvas, verifies its exact serialized alpha count, and writes the
schema 3 calibration report with content-addressed artifact paths.

Run from the repository root:

```powershell
$chromePath = & .\scripts\visual\run-visual-parity.ps1 -PrepareOnly
$env:LIQUID_GLASS_VISUAL_CHROME_PATH = $chromePath
& .\scripts\legacy\capture-legacy-oracle.ps1
```

Single-DPR captures are available for diagnosing environment or scene-specific
failures:

```powershell
& .\scripts\legacy\capture-legacy-oracle.ps1 -DevicePixelRatios 2
```

Partial and glass-off-only captures must resolve to the same source commit as
the existing calibration report. They write only to the isolated run directory
reported by the script and never update the committed oracle. A publishable
baseline always requires one uninterrupted full capture at both DPR 1 and DPR
2, so every committed artifact shares one capture ID and browser identity.

The glass-off control disables the WebGL canvas and the material tint,
highlight, border, and shadow while retaining backdrop and content. A focused
diagnostic capture verifies a non-empty glass-on public canvas before disabling
the effect. Every invocation receives a unique capture ID and saves its current
browser metadata in the isolated capture directory:

```powershell
& .\scripts\legacy\capture-legacy-oracle.ps1 -GlassOffOnly
```

The script installs JavaScript dependencies only inside its isolated temporary
copy and uses a separate Codex pnpm store. It uses the globally installed
`playwright-cli` and the explicitly selected browser; the capture script itself
never downloads a browser. The preparation command downloads the official
archive once, verifies its SHA-256, and revalidates the calibrated distribution
files on reuse. `LIQUID_GLASS_VISUAL_CHROME_EXECUTABLE` remains a compatibility
alias for `LIQUID_GLASS_VISUAL_CHROME_PATH`.
All screenshots, raw canvases, metadata, and the generated calibration report
are written to a same-volume staging directory first. The script verifies the
exact 38 visual artifacts and 240 calibration screenshots, runs the analyzer
once against that complete staged capture, revalidates the repository capture
contract, and checks that the committed baseline did not change during capture.
Only then does it promote the complete staged directory with a recoverable
directory exchange. Failed staging output is moved to the isolated run
directory instead of leaving an untracked directory in the repository.
