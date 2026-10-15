# Frame budget (seed 7, 8759 buildings standing of 9253 planned)

Machine: ANGLE (Intel, Intel(R) Arc(TM) Pro 140T GPU (32GB) (0x00007D51) Direct3D11 vs_5_0 ps_5_0, D3D11) / Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/149.0.7827.55 Safari/537.36

| View | Case | mean ms | p50 ms | p95 ms | draw calls | triangles |
| ---- | ---- | ------- | ------ | ------ | ---------- | --------- |
| 1-street | empty map | 6.2 | 1.3 | 18.9 | 66 | 13773069 |
| 1-street | city | 23.4 | 23.3 | 30.1 | 809 | 37996072 |
| 1-street | difference | 17.2 | 22.0 | 11.2 | 743 | 24223003 |
| 2-oblique | empty map | 6.0 | 1.2 | 18.8 | 78 | 13782285 |
| 2-oblique | city | 25.0 | 27.3 | 51.2 | 575 | 40686895 |
| 2-oblique | difference | 19.0 | 26.1 | 32.4 | 497 | 26904610 |
| 3-overview | empty map | 7.0 | 1.8 | 18.6 | 162 | 13825293 |
| 3-overview | city | 38.5 | 38.7 | 52.3 | 4118 | 44375090 |
| 3-overview | difference | 31.4 | 36.9 | 33.7 | 3956 | 30549797 |
| 4-oblique-night | empty map | 7.7 | 2.5 | 19.2 | 78 | 13782285 |
| 4-oblique-night | city | 26.1 | 25.8 | 39.0 | 583 | 40688899 |
| 4-oblique-night | difference | 18.4 | 23.3 | 19.8 | 505 | 26906614 |
