# CSP `script-src 'unsafe-inline'` and admin JWT in web storage — decision note

**Date:** 2026-11-10
**Source:** 2026-11-09 audit (AUDIT R4 / REPORT §3 item 3), task backlog-security-20261110.
**Status:** the admin-JWT-in-web-storage half is **mitigated** (2026-11-10 session BFF, see the
update below); the CSP `script-src 'unsafe-inline'` half remains open and is tracked as Option B.
**Status:** the CSP half is **implemented** in the 2026-11-10 nonce task (Option B below), enforcing
with a per-request nonce and no `'unsafe-inline'` in `script-src`. The admin-token half (Option C)
is still only a decision: the session remains in web storage.

## What exists today

- The enforcing CSP is built in [`src/lib/security-headers.ts`](../src/lib/security-headers.ts)
  and applied to every SSR and API response by the wrapper in
  [`src/server.ts`](../src/server.ts). The script directive was:

  ```
  script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://maps.googleapis.com https://challenges.cloudflare.com
  ```

  `style-src` also carries `'unsafe-inline'`; `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'` and a report endpoint (`/api/csp-report`, `report-uri` + `report-to`) are
  already there.
- The admin session no longer lives in web storage (2026-11-10): `POST
  /api/admin/session/{login,refresh,logout}` keep the access/refresh tokens in `HttpOnly`,
  `Secure`, `SameSite=Strict` cookies scoped to `Path=/api/admin/session`, and the browser keeps
  only the short-lived access token in module memory (`src/lib/admin/sessionMemory.ts`). Admin
  API calls still send `Authorization: Bearer <access token>`; the password-recovery client is
  `persistSession:false` with in-memory storage. See the update section below.
- No XSS was found by the audit. With the BFF, one XSS can still act as the signed-in admin
  while the page is open (the memory token and the app's own fetch path are reachable) but it
  cannot read a long-lived credential from `localStorage` and replay it elsewhere; the remaining
  structural gap is the CSP `'unsafe-inline'` allowance itself.
- Context that bounds the risk: admin sessions are revoked server-side on every call
  (`requireAdmin` re-reads `admin_user.status`), the refresh cookie is revoked on logout and
  rotated on refresh, admin copies are localised to the back office, and public request bodies
  are capped at 1 MB (admin 8 MB, which is what bounds the zod advisory too).

## Update (2026-11-10): admin session BFF shipped

The bounded "session BFF" landed in this batch (details and gate numbers in
[`FIX_REPORT.md`](FIX_REPORT.md)):

- `POST /api/admin/session/login` (email+password, rate-limited), `/refresh` (rotates the
  refresh cookie), `/logout` (best-effort revocation, clears both cookies). All three reject a
  cross-origin or origin-less request with 403 (`Origin` must equal the request origin and
  `Sec-Fetch-Site`, when present, must be `same-origin`/`none`).
- Cookie shape: `HttpOnly; Secure; SameSite=Strict; Path=/api/admin/session; Max-Age=<token
  lifetime>` — the path scoping means the cookies are never attached to the 180+ data endpoints,
  which keeps their Bearer-token contract unchanged.
- The browser has no persisted admin session: `sessionMemory.ts` holds the access token for the
  tab lifetime and bootstraps from `/refresh` on reload; legacy `sb-*-auth-token` web-storage
  entries are removed on bootstrap/logout. A `noWebStorageAuth.test.ts` guard fails if a browser
  admin module reintroduces `supabase.auth` persistence or a token write.
- **Residual risks:** the access token is in JS memory for the tab lifetime, so an XSS during
  that window is still session-riding (severity reduced: no replayable long-lived token); a
  cross-tab sign-out awaits the next 401/refresh rather than a broadcast; the session endpoints
  must be deployed with the client half; and cookie `Path` scoping means a future SSR-admin
  loader cannot read the access cookie outside `/api/admin/session` without widening the path.
- **Not changed:** `requireAdmin` and every data endpoint still take a Bearer token, so nothing
  in the role/authorization layer moved.

## Option A — hardened status quo (superseded for token storage by the BFF)

Before the BFF, the cheap layers were: keep the SDK storage model and `'unsafe-inline'`, add a
Report-Only Trusted Types policy, shorten the admin token lifetime, and monitor the existing CSP
report pipeline. The token half is now superseded by the session BFF above; the remaining cheap
layers still apply:

1. Nonce-based `script-src` migration (see Option B) as its own task; until then keep the
  and is now:

  ```
  script-src 'self' 'nonce-<per-request base64 nonce>' 'strict-dynamic' https://www.googletagmanager.com https://maps.googleapis.com https://challenges.cloudflare.com
  ```

  `style-src` still carries `'unsafe-inline'` on purpose (React style attributes, which a style
  nonce cannot cover); `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` and the
  report endpoint (`/api/csp-report`, `report-uri` + `report-to`) are unchanged.
- The browser Supabase client keeps the session in `localStorage` through a coordinated
  storage adapter ([`src/lib/supabase.ts`](../src/lib/supabase.ts)); every admin API call
  sends `Authorization: Bearer <access token>` from [`src/lib/admin/session.ts`](../src/lib/admin/session.ts).
  There are no auth cookies, so classic cookie CSRF does not apply.
- No XSS was found by the audit. The exposure is: one XSS anywhere in the origin (including a
  future one introduced by a dependency or an inline `dangerouslySetInnerHTML`) can read the
  admin token from `localStorage` and replay it from an attacker machine; `'unsafe-inline'`
  removes the browser's main structural defence against injected inline script.
- Context that bounds the risk: admin sessions are revoked server-side on every call
  (`requireAdmin` re-reads `admin_user.status`), Supabase refresh tokens rotate, admin copies
  are localised to the back office, and public request bodies are capped at 1 MB (admin 8 MB,
  which is what bounds the zod advisory too).

## Option A — hardened status quo (historical: chosen on 2026-11-10, superseded by Option B)

Keep the Supabase SDK storage model and `'unsafe-inline'`; add cheap, low-risk layers:

1. Nonce-based `script-src` migration (see Option B below) as its own task; until then keep the
   enforcing CSP plus reporting and add a **Report-Only** `require-trusted-types-for 'script'`
   policy to surface DOM-XSS sinks without breaking the app (Trusted Types is Chromium-only; safe
   to report first).
2. Keep the admin access-token lifetime short (e.g. 30 min) in Supabase Auth settings; the BFF
   refresh cookie rotates on every refresh, so a stolen access token ages out quickly.
3. Keep the CSP report pipeline monitored; an enforced CSP block is visible rather than silent.

**Effort:** S (hours, config + one report-only header). **Risk:** low. **Limits:** without a
nonce, `'unsafe-inline'` keeps the injected-inline-script class open.

## Option B — nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`) — **implemented 2026-11-10**

**Implementation.** `src/server.ts` generates 16 random bytes (Web Crypto) as a base64 nonce for
every request and runs the Start handler inside an `AsyncLocalStorage` store
([`src/lib/csp-nonce.server.ts`](../src/lib/csp-nonce.server.ts); the isomorphic helper is
[`src/lib/csp-nonce.ts`](../src/lib/csp-nonce.ts)). `src/router.tsx` `getRouter()` reads the
request's nonce through `currentCspNonce()` and passes it as `ssr: { nonce }`; TanStack Router
(1.170.41) stamps it on the hydration `<Scripts>` chunks, `ScriptOnce` and route `head.scripts`.
The same nonce is passed to `applySecurityHeaders()` so the response's `script-src` matches the
markup. `'strict-dynamic'` keeps the runtime loaders working: GA4's `gtag/js` script, the Google
Maps loader and Turnstile are inserted by our own nonced hydration code, so the trust propagates;
the existing host sources remain in the directive for browsers without `'strict-dynamic'`.

**What had to change for it to be safe:**

- JSON-LD data blocks that were rendered inline by `renderJsonLd` (annual-report and adoption-impact
  pages) moved into route `head.scripts` (`jsonLdScript()` in `src/lib/schema.tsx`), which is
  nonce-stamped by the router. No component emits a raw `<script>` any more.
- The static 500 page in [`src/lib/error-page.ts`](../src/lib/error-page.ts) had an inline
  `onclick="location.reload()"`. Event-handler attributes cannot carry a nonce, so "Try again" is
  now a plain same-URL link; the page contains no script at all and its inline `<style>` is still
  covered by `style-src 'unsafe-inline'`.
- The small `getRouter()` plumbing blocker noted in the first version of this note was solved with
  the bespoke `AsyncLocalStorage` option, avoiding a dependency on the internal
  `@tanstack/start-storage-context` package (Option B.2 in the earlier draft).

**Tests:** `src/lib/security-headers.nonce.test.ts` (exact directive, no `'unsafe-inline'`,
`style-src` unchanged, reporting kept, nonce injection ignored, per-response header),
`src/lib/csp-nonce.test.ts`, `src/lib/csp-nonce.server.test.ts` (generation, per-request isolation
across concurrent awaits) and `src/lib/csp-nonce-wiring.test.ts` (server → router propagation,
server-only store, error page has no inline handler, no un-nonced `<script>` remains).

**Residual risk / follow-ups:**

- A real SSR render was not available in this sandbox (no build/spawn), so the end-to-end markup
  assertion is static (the wiring test) plus TanStack Router's documented `ssr.nonce` path; browser
  QA on staging should confirm the header nonce equals every inline script's `nonce` before a
  production release.
- A nonce CSP removes the "injected inline script" class but does not stop an injected *external*
  script loaded by an already-nonced script (that is what `'strict-dynamic'` trades for loader
  compatibility); Trusted Types would be the next layer.
- `style-src 'unsafe-inline'` remains until React style attributes are migrated to classes.
- AUDIT R4's other half — the admin bearer token in `localStorage` — is unchanged; Option C below
  is still the only fix and is not approved.

## Option C — HttpOnly SameSite cookies for the data endpoints too

The shipped BFF is a bounded slice of this option: the browser holds only HttpOnly cookies for
the *session*, while data endpoints keep their Bearer contract. The full option would also move
data-endpoint authorization onto the cookie (a server middleware exchanges the cookie for the
Supabase session and injects the same `requireAdmin` contract, or the endpoints read an
`HttpOnly` access cookie). That needs CSRF double-submit or origin checks on every mutation
(not only the three session endpoints), cookie-scope review across ~200 admin API calls,
cross-tab behaviour, and re-testing of the sign-in/recovery paths (AUTH-02/BUG-57). The repo's
custom recovery-session storage and actor-fencing logic would need rework.

**Effort:** L (weeks). **Risk:** high — auth-wide, hard to roll back partially.
**Recommendation:** not needed now: the BFF already removes the replayable long-lived token from
web storage, which was the audit's exposure. Revisit only if the admin threat model requires
cookie-only server sessions (e.g. contractual requirements); if approved, do it as an isolated
branch behind a flag with a manual security review of CSRF, cookie scope, logout and
refresh-rotation paths.

## Option D — token obfuscation without moving it (rejected)

WebCrypto-wrapping the token in a non-extractable key, or splitting it across storage, does not
help: the XSS payload runs in the same origin and can call the same decrypt/read path the app
calls. Rejected as security theatre. In-memory-only access tokens (no persistence) reduce the
theft window but force a re-login on every reload and still allow session-riding XSS; a partial
mitigation at best, not a replacement for Option C.

## Recommendation

1. **Shipped (2026-11-10):** the bounded session BFF — HttpOnly refresh cookie + in-memory access
   token; no admin JWT in `localStorage`/`sessionStorage`; data endpoints unchanged.
2. **Next hardening task:** Option B (nonce CSP) as a CSP-only change with a report-only soak.
   Keep `'unsafe-inline'` until then; removing it without nonces breaks TanStack Start hydration.
3. **Only if the admin threat model requires it:** full Option C, because it rewrites the whole
   admin authentication boundary again for a risk this batch already removed.

The behaviour change for this batch is recorded in [`BUGS.md`](BUGS.md) and
[`FIX_REPORT.md`](FIX_REPORT.md).
1. **CSP half — done (2026-11-10):** Option B is implemented and enforcing; browser QA on staging
   should confirm the header nonce matches the rendered scripts before release.
2. **Token half:** Option C remains the only fix for the `localStorage` exposure; do it only if
   the admin threat model justifies a cookie/BFF session rewrite, as a separately approved migration
   with its own security review.
3. Trusted Types in Report-Only (Chromium-only) is the natural next CSP layer once the nonce
   rollout is observed in production.

No behaviour was changed in the batch that wrote this note beyond the private document bucket fix
recorded in [`BUGS.md`](BUGS.md) and [`FIX_REPORT.md`](FIX_REPORT.md). The CSP half was implemented
afterwards, on 2026-11-10, by the nonce task described under Option B.

## Appendix — zod 3 → 4 assessment (GHSA-mrhx-c7xc-m3w5)

Attempted in the worktree on 2026-11-10: `bun add zod@^4` (resolved **4.6.5**; bunfig's
24 h `minimumReleaseAge` guard withheld newer patch releases) then `bunx tsc --noEmit`.

- **Typecheck errors: 113** in 18 files (threshold for keeping the upgrade was < 40).
  By category:
  - **34** — [`src/lib/volunteers/policy/jsonSchema.ts`](../src/lib/volunteers/policy/jsonSchema.ts)
    hand-rolls a JSON-Schema converter against zod internals (`schema._def.typeName`,
    `_def.checks`, `_def.minLength`…). zod 4 removed that shape; the clean fix is to delete the
    converter and use zod 4's built-in `z.toJSONSchema()` (medium effort, one file, needs its
    policy-schema tests re-approved).
  - **57** — inferred *input* types changed for schemas with `.optional()`/`.default()`/
    `.catch()` (`TS2345`/`TS2339` clusters in `adoptions/repository.server.test.ts` 23,
    `content/contentListRead.server.test.ts` 22, plus policy/CRM test fixtures). Mechanical but
    wide: fixtures and call sites must be re-typed, and some of the divergence is real
    (zod 4 distinguishes input and output more strictly), so each needs a look rather than a
    blanket cast.
  - **10** — `z.record(valueSchema)` is no longer accepted; now `z.record(keySchema, valueSchema)`
    (`TS2554`) in `content/repository.server.ts` (4), `crm/exportJobs.http.server.ts`,
    `publicAdoption/schemas.ts`, `routes/api/admin/sponsorships/pledges/-recordPaymentUpload.ts`.
    Mechanical.
  - **4** — `ZodIssueCode` renames (`invalid_string`→`invalid_format`, `invalid_literal`→
    `invalid_value`, `invalid_enum_value`/`invalid_union_discriminator` removed) in
    `components/admin/volunteers/policySettingsLogic.ts`. Mechanical.
  - **8** — minor typing shifts (`ZodTypeDef` no longer exported in `sponsorship/schemas.ts`,
    `TS2769`/`TS18048`/`TS7015` misc).
- **Outcome: reverted.** `git checkout -- package.json bun.lock` + `bun install --frozen-lockfile
  --ignore-scripts` restored zod 3.25.76; `bunx tsc --noEmit` is clean again.
- **Recommended plan:** a dedicated upgrade task (estimate 1–2 days plus review):
  1. Bump to the first version that includes the fix (4.6.6+, respecting `minimumReleaseAge`)
     and use `z.toJSONSchema()` to replace the hand-rolled converter.
  2. Sweep the `z.record` call sites and issue-code switches (mechanical).
  3. Re-type the test fixtures; treat TS2345 clusters as real input/output divergence.
  4. Run the full suite (schema tests are dense) and re-check `bun audit`; exposure today is
     bounded by the 8 MB admin / 1 MB public body caps, so this is a planned upgrade, not an
     incident.
