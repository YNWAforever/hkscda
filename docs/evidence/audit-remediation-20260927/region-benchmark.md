# T20 · R09 server region evidence

## Current metadata, verified 2026-09-27 HKT

Vercel deployment dpl_Ggm7uaMZXqFFw7yqZyE7z8D3zg5m is READY, production alias hkscda.vercel.app, main SHA f8d5e5d5840d1775efb7d7f4ae2768f6557096b5, region iad1. Supabase project iihqjzilgawhfdhdevam is ACTIVE_HEALTHY in ap-southeast-1. The local Nitro build emitted a Node.js 24 server function with no explicit region field; the actual production deployment metadata is the region authority. The source vercel.json has no region override.

Vercel currently lists sin1 as Singapore/ap-southeast-1 and documents a vercel.json regions override. References: https://vercel.com/docs/regions and https://vercel.com/docs/functions/configuring-functions/region . Supabase project region was read from the project metadata connector; no DB move is proposed.

## Measurement gate

No private candidate deployment with the same SHA, schema, fixture, network origins and region override is available in this task. Branch previews are disabled for codex/audit-* and a public preview was not authorized. The connector exposed production deployment metadata but the project-details call failed input validation, so exact team plan/function constraints remain unverified. T20 p50/p95 cold/warm measurements from Hong Kong and a second geography, error rate and callback/file regressions are not-run. No region configuration was changed. The T21 loopback DB microbenchmark is a separate data-path result and cannot justify a region switch.

Release owner should provide a private candidate environment and verify function duration/plan. Compare at least 30 cold and warm samples per key route at the same SHA/fixture from Hong Kong and another region; capture server operation duration and DB roundtrip count without PII, inspect the deployed Nitro function region, and check provider callbacks, font and file access. Only after a measured win and release approval should a separate region config change be merged. Rollback is the previous region setting, with schema and event intake unchanged.

## Current metadata follow-up — 2026-10-01 HKT

Read-only connectors freshly verified production READY deployment dpl_D6goofbM7umWWoTqQVGtBxHzkvVP/main07e4c881863b715342ed0757aad7bd691a272738/regioniad1 and Supabase ACTIVE_HEALTHY/ap-southeast-1. No region change. The required two-geography30-sample cold/warm/private-fixture/function-constraint benchmark remains not-run; the earlier local UI/DB results cannot certify a region benefit.
