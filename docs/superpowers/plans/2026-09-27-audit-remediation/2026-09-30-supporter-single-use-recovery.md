# T22: single-use recovery implementation refinement

This implements the already approved T22 default: when the existing verification capability cannot establish single-use, add a purpose-bound, hashed, single-use token with a 15-minute expiry. It does not authorize production DDL, email delivery, Auth configuration changes or recovery activation.

## Evidence and choice

The isolated Auth v2.197.0 test issued two sessions for concurrent redemption of one provider OTP, twice (exit 1). On 2026-09-30, an unprivileged, read-only production Auth `/health` returned v2.197.0. This confirms version parity only; hosted redemption was not tested. The original provider diagnostic and its failure remain unchanged.

The supported `auth.admin.generateLink` API generates a provider carrier without sending email. The application will keep that carrier private and send an independent recovery code through the existing injectable mail-provider boundary. Only the application's atomically consumed code can unlock this carrier. A process-local mutex cannot establish this invariant across server instances. Provider configuration alone has not supplied a verified repair.

## Flow and trust boundary

1. Request: existing fail-closed rate limits and Turnstile; normalize email; generate an independent random request UUID. Return the same accepted response and opaque UUID for every valid email, including delivery/provider failures. No supporter membership query or historical identity merge.
2. Prepare: generate a Supabase magic-link carrier with the service client; validate its identity/type; generate a cryptographically random eight-digit application code. HMAC the purpose, request UUID, normalized email and code with a server-only key. AES-256-GCM seal the provider carrier with independent HKDF-derived key material and request/email-bound AAD. No plain code, email or carrier in the challenge table, logs, URLs or browser response.
3. Persist: a new private RLS-enabled table stores purpose, request UUID, HMAC fingerprints, sealed carrier, Auth user ID, server-generated 15-minute expiry and attempt count. Service-only public RPCs use pinned search paths; anon/authenticated have no table or function access. No existing table/Auth schema is patched and no migration ledger is fabricated.
4. Deliver: the existing Resend configuration/provider boundary sends only the application code; delivery failure invalidates the challenge and keeps the accepted response generic. No new queue, cron or real delivery is enabled by this implementation.
5. Verify: bounded JSON, fail-closed IP/email limits and a fresh Turnstile token. A database row lock checks purpose, email, expiry, attempt budget and consumption; a wrong code counts toward the five-attempt limit. A correct code consumes the row and clears the encrypted carrier before returning it privately to one server request.
6. Session: that one server request decrypts and verifies the hidden carrier once, validates the returned verified identity, then returns only ordinary access/refresh tokens under `no-store`. Before sending verification HTTP, the signed-out browser captures a persisted session revision under Web Locks. SDK-supported storage checks that revision, empty baseline, current attempt and expiry before committing `setSession`. #157 continues using normal server-validated Supabase identity. Failure/timeout after consumption requires a new request; the consumed challenge is never revived or exchanged twice.

This establishes at-most-one session issuance for each application recovery code. It does not claim to repair Supabase's independent direct OTP endpoint or provide atomicity across the database and external Auth HTTP request. A lost response can leave one valid session unseen by the browser; safe recovery is a new challenge.

## Compatibility, activation and rollback

- Both recovery endpoints require exact `SUPPORTER_RECOVERY_ENABLED=true`; delivery remains disabled by default.
- A separate 32-byte base64 `SUPPORTER_RECOVERY_TOKEN_KEY` must be present before creating live broker dependencies. Missing/invalid key fails closed before provider calls. It is never a VITE variable and is not configured by this change. Rotation invalidates outstanding challenges; sessions already issued remain governed by Supabase.
- Request returns `{accepted:true, challengeId}`. Verification posts email, challenge ID, code and fresh challenge token to `/api/supporter/recovery/verify`; provider OTP never reaches the browser.
- Recovery installation requires writable localStorage and Web Locks, and fails closed otherwise. Ordinary authentication retains the SDK memory fallback if persistent storage is unavailable. The existing SDK storage key is preserved. Logout removes credentials even if a revision write encounters quota failure; changing or removing the persisted revision invalidates pending recovery attempts.
- The installed SDK is lockless by default. Its incoming-session identity lookup is protected from terminal-error cleanup of a newer actor. If a recovery access token expires before installation, every refresh attempt is refused locally with a retryable status; the SDK's bounded retry lasts approximately 25.5 seconds in this version and makes no provider request. No SDK private method or Auth schema is patched.
- Deploy the exact approved migration before application activation. Application rollback disables recovery and retains the additive table/RPCs; do not drop Auth data or revoke unrelated sessions. A rollback of token issuance does not undo a consumed token or a delivered email.
- No changes to payments, webhook/reconciliation, supporter identity links, portal authorization, existing delivery schedules or production content.

## Implementation and acceptance sequence

1. Preserve the raw provider failure; add a failing request-correlation regression.
2. Add the broker, private schema and DI verification route; test secrecy/binding, malformed responses, wrong identity and failures after consumption.
3. Rehearse exact SQL on isolated DB: signature/grants/RLS, five attempts, expiry, replay, two-connection concurrency, delivery invalidation and cleanup; no production data or ledger edits.
4. Run the real broker with local Auth and an SMTP test sink; assert two concurrent application-code requests produce exactly one session and only one carrier exchange. Test wrong email/code, unknown identity, expiry, suspension, replay and provider failure.
5. Exercise actual page at mobile/tablet/desktop widths, keyboard, repeated challenge use and login/logout; run typecheck, full tests, lint, build and independent review.
6. Record exact SHA, commands/exits, remaining not-run hosted gates, migration checksum, manifest/runbook/rollback. Request the exact production migration approval only after concrete green evidence. Merge remains sequential after approval and all applicable gates.

Sources: [generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [Auth v2.197.0](https://github.com/supabase/auth/releases/tag/v2.197.0).

### Verified session coordination refinement, 2026-09-30

The pinned SDK's supported custom lock serializes full operations, while a public Auth facade coordinates its bypass writers, including active admin password and volunteer OTP login. Short storage locks alone do not cover cleanup-to-notification timing. Use distinct operation/storage namespaces and fail acquisition after5s without stealing. Provider-bound refresh can rebase a protected logout only for the exact token pair, matching user/sub/nonempty session ID and unchanged captured storage. UI logout failures are owned by that session across refresh, including same-task Auth-event/response ordering. No SDK private methods or authorization claims are patched; decoded session identity is for browser UI fencing only. Code `ccfca5444dead96d94195e346c15fdfcf2751a7e`; final22 SDK tests/66 assertions and actual Chromium cases pass. See the appended final checkpoint in `sequential-merge-156-broker-20260930.md` for commands, exits and compatibility limits.
