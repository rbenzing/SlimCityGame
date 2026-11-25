# Ablation (scale-500, 198 buildings, 3 runs)

| View | Case | GPU ms (sd) | js render ms | frame mean ms (sd) | frame p95 ms (sd) | upload ms | upload MB | draw calls | triangles |
| ---- | ---- | ----------- | ------------ | ------------------ | ----------------- | --------- | --------- | ---------- | --------- |
| 1-street | base | 4.4 (0.2) | 11.9 | 12.4 (0.4) | 14.6 (1.1) | 1.7 | 1.56 | 240 | 10000071 |
| 3-overview | base | 4.6 (0.2) | 11.6 | 12.1 (0.2) | 13.9 (0.2) | 8.0 | 1.46 | 273 | 9745287 |
