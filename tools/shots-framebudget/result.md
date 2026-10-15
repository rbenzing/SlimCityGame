# Frame budget (seed 7, 8759 buildings standing of 9253 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 5.6 | 1.3 | 18.7 | 6.8 | 66 | 8382809 |
| 1-street | city | 24.3 | 16.6 | 71.1 | 32.3 | 354 | 28813818 |
| 1-street | difference | 18.7 | 15.3 | 52.4 | 25.5 | 288 | 20431009 |
| 2-oblique | empty map | 5.7 | 1.4 | 19.0 | 6.7 | 78 | 8392025 |
| 2-oblique | city | 29.2 | 32.6 | 51.6 | 32.4 | 506 | 32606949 |
| 2-oblique | difference | 23.5 | 31.2 | 32.6 | 25.7 | 428 | 24214924 |
| 3-overview | empty map | 5.9 | 1.5 | 15.8 | 6.6 | 162 | 8435033 |
| 3-overview | city | 44.5 | 43.9 | 65.9 | 47.4 | 1243 | 36731148 |
| 3-overview | difference | 38.6 | 42.4 | 50.1 | 40.9 | 1081 | 28296115 |
| 4-oblique-night | empty map | 5.2 | 1.2 | 18.3 | 8.0 | 78 | 8392025 |
| 4-oblique-night | city | 28.5 | 29.3 | 49.0 | 30.9 | 515 | 32608977 |
| 4-oblique-night | difference | 23.4 | 28.1 | 30.7 | 22.9 | 437 | 24216952 |
