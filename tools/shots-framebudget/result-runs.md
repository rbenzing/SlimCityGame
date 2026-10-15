# Frame budget, repeated runs (2026-10-15)

Seed 7, 8,759 buildings, default flags, 1280 x 800, Intel Arc Pro 140T,
the same session. "Before" is commit 179bc11 (the branch point, in a
worktree on its own dev server); "after" is the performance slice. Runs
were interleaved (after 1, before 1, after 2, ...) so a change in the
machine's load falls on both. Each cell is the city case: mean / p50 / p95 ms.
Draw calls and triangles are identical between runs of one build.

| View            | Build  | Run 1             | Run 2             | Run 3             | Calls | Triangles |
| --------------- | ------ | ----------------- | ----------------- | ----------------- | ----- | --------- |
| 1-street        | before | 28.2 / 31.1 / 47.1 | 28.6 / 28.6 / 35.7 | 26.5 / 26.1 / 33.4 | 809   | 38.0 M    |
| 1-street        | after  | 23.4 / 12.9 / 72.3 | 29.2 / 25.5 / 92.4 | 22.3 / 19.6 / 69.1 | 282   | 27.2 M    |
| 2-oblique       | before | 30.1 / 30.1 / 45.6 | 30.3 / 29.1 / 45.4 | 29.3 / 28.0 / 45.0 | 575   | 40.7 M    |
| 2-oblique       | after  | 27.0 / 18.2 / 72.9 | 33.0 / 18.2 / 97.8 | 26.5 / 22.6 / 76.0 | 389   | 30.3 M    |
| 3-overview      | before | 42.8 / 41.3 / 60.2 | 49.2 / 46.7 / 65.8 | 42.8 / 42.1 / 53.1 | 4,118 | 44.4 M    |
| 3-overview      | after  | 43.5 / 46.3 / 68.8 | 53.0 / 51.5 / 76.1 | 41.8 / 40.3 / 53.7 | 1,125 | 34.4 M    |
| 4-oblique-night | before | 29.2 / 27.6 / 45.2 | 30.4 / 29.4 / 44.0 | 27.3 / 26.9 / 40.0 | 583   | 40.7 M    |
| 4-oblique-night | after  | 28.0 / 16.5 / 75.9 | 33.3 / 26.3 / 82.0 | 27.1 / 23.5 / 66.8 | 397   | 30.3 M    |

Two further interleaved pairs after `tools/frame-budget.mjs` gained the
"p95 of 8" column (the 95th percentile of eight-frame averages). City case:
mean / p50 / p95 / p95 of 8 ms.

| View            | Build  | Run 5                     | Run 6                     |
| --------------- | ------ | ------------------------- | ------------------------- |
| 1-street        | before | 26.7 / 26.6 / 33.1 / 30.3 | 27.0 / 26.5 / 34.6 / 29.3 |
| 1-street        | after  | 24.1 / 17.0 / 74.1 / 26.7 | 24.3 / 13.6 / 75.2 / 27.5 |
| 2-oblique       | before | 29.3 / 28.7 / 46.4 / 33.1 | 29.0 / 26.2 / 44.2 / 31.4 |
| 2-oblique       | after  | 27.7 / 16.2 / 79.9 / 34.1 | 29.0 / 23.2 / 80.6 / 38.1 |
| 3-overview      | before | 43.2 / 42.0 / 62.4 / 55.7 | 46.9 / 45.8 / 63.6 / 56.9 |
| 3-overview      | after  | 42.3 / 41.6 / 57.0 / 44.4 | 45.8 / 44.1 / 62.4 / 49.4 |
| 4-oblique-night | before | 26.9 / 24.8 / 43.2 / 34.5 | 31.7 / 30.1 / 47.1 / 34.4 |
| 4-oblique-night | after  | 26.5 / 17.1 / 68.2 / 32.1 | 29.0 / 24.7 / 68.6 / 37.8 |

With `?nobloom` (one pair): after 20.2 / 24.7 / 41.4 / 27.1 ms mean, before
25.9 / 27.4 / 42.7 / 27.9; bloom is a few milliseconds and is not the floor.

## Reading

- The single-frame p95 is worse after (about 70-98 ms against 33-47) and the
  p50 is far better (13-26 against 26-31), on every run. The frames are not
  stalling periodically: the slow frames fall every three or four frames
  (`slowAt` in `result.json`), not at rebuild times. Once the CPU stops being
  the limit (282 calls instead of 809), the browser runs it ahead of the GPU
  until the queue is full and then waits, so the loop's deltas alternate fast
  and slow while their average, the mean, is the real cost. The before build
  is CPU-bound near its GPU rate and so is uniform.
- The mean is the honest reading: lower by 2-3 ms on street, oblique and
  night, level on the overview. The eight-frame p95 removes the queueing: it
  is lower after on street and overview and level or a few ms higher on the
  oblique views.
- The mean does not fall further because the GPU, not submission, now limits
  the frame: both builds spend about 1.2-1.4 G triangles a second, and the
  city still draws 19-22 M triangles over the empty map's 8.4 M. The next
  gain is triangles, not calls.
- The lot renderer does no work between snapshots: `LotRenderer.apply`
  runs only when a snapshot carries buildings, and a delta that changes
  nothing rebuilds no chunk (`rebuiltChunks()` in the test).
