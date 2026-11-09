# CSP `script-src 'unsafe-inline'` and admin JWT in web storage — decision note

**Date:** 2026-11-10
**Source:** 2026-11-09 audit (AUDIT R4 / REPORT §3 item 3), task backlog-security-20261110.
**Status:** decision recorded, no behaviour changed. The two changes below are deliberately _not_
implemented in this batch; this note is the artefact a follow-up task works from.

## What exists today

- The enforcing CSP is built in [`src/lib/security-headers.ts`](../src/lib/security-headers.ts)
  and applied to every SSR and API response by the wrapper in
  [`src/server.ts`](../src/server.ts). The script directive is:

  ```
  script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://maps.googleapis.com https://challenges.cloudflare.com
  ```

  `style-src` also carries `'unsafe-inline'`; `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'` and a report endpoint (`/api/csp-report`, `report-uri` + `report-to`) are
  already there.
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

## Option A — hardened status quo (recommended now)

Keep the Supabase SDK storage model and `'unsafe-inline'`; add cheap, low-risk layers:

1. Nonce-based `script-src` migration (see Option B below) as its own task; until then keep the
   enforcing CSP plus reporting and add a **Report-Only** `require-trusted-types-for 'script'`
   policy to surface DOM-XSS sinks without breaking the app (Trusted Types is Chromium-only;
   safe to report first).
2. Shorten the admin access-token lifetime in Supabase Auth settings (e.g. 30 min) and keep the
   existing expiry watcher/sign-out path; refresh rotation already exists.
3. Keep the admin panel on its own hostname or path and keep the CSP report pipeline (already
   present) monitored; an enforced CSP block is visible rather than silent.

**Effort:** S (hours, config + one report-only header). **Risk:** low. **Limits:** does not
remove the token from `localStorage`, so XSS still equals full session theft.

## Option B — nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`)

TanStack Router does support a router-level script nonce: `createRouter({ ssr: { nonce } })`
propagates to its inline `<Scripts>` / `ScriptOnce` tags
(`@tanstack/react-router` `router.options.ssr?.nonce`; verified in the installed 1.170.41
package). The blocker is plumbing the per-request value into `getRouter()`:
[`src/router.tsx`](../src/router.tsx) is called with no arguments by TanStack Start's server
handler (`start-server-core` calls `entries.routerEntry.getRouter()` per request and caches the
promise), so the request is not in scope there. Two viable implementations, both needing an
integration test against a real SSR render:

1. **Request-middleware + start context:** generate a nonce in a `requestMiddleware`
   ([`src/start.ts`](../src/start.ts)), then read the in-flight request from
   `@tanstack/start-storage-context` (`getStartContext().request`) inside `getRouter` and set
   `ssr: { nonce }`. That package is currently a transitive dependency (not in
   `package.json`), so this means adding an explicit dependency on an internal package.
2. **Single-pass document render hook:** keep a module-scoped request store keyed by an
   `AsyncLocalStorage`, set it in `server.ts` before delegating to the start handler, read it in
   `getRouter`. Works on Node/Vercel but is bespoke plumbing.

Everything inline must be covered at once or the app breaks in production: TanStack hydration
scripts (handled by the nonce option), the JSON-LD `<script type="application/ld+json">` blocks
emitted by `renderJsonLd` (data blocks, normally exempt, but must be checked), and any inline
handler added later. `'unsafe-inline'` can stay in a Report-Only policy during rollout.

**Effort:** M (1–2 days including a browser-verified report-only phase and a test that renders a
page and asserts header nonce == every inline script nonce). **Risk:** medium — an un-nonced
inline script silently blocks hydration or analytics; requires deployment observation.
**Recommendation:** approve as a separate, CSP-only task after the current backlog. It does not
fix the login risk on its own but removes the "injected inline script" class.

## Option C — HttpOnly SameSite cookie sessions through a server-side auth boundary

Move admin auth off bearer tokens in web storage: the browser holds only an `HttpOnly`,
`Secure`, `SameSite=Lax` cookie; a server middleware exchanges it for the Supabase session and
injects the same `requireAdmin` contract. Needs refresh-token rotation on the server, CSRF
double-submit for state-changing routes, same-origin fetch changes across ~200 admin API calls,
cross-tab behaviour, and re-testing of the sign-in/recovery flows (AUTH-02/BUG-57 paths).
Supabase's SSR helpers support this model, but the repo's custom recovery-session storage and
actor-fencing logic would need rework.

**Effort:** L (weeks). **Risk:** high — auth-wide, hard to roll back partially.
**Recommendation:** the correct end state if the admin panel threat model justifies it (e.g.
hosted admin access for many people, contractual requirements); not worth doing in this batch.
If approved, do it as an isolated branch behind a feature flag, with a manual security review of
CSRF, cookie scope, logout and refresh-rotation paths.

## Option D — token obfuscation without moving it (rejected)

WebCrypto-wrapping the token in a non-extractable key, or splitting it across storage, does not
help: the XSS payload runs in the same origin and can call the same decrypt/read path the app
calls. Rejected as security theatre. In-memory-only access tokens (no persistence) reduce the
theft window but force a re-login on every reload and still allow session-riding XSS; a partial
mitigation at best, not a replacement for Option C.

## Recommendation

1. **Now:** Option A, with the Report-Only Trusted Types header and a ticket for Option B. Keep
   `'unsafe-inline'` until Option B lands; removing it without nonces breaks TanStack Start
   hydration.
2. **Next hardening task:** Option B as a CSP-only change with a report-only soak.
3. **Only if the admin threat model requires it:** Option C as a separately approved migration,
   because it rewrites the whole admin authentication boundary.

No behaviour was changed in this batch beyond the private document bucket fix recorded in
[`BUGS.md`](BUGS.md) and [`FIX_REPORT.md`](FIX_REPORT.md).

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
