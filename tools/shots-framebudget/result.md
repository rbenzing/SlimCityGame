# Frame budget (seed 7, 8762 buildings standing of 9256 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 5.0 | 1.2 | 19.1 | 6.4 | 66 | 8382809 |
| 1-street | city | 21.9 | 21.2 | 41.8 | 29.0 | 392 | 29090916 |
| 1-street | difference | 16.9 | 20.0 | 22.7 | 22.7 | 326 | 20708107 |
| 2-oblique | empty map | 5.2 | 1.4 | 18.7 | 6.4 | 78 | 8392025 |
| 2-oblique | city | 26.0 | 19.0 | 52.1 | 33.1 | 540 | 32860559 |
| 2-oblique | difference | 20.7 | 17.6 | 33.4 | 26.7 | 462 | 24468534 |
| 3-overview | empty map | 6.0 | 2.0 | 15.4 | 6.7 | 162 | 8435033 |
| 3-overview | city | 42.0 | 41.8 | 60.9 | 50.1 | 1288 | 37000492 |
| 3-overview | difference | 35.9 | 39.8 | 45.5 | 43.5 | 1126 | 28565459 |
| 4-oblique-night | empty map | 5.4 | 1.5 | 19.0 | 6.6 | 78 | 8392025 |
| 4-oblique-night | city | 29.6 | 26.6 | 66.1 | 34.4 | 549 | 32862467 |
| 4-oblique-night | difference | 24.2 | 25.1 | 47.1 | 27.7 | 471 | 24470442 |
