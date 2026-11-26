# Frame budget (seed 7, 5023 buildings standing of 10716 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 11.1 | 10.9 | 13.0 | 11.4 | 76 | 9340353 |
| 1-street | city | 29.1 | 29.2 | 31.1 | 30.2 | 447 | 24282254 |
| 1-street | difference | 18.0 | 18.3 | 18.1 | 18.7 | 371 | 14941901 |
| 2-oblique | empty map | 11.0 | 10.9 | 12.4 | 11.7 | 79 | 9344961 |
| 2-oblique | city | 29.2 | 29.5 | 32.3 | 30.6 | 628 | 24594011 |
| 2-oblique | difference | 18.2 | 18.6 | 19.9 | 18.9 | 549 | 15249050 |
| 3-overview | empty map | 12.1 | 12.0 | 13.4 | 12.6 | 164 | 9388481 |
| 3-overview | city | 42.1 | 42.3 | 44.7 | 43.9 | 1029 | 27699180 |
| 3-overview | difference | 30.0 | 30.3 | 31.3 | 31.3 | 865 | 18310699 |
| 4-oblique-night | empty map | 11.1 | 10.9 | 13.2 | 11.9 | 79 | 9344961 |
| 4-oblique-night | city | 28.7 | 28.7 | 31.7 | 30.2 | 628 | 24594011 |
| 4-oblique-night | difference | 17.6 | 17.8 | 18.5 | 18.4 | 549 | 15249050 |
| 5-water | empty map | 13.0 | 12.9 | 14.5 | 13.7 | 56 | 9331137 |
| 5-water | city | 27.6 | 27.5 | 30.7 | 29.2 | 457 | 24012630 |
| 5-water | difference | 14.6 | 14.6 | 16.2 | 15.5 | 401 | 14681493 |
