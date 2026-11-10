# CSP nonce and admin session storage — decision note

**Date:** 2026-11-09, updated 2026-11-10.
**Source:** 2026-11-09 audit (AUDIT R4 / REPORT §3 item 3), task backlog-security-20261110.

**Status: both halves are implemented and live (2026-11-10, PR #240, merge `57816730`).**

- **CSP:** `script-src` is nonce-based (`'self' 'nonce-<per-request>' 'strict-dynamic' <hosts>`);
  `'unsafe-inline'` is gone from `script-src`. Verified on production.
- **Admin session:** the admin JWT no longer lives in web storage. A bounded session BFF keeps the
  tokens in `HttpOnly; Secure; SameSite=Strict` cookies and the browser keeps only the short-lived
  access token in module memory. The 180+ data endpoints keep their Bearer/`requireAdmin` contract,
  so the authorization and RLS layers did not move.
- **Trusted Types:** a second, Report-Only policy ships on every response
  (`require-trusted-types-for 'script'; trusted-types 'none'`), reporting DOM-XSS sinks to the same
  collector. It blocks nothing; enforcement is a later decision after the report stream is reviewed.
- **Deliberately unchanged:** `style-src 'unsafe-inline'` (React style attributes cannot carry a
  style nonce), and the cookie-only data-endpoint model (Option C).

## What exists today

- The enforcing CSP is built in [`src/lib/security-headers.ts`](../src/lib/security-headers.ts) and
  applied to every SSR and API response by the wrapper in [`src/server.ts`](../src/server.ts):

  ```
  script-src 'self' 'nonce-<per-request base64 nonce>' 'strict-dynamic' https://www.googletagmanager.com https://maps.googleapis.com https://challenges.cloudflare.com
  ```

  `style-src` still carries `'unsafe-inline'` on purpose (React style attributes, which a style
  nonce cannot cover); `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` and the
  report endpoint (`/api/csp-report`, `report-uri` + `report-to`) are unchanged.

- **Trusted Types Report-Only (2026-11-10).** Every response also carries a separate
  `Content-Security-Policy-Report-Only` header built by `buildTrustedTypesReportOnlyPolicy()` in the
  same module:

  ```
  require-trusted-types-for 'script'; trusted-types 'none'; report-uri /api/csp-report; report-to csp
  ```

  It is static (no nonce, like the enforcing header's baseline fallback), report-only by design, and
  Chromium-only (other browsers ignore the header). `require-trusted-types-for 'script'` reports
  assignments of plain strings to DOM-XSS sinks (`innerHTML`, `script.src`, `eval`, ...);
  `trusted-types 'none'` is the strictest baseline (no policy may be created), so the collected
  reports show the entire surface that would need a policy before enforcement is considered.
  Reports flow through the same collector as the main policy: rate-limited, size-capped, normalised
  (`require-trusted-types-for` / `trusted-types` directives are kept) and logged with
  `console.error("CSP violations")` in the Vercel log stream. Details and promotion criteria are in
  [Trusted Types Report-Only](#trusted-types-report-only-implemented-2026-11-10) below.

- **Nonce plumbing.** `src/server.ts` generates 16 random bytes (Web Crypto) as a base64 nonce per
  request and runs the Start handler inside an `AsyncLocalStorage` store
  ([`src/lib/csp-nonce.server.ts`](../src/lib/csp-nonce.server.ts); isomorphic helper
  [`src/lib/csp-nonce.ts`](../src/lib/csp-nonce.ts)). `src/router.tsx` reads the request's nonce
  through an `ssr.nonce` getter (not a snapshot, because TanStack Start may reuse one router across
  requests) and the root route publishes it as `meta[property=csp-nonce]` for the client hydrator.
  The server also rewrites HTML responses so any `<script>` without a nonce receives the current
  request's nonce (JSON/API responses are not read); the same nonce is passed to
  `applySecurityHeaders()` so the header always matches the markup.
- **JSON-LD and the error page.** JSON-LD data blocks moved from inline `dangerouslySetInnerHTML`
  into route `head.scripts` (`jsonLdScript()` in `src/lib/schema.tsx`), which the router
  nonce-stamps. The static 500 page had an inline `onclick`; event-handler attributes cannot carry a
  nonce, so "Try again" is now a plain same-URL link and the page contains no script at all.
- **Admin session BFF.** `POST /api/admin/session/{login,refresh,logout}` call Supabase Auth
  server-side and set `HttpOnly; Secure; SameSite=Strict; Path=/api/admin/session` cookies (access
  cookie = token lifetime, refresh cookie = 30 days, rotated on refresh; both revoked on logout).
  Every session request enforces `Origin`/`Sec-Fetch-Site` (403 before any provider call) and login
  is rate-limited. `sessionMemory.ts` holds the access token for the tab lifetime, bootstraps from
  `/refresh` on reload, and the pre-BFF `sb-*-auth-token` web-storage entries are removed on
  bootstrap/logout. `noWebStorageAuth.test.ts` fails if a browser admin module reintroduces
  `supabase.auth` persistence or a token write.
- **Live verification (2026-11-10, `https://hkscda.vercel.app`).** `/`, `/report/audit` and
  `/admin/login`: a fresh nonce per response, `'strict-dynamic'` present, no `script-src
'unsafe-inline'`, **0 inline script tags without the matching nonce**; `style-src
'unsafe-inline'` still present. Session endpoints: wrong-origin login → **403**, cookie-less
  refresh → **401** with cookie clearing, `/api/admin/me` without a token → **401**, `/admin/login`
  → **200**.

### Trusted Types Report-Only (implemented 2026-11-10)

The DOM-XSS gap the nonce cannot close: the nonce authenticates the script elements the server
emits, but an injected string that reaches a DOM sink such as `element.innerHTML = ...` still
executes inside an already-trusted script. `require-trusted-types-for 'script'` is the browser
mechanism that surfaces exactly those sinks.

- **Why Report-Only first.** Same two-phase approach the nonce used: collect real reports, tune,
  then enforce. Report-Only cannot break a page, so it is safe to ship on every response including
  the admin surfaces.
- **Baseline chosen: `trusted-types 'none'`.** Any policy creation is reported too, so the first
  report window shows whether the app (or a third-party script) already relies on
  `trustedTypes.createPolicy`. After review, enforcement should carry the smallest vetted allow-list
  of policy names and sanitizer entry points, never `'allow-duplicates'` or a catch-all
  `default` policy.
- **Where the reports go.** The same `report-uri`/`report-to` endpoints, so `/api/csp-report`
  normalises them with no new route: `violated-directive`/`effective-directive` are
  `require-trusted-types-for` or `trusted-types`, and the collector already caps the body
  (16 KiB), the count (20 per request) and the rate (60/min/IP).
- **Promotion criteria.** Enforce only after a real traffic window where every reported sink is
  either (a) already trusted/sanitised, or (b) covered by a named policy the app deliberately
  installs. Do not enforce with `trusted-types 'none'` while legitimate sinks still report: that
  breaks the feature rather than the injection.
- **Tests:** `security-headers.test.ts` (both headers present, TT policy shape, no fetch directives
  in the Report-Only string), `security-headers.nonce.test.ts` (the static Report-Only header
  survives the nonced path) and `-cspReport.test.ts` (both Trusted Types wire formats normalise).
- **Verification:** response headers on the live site should show the enforcing CSP and the static
  Trusted Types Report-Only policy side by side.

### Residual risks (accepted, documented)

- The access token is in JS memory for the tab lifetime, so an XSS during that window can still ride
  the session; it can no longer read a replayable long-lived token from `localStorage`.
- Cross-tab sign-out lands on the next 401/refresh rather than a broadcast.
- The nonce removes the injected-inline-script class but not an injected _external_ script loaded by
  an already-nonced script — that is what `'strict-dynamic'` trades for loader compatibility.
- `style-src 'unsafe-inline'` remains until React style attributes are migrated to classes.
- Trusted Types is _measured_, not enforced: a real DOM-XSS sink is surfaced in the report stream
  but still executes until `require-trusted-types-for 'script'` is promoted after report review.
- The HTML nonce stamping is a response rewrite; it deliberately leaves JSON/API bodies untouched.

## Option A — hardened status quo (superseded 2026-11-10)

The pre-BFF cheap layers: keep the SDK storage model and `'unsafe-inline'`, add a Report-Only
Trusted Types policy, shorten the admin token lifetime, and monitor the existing CSP report
pipeline. Superseded by the session BFF (token half) and Option B (CSP half); the Report-Only
Trusted Types item shipped on 2026-11-10 (see "What exists today").

## Option B — nonce CSP (`script-src 'nonce-…' 'strict-dynamic'`) — implemented 2026-11-10

Implementation and tests are described under "What exists today". The two non-obvious party
constraints, kept here for the record:

- TanStack Start's `getRouter()` did not originally expose a per-request nonce; the bespoke
  `AsyncLocalStorage` store solved that without the internal `@tanstack/start-storage-context`
  package. A router that is reused across requests must read the nonce through the
  `ssr.nonce` getter at render time (a snapshot in `getRouter()` produces markup nonces from the
  previous request and blocked hydration scripts — caught and fixed before merge).
- Every inline script must be nonce-stamped: hydration `<Scripts>`/`ScriptOnce`, route
  `head.scripts` (JSON-LD) and any HTML the framework emits earlier. The server-side stamping pass
  is the safety net for the last case.

**Tests:** `security-headers.nonce.test.ts` (exact directive, no `'unsafe-inline'`,
`style-src` unchanged, reporting kept, pre-set header ignored, per-response header),
`csp-nonce.test.ts`, `csp-nonce.server.test.ts` (generation, per-request isolation across
concurrent awaits) and `csp-nonce-wiring.test.ts` (server → router propagation, nonce getter,
`meta[property=csp-nonce]`, server-only store, error page has no inline handler, no un-nonced
`<script>` remains).

**Follow-ups:** none required for the rollout; the live production check above replaced the
staging-QA step that the implementation branch planned. Trusted Types Report-Only shipped on
2026-11-10 (see "What exists today").

## Option C — HttpOnly SameSite cookies for the data endpoints too (not needed now)

The shipped BFF is a bounded slice of this option: the browser holds only HttpOnly cookies for the
_session_, while data endpoints keep their Bearer contract. The full option would also move
data-endpoint authorization onto the cookie (a server middleware exchanges the cookie for the
Supabase session and injects the same `requireAdmin` contract, or the endpoints read an `HttpOnly`
access cookie). That needs CSRF double-submit or origin checks on every mutation (not only the three
session endpoints), cookie-scope review across ~200 admin API calls, cross-tab behaviour, and
re-testing of the sign-in/recovery paths (AUTH-02/BUG-57); the custom recovery-session storage and
actor-fencing logic would need rework.

**Effort:** L (weeks). **Risk:** high — auth-wide, hard to roll back partially.
**Recommendation:** not needed now: the BFF already removes the replayable long-lived token from web
storage, which was the audit's exposure. Revisit only if the admin threat model requires cookie-only
server sessions (e.g. contractual requirements); if approved, do it as an isolated branch behind a
flag with a manual security review of CSRF, cookie scope, logout and refresh-rotation paths.

## Option D — token obfuscation without moving it (rejected)

WebCrypto-wrapping the token in a non-extractable key, or splitting it across storage, does not
help: the XSS payload runs in the same origin and can call the same decrypt/read path the app
calls. Rejected as security theatre. In-memory-only access tokens (no persistence) reduce the theft
window but still allow session-riding XSS; that is exactly the residual risk the BFF accepts.

## Recommendation / next steps

1. **Shipped (2026-11-10):** bounded session BFF + nonce CSP; see the status block above.
2. **Shipped (2026-11-10):** Trusted Types in Report-Only
   (`require-trusted-types-for 'script'; trusted-types 'none'`) with the same collector; see
   "What exists today". It measures DOM-XSS sinks without blocking.
3. **Next:** review the Trusted Types report volume over a real traffic window. If clean, enforce
   `require-trusted-types-for 'script'` with a minimal vetted policy allow-list (never a catch-all
   `default` policy). In parallel, migrate the remaining React inline styles to classes so
   `style-src 'unsafe-inline'` can be dropped.
4. **Only if the admin threat model requires it:** full Option C, behind a flag and its own
   security review.

The behaviour change is recorded in [`BUGS.md`](BUGS.md) and [`FIX_REPORT.md`](FIX_REPORT.md).

## Appendix — zod 3 → 4 upgrade (completed 2026-11-10)

The direct dependency is **zod 4.6.6** in `package.json`/`bun.lock`: the first release line with
the GHSA-mrhx-c7xc-m3w5 fix, and the newest version bunfig's 24 h `minimumReleaseAge` guard accepted
(4.6.7 was still too new). Merged as PR #241 (`43a40ba9`).

What changed:

- `src/lib/volunteers/policy/jsonSchema.ts`: the hand-rolled zod 3 `_def` walker is now a small
  typed adapter over zod 4's `_zod.def`/check definitions. It still produces the exact restricted
  JSON Schema pinned in `20260913065257_volunteer_policy_validation.sql` (the migration-sync test
  and the byte-hash test in `messages.test.ts` pass unchanged), so the database matcher needed no
  migration. `z.toJSONSchema()` was evaluated and rejected: it emits draft-2020-12 keywords
  (`format`, `oneOf`, `$schema`) that the fixed SQL matcher does not understand, and it cannot
  reproduce the pinned schema byte for byte.
- `z.record(valueSchema)` → `z.record(z.string(), valueSchema)` at every call site.
- `ZodIssueCode` renames: the policy screen maps `invalid_format`/`invalid_value` (and the union,
  key and element codes) instead of `invalid_string`/`invalid_literal`/`invalid_enum_value`.
- zod 4 applies a field's inner `.default()` through `.partial()`/`.optional()`. Every PATCH schema
  built that way (content, documents, adoption statuses, volunteer activities, CRM supporter) is
  now an explicit all-optional schema with no defaults, and a supporter update keeps `tags` absent
  unless they were sent. Runtime validation is unchanged; a PATCH no longer parses defaults into
  fields the caller did not send (that would have overwritten them).
- Stricter parsed types: optional search fields are genuinely optional again (they were
  `transform`-wrapped), so fixtures and call sites typecheck without blanket casts. Test fixtures
  that used non-RFC UUIDs (payment public config) now use RFC 4122 ids, because zod 4's `uuid()`
  enforces the version/variant nibbles; production ids are RFC v4, so behaviour there is unchanged.
- TanStack Router: routes passed a raw zod schema as `validateSearch`; zod 4 implements Standard
  Schema, whose parsed output the router types as required link search params. The routes now use
  `src/lib/searchValidator.ts`, which exposes the schema's optional input separately from its parsed
  output, so `<Link search>` stays optional while `Route.useSearch()` keeps the parsed type.
- `z.ZodTypeDef` is no longer exported: `src/lib/sponsorship/schemas.ts` types the terms schema as
  `z.ZodType<string, unknown>`.

**Toolchain.** The repo now pins **Bun 1.4.4** (`.bun-version`): Bun 1.3.14's bundler dropped zod 4
namespace re-exports in the Playwright browser-fixture bundles (`util is not defined`), which failed
8 dashboard browser tests; 1.4.4 bundles them correctly (the PR also carries a fixture-level
namespace fix as a belt-and-braces measure). Production Vite builds were unaffected either way.

Measured result: `tsc` errors **139 → 0** (the first, reverted attempt measured 113 with 4.6.5; the
stricter 4.6.6 uuid and patch semantics added the rest), `bun run lint` 0 errors (the same 56
pre-existing warnings), focused zod suites 337 pass / 1 skip / 0 fail, and the full-suite numbers
match the zod 3 baseline exactly: 7,818 pass, 753 skip, 129 fail — the 129 are the known
Windows-sandbox/environment failures (browser-launch and python/pdf cases), and the set of failing
files is identical before and after. CI on the merged PR (`verify`, `brand-verify`, `rls-matrix`,
`admin-e2e`, `a11y-verify`) is green and the Vercel production deployment succeeded.

Remaining advisories: `bun audit` still lists `zod <4.6.6` through transitive build/dev copies —
`@tanstack/router-generator` and the start plugin resolve 4.6.5 (inside their own range) and
`chromium-bidi` (Lighthouse dev tooling) pins zod 3.25.76. Forcing those with overrides would be
unrelated dependency churn and a build-tool risk, so only the direct app dependency is fixed; the
nested copies are tooling-only. The rest of the audit is the pre-existing build/dev tooling set
(esbuild, js-yaml, …), unchanged by this upgrade.
