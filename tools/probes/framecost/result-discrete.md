# Frame budget (seed 7, 1396 buildings standing of 3061 planned)

Machine: ANGLE (NVIDIA, NVIDIA RTX PRO 500 Blackwell Generation Laptop GPU (0x00002DB9) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 4.6 | 4.2 | 6.1 | 7.3 | 56 | 9330113 |
| 1-street | city | 6.9 | 5.6 | 9.5 | 9.6 | 391 | 15064664 |
| 1-street | difference | 2.3 | 1.4 | 3.4 | 2.2 | 335 | 5734551 |
| 2-oblique | empty map | 5.0 | 4.6 | 6.5 | 6.0 | 77 | 9342913 |
| 2-oblique | city | 7.5 | 6.8 | 11.0 | 10.3 | 526 | 15637113 |
| 2-oblique | difference | 2.5 | 2.2 | 4.5 | 4.3 | 449 | 6294200 |
| 3-overview | empty map | 5.1 | 4.8 | 6.7 | 6.9 | 164 | 9388481 |
| 3-overview | city | 8.6 | 7.7 | 9.4 | 11.0 | 646 | 15803933 |
| 3-overview | difference | 3.5 | 2.9 | 2.7 | 4.1 | 482 | 6415452 |
| 4-oblique-night | empty map | 4.6 | 4.5 | 6.1 | 4.8 | 77 | 9342913 |
| 4-oblique-night | city | 8.3 | 7.1 | 11.2 | 11.0 | 527 | 15669313 |
| 4-oblique-night | difference | 3.7 | 2.6 | 5.1 | 6.2 | 450 | 6326400 |
| 5-water | empty map | 5.8 | 4.7 | 33.4 | 7.6 | 56 | 9331137 |
| 5-water | city | 7.5 | 7.3 | 9.0 | 11.6 | 227 | 13599977 |
| 5-water | difference | 1.7 | 2.6 | -24.4 | 4.0 | 171 | 4268840 |
