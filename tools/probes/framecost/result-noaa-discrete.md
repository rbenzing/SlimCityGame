# Frame budget (seed 7, 1396 buildings standing of 3061 planned)

Machine: ANGLE (NVIDIA, NVIDIA RTX PRO 500 Blackwell Generation Laptop GPU (0x00002DB9) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 3.7 | 3.7 | 5.2 | 3.9 | 56 | 9330113 |
| 1-street | city | 6.4 | 6.2 | 8.0 | 6.7 | 391 | 15064664 |
| 1-street | difference | 2.7 | 2.5 | 2.8 | 2.8 | 335 | 5734551 |
| 2-oblique | empty map | 4.0 | 4.0 | 5.2 | 4.2 | 77 | 9342913 |
| 2-oblique | city | 7.0 | 6.5 | 9.5 | 8.1 | 526 | 15637113 |
| 2-oblique | difference | 2.9 | 2.5 | 4.3 | 3.9 | 449 | 6294200 |
| 3-overview | empty map | 4.3 | 4.3 | 6.2 | 4.5 | 164 | 9388481 |
| 3-overview | city | 8.4 | 8.2 | 10.4 | 9.3 | 646 | 15803933 |
| 3-overview | difference | 4.1 | 3.9 | 4.2 | 4.8 | 482 | 6415452 |
| 4-oblique-night | empty map | 4.0 | 3.9 | 5.2 | 4.1 | 77 | 9342913 |
| 4-oblique-night | city | 7.0 | 6.8 | 8.2 | 8.3 | 527 | 15669313 |
| 4-oblique-night | difference | 3.1 | 2.9 | 3.0 | 4.2 | 450 | 6326400 |
| 5-water | empty map | 5.1 | 5.1 | 6.7 | 5.5 | 56 | 9331137 |
| 5-water | city | 6.6 | 6.5 | 8.4 | 7.0 | 227 | 13599977 |
| 5-water | difference | 1.5 | 1.4 | 1.7 | 1.5 | 171 | 4268840 |
