# 2.3.1 verification

- Generated purple/coral icon inspected; white gauge, green bars and transparent exterior retained.
- ICNS payload is non-empty with a valid header and length; build rejects malformed icons.
- Native application built, installed and signature verified.
- 9 collector tests plus indicator boundary tests passed (10 cases covering thresholds, missing/stale data, most-constrained window and unrelated windows).
- Live account fetch populated the menu-bar indicator state and refreshed after installation.
- Desktop capture was unavailable while the desktop showed only wallpaper; physical menu-bar placement and minimization interaction were not visually confirmed in this session. The indicator is assigned to NSStatusItem independently of window visibility.
