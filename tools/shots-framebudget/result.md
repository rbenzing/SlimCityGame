# Frame budget (seed 7, 8759 buildings standing of 9253 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 5.1 | 1.4 | 36.6 | 12.1 | 66 | 8382809 |
| 1-street | city | 20.4 | 20.5 | 34.8 | 22.8 | 302 | 28351890 |
| 1-street | difference | 15.2 | 19.1 | -1.8 | 10.6 | 236 | 19969081 |
| 2-oblique | empty map | 6.1 | 1.4 | 18.9 | 17.8 | 78 | 8392025 |
| 2-oblique | city | 26.7 | 22.1 | 53.6 | 29.8 | 409 | 31467901 |
| 2-oblique | difference | 20.6 | 20.7 | 34.7 | 12.0 | 331 | 23075876 |
| 3-overview | empty map | 5.8 | 1.9 | 16.0 | 6.6 | 162 | 8435033 |
| 3-overview | city | 38.6 | 40.7 | 52.5 | 41.0 | 1145 | 35577244 |
| 3-overview | difference | 32.8 | 38.8 | 36.5 | 34.3 | 983 | 27142211 |
| 4-oblique-night | empty map | 5.7 | 1.5 | 18.7 | 6.8 | 78 | 8392025 |
| 4-oblique-night | city | 24.7 | 25.3 | 42.5 | 26.9 | 417 | 31469905 |
| 4-oblique-night | difference | 19.0 | 23.8 | 23.8 | 20.1 | 339 | 23077880 |
