# Frame budget (seed 7, 681 buildings standing of 1561 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 11.3 | 11.2 | 12.5 | 11.8 | 54 | 9329089 |
| 1-street | city | 15.5 | 15.3 | 17.3 | 15.9 | 324 | 12195231 |
| 1-street | difference | 4.2 | 4.1 | 4.8 | 4.1 | 270 | 2866142 |
| 2-oblique | empty map | 11.4 | 11.3 | 13.1 | 12.4 | 72 | 9339329 |
| 2-oblique | city | 17.4 | 16.6 | 34.5 | 21.2 | 431 | 12510834 |
| 2-oblique | difference | 6.0 | 5.3 | 21.4 | 8.8 | 359 | 3171505 |
| 3-overview | empty map | 11.5 | 11.4 | 12.9 | 12.1 | 163 | 9387969 |
| 3-overview | city | 17.9 | 17.5 | 34.6 | 19.4 | 484 | 12385267 |
| 3-overview | difference | 6.4 | 6.1 | 21.7 | 7.3 | 321 | 2997298 |
| 4-oblique-night | empty map | 11.6 | 11.5 | 13.1 | 11.8 | 72 | 9339329 |
| 4-oblique-night | city | 16.8 | 16.7 | 34.1 | 19.7 | 432 | 12523234 |
| 4-oblique-night | difference | 5.2 | 5.2 | 21.0 | 7.8 | 360 | 3183905 |
| 5-water | empty map | 12.4 | 12.4 | 13.9 | 12.7 | 56 | 9331137 |
| 5-water | city | 14.1 | 14.0 | 16.8 | 14.5 | 206 | 11448907 |
| 5-water | difference | 1.7 | 1.6 | 2.9 | 1.9 | 150 | 2117770 |
