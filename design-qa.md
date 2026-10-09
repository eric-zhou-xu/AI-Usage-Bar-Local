# 2.4.2 verification

Fixed native window: 320×332 points, content 320×300. The resize style bit is absent and minimum and maximum frame sizes are identical; each launch creates the fixed content size with no persisted size restoration. Controls, data loading, missing data and stale values retain the compact layout.

Static application icon uses a light tile, blue segmented quota ring and bold GPT text. It does not pretend to show real-time quota. The dynamic circle and menu bar retain the existing green/blue/red thresholds and exact fractional fills.

28 pure UI logic checks and 10 collector/native indicator tests pass. Native build and strict signature verification are required. Collector unchanged. No private screenshots, actual account balances, tokens or runtime logs are committed.
