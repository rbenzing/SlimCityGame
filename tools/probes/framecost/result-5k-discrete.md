# Frame budget (seed 7, 5023 buildings standing of 10716 planned)

Machine: ANGLE (NVIDIA, NVIDIA RTX PRO 500 Blackwell Generation Laptop GPU (0x00002DB9) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 4.5 | 4.6 | 5.7 | 4.7 | 76 | 9340353 |
| 1-street | city | 12.9 | 12.9 | 15.1 | 14.3 | 447 | 24282254 |
| 1-street | difference | 8.4 | 8.3 | 9.4 | 9.6 | 371 | 14941901 |
| 2-oblique | empty map | 4.7 | 4.6 | 5.9 | 4.7 | 79 | 9344961 |
| 2-oblique | city | 13.8 | 14.1 | 15.7 | 14.2 | 628 | 24594011 |
| 2-oblique | difference | 9.1 | 9.5 | 9.8 | 9.5 | 549 | 15249050 |
| 3-overview | empty map | 5.1 | 5.1 | 6.4 | 5.3 | 164 | 9388481 |
| 3-overview | city | 18.4 | 18.9 | 34.7 | 20.8 | 1029 | 27699180 |
| 3-overview | difference | 13.3 | 13.8 | 28.3 | 15.5 | 865 | 18310699 |
| 4-oblique-night | empty map | 4.7 | 4.6 | 5.9 | 4.8 | 79 | 9344961 |
| 4-oblique-night | city | 13.5 | 13.4 | 15.8 | 13.9 | 628 | 24594011 |
| 4-oblique-night | difference | 8.8 | 8.8 | 9.9 | 9.1 | 549 | 15249050 |
| 5-water | empty map | 5.8 | 5.7 | 7.0 | 5.9 | 56 | 9331137 |
| 5-water | city | 13.9 | 13.8 | 15.6 | 14.3 | 457 | 24012630 |
| 5-water | difference | 8.1 | 8.1 | 8.6 | 8.4 | 401 | 14681493 |
