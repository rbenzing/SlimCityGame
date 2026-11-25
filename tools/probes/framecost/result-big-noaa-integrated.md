# Frame budget (seed 7, 2812 buildings standing of 6061 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 7.7 | 7.6 | 8.9 | 8.0 | 60 | 9332161 |
| 1-street | city | 21.2 | 21.3 | 23.2 | 22.4 | 439 | 21095789 |
| 1-street | difference | 13.4 | 13.7 | 14.3 | 14.4 | 379 | 11763628 |
| 2-oblique | empty map | 7.8 | 7.7 | 9.0 | 8.0 | 79 | 9343937 |
| 2-oblique | city | 23.2 | 23.2 | 25.4 | 24.0 | 575 | 21756093 |
| 2-oblique | difference | 15.4 | 15.5 | 16.4 | 16.0 | 496 | 12412156 |
| 3-overview | empty map | 8.2 | 8.2 | 9.8 | 8.5 | 164 | 9388481 |
| 3-overview | city | 32.6 | 32.3 | 49.5 | 33.5 | 1120 | 24376784 |
| 3-overview | difference | 24.3 | 24.1 | 39.7 | 25.0 | 956 | 14988303 |
| 4-oblique-night | empty map | 7.8 | 7.7 | 9.2 | 7.9 | 79 | 9343937 |
| 4-oblique-night | city | 23.3 | 23.2 | 26.3 | 24.5 | 576 | 21831693 |
| 4-oblique-night | difference | 15.6 | 15.5 | 17.1 | 16.6 | 497 | 12487756 |
| 5-water | empty map | 9.8 | 9.7 | 11.2 | 10.6 | 56 | 9331137 |
| 5-water | city | 19.4 | 19.5 | 28.5 | 21.6 | 335 | 18833189 |
| 5-water | difference | 9.6 | 9.8 | 17.3 | 11.0 | 279 | 9502052 |
