# Frame budget (seed 7, 2812 buildings standing of 6061 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 11.1 | 11.0 | 12.5 | 11.6 | 60 | 9332161 |
| 1-street | city | 24.6 | 24.5 | 26.9 | 25.5 | 439 | 21095789 |
| 1-street | difference | 13.5 | 13.5 | 14.4 | 14.0 | 379 | 11763628 |
| 2-oblique | empty map | 11.0 | 10.9 | 12.4 | 11.4 | 79 | 9343937 |
| 2-oblique | city | 26.7 | 26.5 | 29.0 | 27.6 | 575 | 21756093 |
| 2-oblique | difference | 15.6 | 15.6 | 16.6 | 16.2 | 496 | 12412156 |
| 3-overview | empty map | 12.1 | 12.0 | 13.4 | 12.6 | 164 | 9388481 |
| 3-overview | city | 36.8 | 37.0 | 52.0 | 39.2 | 1120 | 24376784 |
| 3-overview | difference | 24.7 | 25.0 | 38.6 | 26.6 | 956 | 14988303 |
| 4-oblique-night | empty map | 11.2 | 11.2 | 12.6 | 11.6 | 79 | 9343937 |
| 4-oblique-night | city | 26.8 | 26.7 | 29.3 | 27.5 | 576 | 21831693 |
| 4-oblique-night | difference | 15.6 | 15.5 | 16.7 | 15.9 | 497 | 12487756 |
| 5-water | empty map | 13.2 | 13.0 | 14.5 | 13.8 | 56 | 9331137 |
| 5-water | city | 22.7 | 22.7 | 24.7 | 23.4 | 335 | 18833189 |
| 5-water | difference | 9.6 | 9.7 | 10.2 | 9.6 | 279 | 9502052 |
