# Frame budget (seed 7, 5023 buildings standing of 10716 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 7.1 | 7.0 | 9.2 | 7.3 | 76 | 9340353 |
| 1-street | city | 25.3 | 25.2 | 27.8 | 26.2 | 447 | 24282254 |
| 1-street | difference | 18.2 | 18.2 | 18.6 | 18.9 | 371 | 14941901 |
| 2-oblique | empty map | 6.9 | 6.8 | 8.8 | 7.1 | 79 | 9344961 |
| 2-oblique | city | 25.6 | 25.8 | 28.2 | 26.1 | 628 | 24594011 |
| 2-oblique | difference | 18.7 | 19.0 | 19.4 | 18.9 | 549 | 15249050 |
| 3-overview | empty map | 7.3 | 7.2 | 9.1 | 7.5 | 164 | 9388481 |
| 3-overview | city | 37.2 | 37.2 | 53.0 | 39.9 | 1029 | 27699180 |
| 3-overview | difference | 29.8 | 30.0 | 43.9 | 32.4 | 865 | 18310699 |
| 4-oblique-night | empty map | 6.8 | 6.7 | 8.5 | 6.9 | 79 | 9344961 |
| 4-oblique-night | city | 25.7 | 25.6 | 28.2 | 26.6 | 628 | 24594011 |
| 4-oblique-night | difference | 18.9 | 18.9 | 19.7 | 19.7 | 549 | 15249050 |
| 5-water | empty map | 8.1 | 8.1 | 9.6 | 8.3 | 56 | 9331137 |
| 5-water | city | 24.3 | 24.2 | 26.9 | 26.1 | 457 | 24012630 |
| 5-water | difference | 16.2 | 16.1 | 17.3 | 17.8 | 401 | 14681493 |
