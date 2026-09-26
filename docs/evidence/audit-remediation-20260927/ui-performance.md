# Same-environment public UI and performance comparison

Both builds used the repository read-only synthetic PostgREST fixture `supabase-ci-v1`, browser 148.0.7778.96, the same Windows host, the same Vite/Nitro build command and 390x844 mobile / 1440x900 desktop viewports. Before is production source SHA `f8d5e5d5840d1775efb7d7f4ae2768f6557096b5`; after is this worktree with T01/T02 changes (uncommitted at measurement time). Fixture SHA-256: `be308879dc4f4fedea961a021ddc15f7df293e31abf6afea274a7d5bb56b4140`. Public production performance is not inferred from this fixture.

Each score and metric is the median of three Lighthouse cold runs. LCP and TBT are milliseconds. Changes of a few points may be measurement noise; this slice did not intentionally change page layout or load behavior.

| Viewport | Route | Score before → after | LCP ms before → after | TBT ms before → after | CLS before → after |
|---|---|---:|---:|---:|---:|
| 1440x900 | `/` | 99 → 99 (+0) | 753 → 730 | 0 → 2 | 0.0003 → 0.0003 |
| 1440x900 | `/adoption/apply` | 100 → 100 (+0) | 572 → 573 | 0 → 0 | 0.0102 → 0.0102 |
| 1440x900 | `/animals/cat` | 99 → 99 (+0) | 730 → 676 | 0 → 0 | 0.0001 → 0.0001 |
| 1440x900 | `/donate` | 100 → 99 (-1) | 638 → 607 | 0 → 0 | 0.0004 → 0.0004 |
| 390x844 | `/` | 97 → 93 (-4) | 2404 → 2545 | 43 → 60 | 0.0008 → 0.0008 |
| 390x844 | `/adoption/apply` | 99 → 100 (+1) | 1710 → 1650 | 66 → 46 | 0.0176 → 0.0176 |
| 390x844 | `/animals/cat` | 98 → 99 (+1) | 2010 → 1950 | 88 → 89 | 0 → 0 |
| 390x844 | `/donate` | 99 → 99 (+0) | 1967 → 1964 | 39 → 64 | 0.0001 → 0.0001 |

The verifier exited 0 on both builds: 4 routes × 2 viewports × 3 cold runs. Raw Lighthouse JSON and full-page screenshots are in the ignored local `node_modules/.audit-remediation-rehearsal/performance[-before]` folders; all 48 run-level values are in `performance-runs.csv`, with medians in `performance-comparison.csv`.

## UI screenshots

- `ui/before-instructions-mobile.png` and `ui/after-instructions-mobile.png`: identical SHA-256, both GET 200. Desktop instructions pair is also byte-identical.
- `ui/before-donate-mobile.png` and `ui/after-donate-mobile.png`: identical SHA-256, both GET 200. Desktop donation captures differ at byte level; the visual cause has not been established and no improvement is claimed.
- All screenshots use the same synthetic fixture and browser with full-page capture. They do not contain production donor/adopter data.

No production deploy, payment enablement, content publication or email send occurred.
