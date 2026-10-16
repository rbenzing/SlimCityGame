# Frame budget (seed 7, 8759 buildings standing of 9253 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 4.3 | 1.1 | 18.6 | 8.6 | 66 | 8382809 |
| 1-street | city | 22.8 | 21.5 | 50.1 | 26.8 | 392 | 29090916 |
| 1-street | difference | 18.6 | 20.4 | 31.5 | 18.3 | 326 | 20708107 |
| 2-oblique | empty map | 5.1 | 1.1 | 18.8 | 5.9 | 78 | 8392025 |
| 2-oblique | city | 26.3 | 26.7 | 59.7 | 32.5 | 540 | 32860559 |
| 2-oblique | difference | 21.2 | 25.6 | 40.9 | 26.5 | 462 | 24468534 |
| 3-overview | empty map | 5.3 | 1.5 | 14.7 | 5.9 | 162 | 8435033 |
| 3-overview | city | 40.7 | 41.8 | 51.2 | 42.0 | 1288 | 37000492 |
| 3-overview | difference | 35.4 | 40.3 | 36.5 | 36.1 | 1126 | 28565459 |
| 4-oblique-night | empty map | 4.9 | 1.2 | 18.7 | 5.7 | 78 | 8392025 |
| 4-oblique-night | city | 30.4 | 31.7 | 69.4 | 37.2 | 549 | 32862467 |
| 4-oblique-night | difference | 25.5 | 30.5 | 50.7 | 31.5 | 471 | 24470442 |
