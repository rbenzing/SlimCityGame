# Frame budget (seed 7, 8759 buildings standing of 9253 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 5.0 | 1.4 | 20.9 | 6.5 | 66 | 8382809 |
| 1-street | city | 23.6 | 13.6 | 65.6 | 34.7 | 354 | 28785162 |
| 1-street | difference | 18.7 | 12.2 | 44.7 | 28.2 | 288 | 20402353 |
| 2-oblique | empty map | 5.4 | 1.4 | 21.0 | 6.4 | 78 | 8392025 |
| 2-oblique | city | 24.9 | 24.5 | 47.0 | 28.9 | 461 | 31901797 |
| 2-oblique | difference | 19.6 | 23.1 | 26.0 | 22.5 | 383 | 23509772 |
| 3-overview | empty map | 6.2 | 2.0 | 16.1 | 6.9 | 162 | 8435033 |
| 3-overview | city | 39.9 | 44.9 | 62.5 | 44.5 | 1197 | 36012724 |
| 3-overview | difference | 33.6 | 42.9 | 46.4 | 37.5 | 1035 | 27577691 |
| 4-oblique-night | empty map | 5.3 | 1.5 | 20.2 | 6.4 | 78 | 8392025 |
| 4-oblique-night | city | 25.2 | 27.3 | 46.5 | 29.1 | 469 | 31903801 |
| 4-oblique-night | difference | 19.9 | 25.8 | 26.3 | 22.6 | 391 | 23511776 |
