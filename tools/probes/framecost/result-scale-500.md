# Frame budget (seed 7, 198 buildings standing of 561 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.0.0 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |
| 1-street | empty map | 10.2 | 10.1 | 12.7 | 10.5 | 54 | 9329089 |
| 1-street | city | 12.3 | 12.2 | 14.2 | 12.8 | 240 | 10000071 |
| 1-street | difference | 2.0 | 2.1 | 1.5 | 2.4 | 186 | 670982 |
| 2-oblique | empty map | 10.4 | 10.2 | 13.0 | 10.6 | 69 | 9337793 |
| 2-oblique | city | 12.1 | 12.1 | 13.9 | 12.4 | 274 | 10081742 |
| 2-oblique | difference | 1.8 | 1.9 | 0.9 | 1.8 | 205 | 743949 |
| 3-overview | empty map | 11.3 | 11.2 | 13.6 | 11.5 | 166 | 9389505 |
| 3-overview | city | 11.9 | 11.9 | 13.5 | 12.2 | 273 | 9745287 |
| 3-overview | difference | 0.7 | 0.7 | -0.1 | 0.7 | 107 | 355782 |
| 4-oblique-night | empty map | 10.3 | 10.2 | 11.8 | 10.7 | 69 | 9337793 |
| 4-oblique-night | city | 12.3 | 12.2 | 13.9 | 12.5 | 274 | 10081742 |
| 4-oblique-night | difference | 2.0 | 2.0 | 2.1 | 1.8 | 205 | 743949 |
| 5-water | empty map | 12.3 | 12.2 | 14.2 | 13.7 | 56 | 9331137 |
| 5-water | city | 11.6 | 11.5 | 13.1 | 11.8 | 66 | 9412549 |
| 5-water | difference | -0.7 | -0.7 | -1.1 | -1.9 | 10 | 81412 |
