# Ablation (scale-1500, 681 buildings, 3 runs)

| View | Case | GPU ms (sd) | js render ms | frame mean ms (sd) | frame p95 ms (sd) | upload ms | upload MB | draw calls | triangles |
| ---- | ---- | ----------- | ------------ | ------------------ | ----------------- | --------- | --------- | ---------- | --------- |
| 1-street | base | 6.6 (0.1) | 15.2 | 15.8 (0.2) | 27.8 (7.4) | 0.4 | 1.70 | 324 | 12195231 |
| 3-overview | base | 7.3 (0.1) | 15.7 | 16.5 (0.2) | 33.7 (0.3) | 0.4 | 1.69 | 484 | 12385267 |
