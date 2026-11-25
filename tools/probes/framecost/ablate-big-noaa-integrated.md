# Ablation (big-noaa-integrated, 2812 buildings, 3 runs, no antialiasing)

| View | Case | GPU ms (sd) | js render ms | frame mean ms (sd) | frame p95 ms (sd) | upload ms | upload MB | draw calls | triangles |
| ---- | ---- | ----------- | ------------ | ------------------ | ----------------- | --------- | --------- | ---------- | --------- |
| 1-street | base | 12.2 (0.2) | 20.4 | 20.9 (0.3) | 22.6 (0.2) | 0.4 | 2.08 | 439 | 21095789 |
| 3-overview | base | 23.0 (0.4) | 31.3 | 32.0 (0.2) | 36.9 (4.9) | 21.3 | 2.32 | 1120 | 24376784 |
