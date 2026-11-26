# Frame budget (seed 7, 1396 buildings standing of 3061 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 8.0 | 7.9 | 10.0 | 8.4 | 56 | 9330113 |
| 1-street | city | 13.3 | 13.2 | 15.3 | 13.9 | 391 | 15064664 |
| 1-street | difference | 5.2 | 5.3 | 5.3 | 5.6 | 335 | 5734551 |
| 2-oblique | empty map | 7.0 | 6.9 | 8.7 | 7.4 | 77 | 9342913 |
| 2-oblique | city | 15.6 | 15.4 | 32.2 | 17.4 | 526 | 15637113 |
| 2-oblique | difference | 8.6 | 8.5 | 23.5 | 10.0 | 449 | 6294200 |
| 3-overview | empty map | 7.3 | 7.2 | 13.3 | 9.0 | 164 | 9388481 |
| 3-overview | city | 15.3 | 15.3 | 17.3 | 15.9 | 646 | 15803933 |
| 3-overview | difference | 8.0 | 8.1 | 4.0 | 6.9 | 482 | 6415452 |
| 4-oblique-night | empty map | 6.9 | 6.7 | 8.6 | 7.4 | 77 | 9342913 |
| 4-oblique-night | city | 15.7 | 15.6 | 33.1 | 16.6 | 527 | 15669313 |
| 4-oblique-night | difference | 8.9 | 8.9 | 24.5 | 9.1 | 450 | 6326400 |
| 5-water | empty map | 8.2 | 8.1 | 9.9 | 8.5 | 56 | 9331137 |
| 5-water | city | 12.6 | 12.4 | 14.8 | 13.3 | 227 | 13599977 |
| 5-water | difference | 4.4 | 4.3 | 4.9 | 4.8 | 171 | 4268840 |
