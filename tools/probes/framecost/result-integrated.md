# Frame budget (seed 7, 1396 buildings standing of 3061 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 10.0 | 9.9 | 11.9 | 12.7 | 56 | 9330113 |
| 1-street | city | 17.5 | 16.8 | 34.8 | 20.1 | 391 | 15064664 |
| 1-street | difference | 7.4 | 6.9 | 22.9 | 7.4 | 335 | 5734551 |
| 2-oblique | empty map | 10.0 | 10.0 | 12.1 | 10.3 | 77 | 9342913 |
| 2-oblique | city | 19.0 | 19.4 | 35.1 | 21.8 | 526 | 15637113 |
| 2-oblique | difference | 9.0 | 9.4 | 23.0 | 11.5 | 449 | 6294200 |
| 3-overview | empty map | 11.2 | 11.2 | 13.2 | 13.9 | 164 | 9388481 |
| 3-overview | city | 19.6 | 19.7 | 34.4 | 21.0 | 646 | 15803933 |
| 3-overview | difference | 8.4 | 8.5 | 21.2 | 7.0 | 482 | 6415452 |
| 4-oblique-night | empty map | 10.2 | 10.0 | 32.0 | 13.9 | 77 | 9342913 |
| 4-oblique-night | city | 19.4 | 19.3 | 34.9 | 20.2 | 527 | 15669313 |
| 4-oblique-night | difference | 9.1 | 9.3 | 2.9 | 6.3 | 450 | 6326400 |
| 5-water | empty map | 11.7 | 11.6 | 32.6 | 14.9 | 56 | 9331137 |
| 5-water | city | 15.5 | 15.4 | 32.7 | 17.6 | 227 | 13599977 |
| 5-water | difference | 3.8 | 3.8 | 0.1 | 2.8 | 171 | 4268840 |
