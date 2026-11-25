# Frame budget (seed 7, 2812 buildings standing of 6061 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 11.3 | 11.2 | 12.9 | 11.9 | 60 | 9332161 |
| 1-street | city | 24.9 | 24.6 | 27.3 | 25.5 | 439 | 21095789 |
| 1-street | difference | 13.6 | 13.4 | 14.4 | 13.6 | 379 | 11763628 |
| 2-oblique | empty map | 11.3 | 11.2 | 12.6 | 11.7 | 79 | 9343937 |
| 2-oblique | city | 27.7 | 27.7 | 30.0 | 28.6 | 575 | 21756093 |
| 2-oblique | difference | 16.4 | 16.5 | 17.4 | 16.8 | 496 | 12412156 |
| 3-overview | empty map | 12.5 | 12.3 | 14.4 | 12.9 | 164 | 9388481 |
| 3-overview | city | 36.5 | 36.6 | 52.3 | 38.8 | 1120 | 24376784 |
| 3-overview | difference | 24.1 | 24.3 | 37.9 | 25.9 | 956 | 14988303 |
| 4-oblique-night | empty map | 11.4 | 11.2 | 13.0 | 12.0 | 79 | 9343937 |
| 4-oblique-night | city | 27.3 | 27.2 | 29.7 | 28.5 | 576 | 21831693 |
| 4-oblique-night | difference | 16.0 | 16.0 | 16.7 | 16.5 | 497 | 12487756 |
| 5-water | empty map | 13.3 | 13.1 | 15.1 | 13.8 | 56 | 9331137 |
| 5-water | city | 23.0 | 23.1 | 25.2 | 23.9 | 335 | 18833189 |
| 5-water | difference | 9.8 | 10.0 | 10.1 | 10.1 | 279 | 9502052 |
