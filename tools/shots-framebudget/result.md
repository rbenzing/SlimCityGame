# Frame budget (seed 7, 8762 buildings standing of 9256 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 5.5 | 1.3 | 18.4 | 6.8 | 66 | 8382809 |
| 1-street | city | 25.2 | 22.4 | 60.2 | 35.8 | 392 | 29090916 |
| 1-street | difference | 19.7 | 21.1 | 41.8 | 29.0 | 326 | 20708107 |
| 2-oblique | empty map | 5.7 | 1.3 | 18.7 | 6.7 | 78 | 8392025 |
| 2-oblique | city | 26.5 | 23.5 | 51.5 | 32.9 | 540 | 32860559 |
| 2-oblique | difference | 20.8 | 22.2 | 32.8 | 26.2 | 462 | 24468534 |
| 3-overview | empty map | 6.1 | 1.9 | 16.6 | 6.9 | 162 | 8435033 |
| 3-overview | city | 41.9 | 41.1 | 62.8 | 49.0 | 1288 | 37000492 |
| 3-overview | difference | 35.8 | 39.2 | 46.2 | 42.0 | 1126 | 28565459 |
| 4-oblique-night | empty map | 6.0 | 1.3 | 19.4 | 13.3 | 78 | 8392025 |
| 4-oblique-night | city | 25.6 | 23.3 | 49.7 | 29.0 | 549 | 32862467 |
| 4-oblique-night | difference | 19.6 | 22.0 | 30.3 | 15.6 | 471 | 24470442 |
