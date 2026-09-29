# Release slice 06 — sponsorship proof challenge compatibility (T07 / R07 / SEC-01)

Branch `codex/audit-proof-token-20260927`, stacked on draft PR #138 at `ef244a4`. This slice has no migration, provider request, real upload, notification, or production state change.

## Reproduced defect and change

- Before the fix the browser serialized an absent Turnstile token as JSON `null`; the proof-upload-url schema returned 400 before the verifier ran. Red tests recorded both the client request body and legacy-null route response.
- The proof upload and final wizard request now omit the field when absent. The route normalizes only `null` to `undefined` for old clients; other invalid types still fail schema validation. The existing verifier remains the sole permission decision, so production without a configured secret fails closed and configured challenge mode requires a valid token.
- The final pledge request still validates the signed proof intent rather than reusing the single-use challenge. Existing body-size, file descriptor, Storage object verification, owner/path binding, expiry, fingerprint and idempotent retry paths remain in place.

## Verification

- Red baseline: client omission test failed on unexpected `turnstileToken: null`; legacy-null API test got 400 rather than 201. After fix, focused `bun test --isolate` suite: 30 pass, 0 fail, 91 expectations across upload helper, wizard, upload route, final route, and proof intent files; exit 0. Covers local disabled and configured/production absent-token rejection, valid challenge ordering, one-use challenge, forged/expired signed intent, replay under another bearer, retry, and post-save email failure.
- `bun test` without per-file isolation across Wizard and route tests hit existing global TanStack module-mock contamination (`createFileRoute` export error); `--isolate` is the repository's full-suite mode. No product code change was made for this test runner issue.
- `bun run typecheck`: exit 0. `bun run lint`: exit 0 with 52 existing warnings. `bun run build`: exit 0. `bun test --isolate` against the dedicated loopback Supabase rehearsal: 2,825 pass, 90 skip, 0 fail across 477 files, exit 0. Remote CI: pending PR.
- Direct browser mobile/keyboard journey and real provider sandbox verification: not-run. No production credential or test identity was used.

## Rollback and handoff

Revert this slice to restore old request serialization and schema; that would restore the local-disabled proof upload 400 defect. There is no schema/data rollback. Keep production Turnstile paired site/secret configuration and rate limiting as separate release gates; do not disable the configured challenge to accommodate absent tokens. Staff should test both proof and no-proof paths with the approved local sandbox identity and a provider test challenge before release.
