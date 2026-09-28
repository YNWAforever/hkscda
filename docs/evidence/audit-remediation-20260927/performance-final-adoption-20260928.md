# Final-source adoption entry performance comparison, 2026-09-28 HKT

Before: clean main source `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`. After: local-only combined source `72d0fda625791d974cd1fcd3d565360766b93bd8`, including focused draft PR #179 source. Both production builds used identical placeholder Supabase URLs and the **same running read-only synthetic PostgREST fixture** `scripts/ci/supabase-fixture.mjs` from the integrated worktree, SHA-256 `1515dea29e49e96a61c869945acdebbc950d96619592ed40c`, on 127.0.0.1:54329. Lighthouse 13.4.1 / HeadlessChrome 148.0.7778.96 and the identical verifier script SHA-256 `7a07ab3c1ed9bb7df46ca7ca49d3fbbbf704e8adee3e9a2f0ebbb9262c91716ec` ran sequentially on one Windows host; each viewport has three cold runs. The baseline runner's raw JSON metadata hashes its local older fixture file, but **the served fixture for both runs was the integrated file above**. No production data or payment was used.

This measures `/adoption/apply` with an empty shortlist, so the rendered empty state is identical in the two builds. It does not measure the seven-step form with selected animals; that before/after UI and keyboard acceptance is in [draft PR #179 evidence](https://github.com/YNWAforever/hkscda/pull/179). It does not establish production, Hong Kong user, Core Web Vitals or admin-role performance.

| Viewport | Metric | Before median | After median |
|---|---|---:|---:|
| 390x844 | Performance score | 99 | 99 |
| 390x844 | FCP ms | 1363 | 1379 |
| 390x844 | LCP ms | 1663 | 1679 |
| 390x844 | TBT ms | 68 | 70 |
| 390x844 | CLS | 0.0176 | 0.0176 |
| 390x844 | Speed Index ms | 1998 | 2047 |
| 390x844 | Total byte weight | 1462126 | 1470485 |
| 1440x900 | Performance score | 100 | 100 |
| 1440x900 | FCP ms | 484 | 496 |
| 1440x900 | LCP ms | 564 | 576 |
| 1440x900 | TBT ms | 0 | 0 |
| 1440x900 | CLS | 0.0102 | 0.0102 |
| 1440x900 | Speed Index ms | 762 | 756 |
| 1440x900 | Total byte weight | 1462126 | 1470485 |

The score stayed 99 on mobile and 100 on desktop. The mobile LCP median rose from 1663 to 1679 ms and desktop from 564 to 576 ms; total byte weight rose by 8,359 bytes (about 8 KB). These small differences were not isolated to a causal module and are not claimed as a speed improvement. All 12 run-level values are in [performance-final-adoption-20260928.csv](performance-final-adoption-20260928.csv). Both empty-state screenshots were byte-identical: mobile SHA-256 `cad2485e31a4c65d17c295b56d262c618be52a495ed9e6d97b04136164eae553`; desktop `aa4121d781fcb9b03f71ef05f8ba939d286082f52e48c47ac67d8b2dc5feb935`. Active-form same-source performance and hosted private-role UAT remain not-run.
