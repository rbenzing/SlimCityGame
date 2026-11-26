# Ablation (scale-6000, 2812 buildings, 3 runs)

| View | Case | GPU ms (sd) | js render ms | frame mean ms (sd) | frame p95 ms (sd) | upload ms | upload MB | draw calls | triangles |
| ---- | ---- | ----------- | ------------ | ------------------ | ----------------- | --------- | --------- | ---------- | --------- |
| 1-street | base | 12.9 (0.1) | 23.8 | 24.6 (0.2) | 26.9 (0.5) | 0.5 | 2.08 | 439 | 21095789 |
| 3-overview | base | 23.0 (0.4) | 34.9 | 35.7 (0.2) | 52.6 (0.2) | 23.9 | 2.32 | 1120 | 24376784 |
