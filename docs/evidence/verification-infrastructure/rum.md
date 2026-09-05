# Privacy-safe public metrics adapter

`src/lib/publicMetrics.ts` uses the standard web-vitals5.1.0 LCP/INP/CLS implementation, loaded only after explicit activation and a current consent callback returns true. It is deliberately not wired to the existing measurement-ID-only GA initialization: that code has token redaction but no consent state or owner-approved analytics policy.

The eventual consent owner supplies `enabled`, `getConsent`, `getPathname`, a mobile/desktop segment and a `send` adapter. Call the returned stop function on consent revocation and navigation. These are document metrics, not soft-navigation metrics; callbacks for a different current path are dropped. Unknown/private routes are dropped. Capability/detail paths use templates, never tokens or names. No query strings, hashes, form values, DOM attribution, performance entries or raw library IDs are transmitted. Generated IDs allow aggregation of repeated deltas within one document metric; they are not persistent visitor IDs. Consumer must deduplicate/update by metricId, not count every callback as a fresh visit.

No real metrics were collected and no provider integration or consent UI was activated. Field p75 remains unmeasured. Activation requires an approved consent integration and a reviewed transport that preserves this payload boundary. Data cannot be treated as representative without traffic/sample context.

Regression evidence: `rum-red.txt`2pass/2fail; initial `rum-green.txt`4pass/0fail. Independent frontend review corrected listing/privacy route inventory and opaque ID exception handling. `rum-review-red.txt` captures the route mismatch; final `rum-review-green.txt`6pass/0fail, including ID-generation failure. Targeted lint passed before final review corrections; final integrated checks follow.

Reference: https://github.com/GoogleChrome/web-vitals/tree/v5.1.0 (standard metrics API and document lifecycle; no attribution build imported).
