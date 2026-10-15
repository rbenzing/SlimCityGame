# Frame budget (seed 7, 8759 buildings standing of 9253 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 5.5 | 1.6 | 18.6 | 7.2 | 66 | 8382809 |
| 1-street | city | 24.1 | 17.0 | 74.1 | 26.7 | 282 | 27214214 |
| 1-street | difference | 18.6 | 15.4 | 55.5 | 19.5 | 216 | 18831405 |
| 2-oblique | empty map | 5.5 | 1.3 | 18.7 | 6.4 | 78 | 8392025 |
| 2-oblique | city | 27.7 | 16.2 | 79.9 | 34.1 | 389 | 30330225 |
| 2-oblique | difference | 22.2 | 14.9 | 61.2 | 27.7 | 311 | 21938200 |
| 3-overview | empty map | 6.2 | 2.3 | 16.0 | 7.0 | 162 | 8435033 |
| 3-overview | city | 42.3 | 41.6 | 57.0 | 44.4 | 1125 | 34439568 |
| 3-overview | difference | 36.1 | 39.3 | 41.0 | 37.4 | 963 | 26004535 |
| 4-oblique-night | empty map | 5.7 | 1.6 | 19.0 | 7.5 | 78 | 8392025 |
| 4-oblique-night | city | 26.5 | 17.1 | 68.2 | 32.1 | 397 | 30332229 |
| 4-oblique-night | difference | 20.7 | 15.5 | 49.2 | 24.5 | 319 | 21940204 |
