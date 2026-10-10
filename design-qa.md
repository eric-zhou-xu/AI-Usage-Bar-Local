# 2.4.3 verification

Fixed native window: 320×332 points, content 320×300. The resize style bit is absent and minimum and maximum frame sizes are identical; each launch creates the fixed content size with no persisted size restoration. Controls, data loading, missing data and stale values retain the compact layout.

Static application icon uses a light tile, blue segmented quota ring and bold GPT text. It does not pretend to show real-time quota. The dynamic circle and menu bar retain the existing green/blue/red thresholds and exact fractional fills.

28 pure UI logic checks and 10 collector/native indicator tests pass. Native build and strict signature verification are required. Collector unchanged. No private screenshots, actual account balances, tokens or runtime logs are committed.

The app Info.plist sets LSMultipleInstancesProhibited. Native QA used a different bundle ID and separate cache; it was exited and archived. Real usage cache was checked and contains no synthetic fixture balance or reset time. Only one formal process remained.


# 2.4.4 verification

28 Python tests and 30 pure UI checks cover sparse fields, valid zero values, missing details, out-of-order responses, quiet streams, reconnect/wake/reset triggers, ten-minute timing, coalescing, and the read-only method allowlist. Native build and strict signing verification passed. The 2.4.3 fixed window, icon and indicator thresholds are unchanged.

The installed observer maintained a real stdio connection, recovered after its owned server was terminated, rejected a second observer, and completed multiple actual ten-minute compensation reads with a visible quota update. Wake compensation was exercised using the same marker as the UI handler. Actual OS sleep was not performed; no real quota event arrived during this observation. Event parsing/merge was tested only with isolated fixtures; cross-device and cross-server event delivery is not guaranteed. No private runtime cache, screenshots, credentials, or logs are committed.
