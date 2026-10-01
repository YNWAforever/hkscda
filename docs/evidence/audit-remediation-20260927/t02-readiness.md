# T02 / R02 · private readiness and public content gate

## Scope and decision

This slice adds a protected `GET /api/internal/readiness` probe and a separate rendered-content synthetic for `/adoption/instructions`. It is stacked after draft PR #167 as draft PR #168, source `db66c1be7caaa05a74a3391dfd12a6b3c7589798` plus public reference amendment `747d106d08dd7766c35fc8da6af6bb1cfcf861d1`. The endpoint uses the existing `CRON_SECRET` Bearer check, returns `Cache-Control: no-store`, and does not expose catalog details on a public health URL. Unauthorized requests return 401 before opening a Supabase client.

The CMS probe reads only the published `adoption_instruction_revisions` row. `PGRST205` and `42P01` are `degraded` because #133 may serve the approved seed copy. A permission error, timeout/unexpected error, absent published revision or invalid content is `unavailable`; no seed fallback is added for those cases. The independent public-page read still loads fees, rules, care topics, estates and guide slots through their existing repositories. Production readiness also requires both Turnstile and Upstash configuration pairs. The public submission handlers already fail closed when their required protection is absent; this slice reports that state to release operators.

A successful response contains feature state and safe codes, a release SHA and a correlation ID. It contains no private database message, email, address, token, catalog list, query or page payload. State-change alerts and ten-minute repeat intervals log only state, safe codes and release SHA; a recovery is logged. Readiness is a configuration and content read, not a live Cloudflare/Upstash/provider transaction test.

## Regression evidence

The new readiness tests were written before the implementation and initially failed because the module did not exist. The new live synthetic tests likewise failed before the script existed. A further red loader test reproduced the missing public support reference (9 pass/1 fail before the fix). Focused tests cover two precise missing-relation codes, 42501/XX000/PGRST116, missing and invalid published revision, public data failure, production missing protection pairs, local fixture exemption, early authorization, no-store/503, sanitized alert rate limiting/recovery, adapter query shape, release SHA mismatch and a 200 unavailable shell. The final four-file focused suite has 38 pass/107 assertions (R02 13, live synthetic 3, #133 12, loader 10). The pre-existing #133 12-case client suite confirms approved seed copy plus live fee source and exact fallback boundaries.

The script's private call needs `READINESS_BASE_URL` and `READINESS_TOKEN` (the deployed `CRON_SECRET` value supplied only to the operator's local environment); optional `READINESS_EXPECT_SHA` pins the candidate. Run `bun scripts/verify-live-readiness.ts` from an authorized private candidate. The script sends the token only to the private endpoint, then checks the public route for five rendered section markers and rejects the 200 unavailable shell. It accepts HTTPS or loopback HTTP. Never paste tokens into logs or PRs.

## Verification / limitations

- `bun test src/lib/operations/readiness.server.test.ts src/lib/operations/liveReadiness.test.ts src/lib/adoptionInformation/publicPage.server.client.test.ts src/lib/routing/resilientLoader.test.ts`: 38 pass, 0 fail, 107 assertions; exit 0. The first red runs each failed because the new module/script was absent. A missing adapter import was corrected before the final run.
- `SUPABASE_LOCAL_URL=http://127.0.0.1:57321 bun test --isolate`: 2904 pass, 106 skip, 0 fail, 9039 assertions across 521 files; exit 0 against the named unlinked local stack.
- `npm.cmd run typecheck` and `npm.cmd run lint -- --quiet`: exit 0 after the final code/test edits. Build exit 0 on the final source.
- `bun scripts/verify-live-readiness.ts` with no candidate URL/token: expected exit 2 before any request; no secret or network action.
- Remote amended-source CI `36357778260` on `747d106d08dd7766c35fc8da6af6bb1cfcf861d1`: verify, RLS matrix, brand, a11y and performance jobs all success.
- Hosted private candidate, production readiness, real secret availability and alert routing: **not-run**; no candidate/test credentials were supplied.
- The public route still renders an actionable unavailable shell with HTTP 200 on a loader error, now with a safe support reference linked to a code-only log and a support-center link. The independent readiness endpoint returns 503 for unavailable, and the content synthetic detects a misleading 200. Framework-level public-route 503 remains a separate improvement if it can preserve the shell.
- No migration, production config change, public preview, email or payment action is in this slice.
