# Final public verification

Candidate: the already-running production build at `http://127.0.0.1:4173`.
Fixture: `completion-final-public`; fixture SHA-256 `b8d3f37824e784708465af97cf5113242c22631d56c7b462e7a688c566b6a0e2`.
Browser: Chromium `148.0.7778.96`.

## Results

- Brand: pass, 26 routes at 375x812, 390x844, 768x1024, 1024x768, and 1440x900. Failure array empty. 131 retained files.
- Accessibility: pass, 26 routes at 1440x900. Failure array empty; 26 axe results contain zero total violations.
- Expanded lifecycle: pass, five scenarios: drawer Escape/focus restoration, 1120px breakpoint closure, submenu navigation, history Back closure, and Help SPA/language/widget behavior. Browser error array empty.
- Menu hydration: pass at 375, 390, and 768px. The SSR trigger was disabled before hydration and the first available click opened the drawer at every width.
- Failure modes: pass, six scenarios: empty and slow Help data, donation configuration outage with zero POSTs, detail-source outage distinct from absence, removed private animal returning 404 without its name, and PayPal selection retained across language change.
- Performance: pass, four routes at mobile and desktop, three cold runs each. Failure array empty; all 24 scores exceed the configured floor.

| Route | Width | Score median | Score minimum | LCP median (ms) | CLS median | TBT median (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 390 | 94 | 94 | 2621.192 | 0.000780 | 74.0 |
| `/animals/cat` | 390 | 99 | 98 | 1850.052 | 0.000282 | 74.5 |
| `/adoption/apply` | 390 | 99 | 99 | 1610.249 | 0.017628 | 65.5 |
| `/donate` | 390 | 98 | 98 | 1894.449 | 0.011790 | 81.5 |
| `/` | 1440 | 98 | 95 | 799.908 | 0.000280 | 0.0 |
| `/animals/cat` | 1440 | 100 | 98 | 582.625 | 0.000142 | 0.0 |
| `/adoption/apply` | 1440 | 99 | 99 | 611.594 | 0.010157 | 0.0 |
| `/donate` | 1440 | 99 | 95 | 769.298 | 0.000373 | 0.0 |

## Measurement notes

The already-running preview was not rebuilt or restarted during these checks. The opening Lighthouse observations overlapped with the tail of the repository's full isolated test suite, so this performance run is not described as uncontended. No configured threshold failed, and its medians remain consistent with the retained optimized measurements.

The verifier records the Git `HEAD` when each mode starts, not the commit embedded in the already-running build. Root committed unrelated/shared work while the fixed preview remained running, so the brand context records `413d964e935fbaf107e91003ecf0ea1b7a61b8b0` while the axe and performance contexts record `6dd266c96c0c605f79d4983b3e23cd88d429f1cc`. All three modes exercised the same unchanged 4173 process and fixture; these context commit fields must not be treated as a built-source SHA.
