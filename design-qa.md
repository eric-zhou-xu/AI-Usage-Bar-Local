# 2.4.1 verification

- Actual native window reduced from 640×602 to 320×332 points; content reduced from 640×570 to 320×300.
- Light single-circle layout inspected in the native running app. Text and controls remain readable without clipping or horizontal scrolling.
- 27 pure UI logic checks cover quota thresholds, exact fractional pillar fills, success/stale/missing states, reset-time formatting, and layout widths 320/400/640.
- Collector unchanged. Collector and native indicator tests must pass before release.
- Native app compiles and strict ad-hoc signature verification passes.
- Native content background is opaque; app-content capture pixel alpha is fully opaque. No runtime screenshots or account values are committed.
- Legacy release assets are not replaced by this source update.
