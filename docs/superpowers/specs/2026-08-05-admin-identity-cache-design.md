# Admin identity cache — design

Date: 2026-08-05
Status: approved, ready for implementation planning

## Problem

Every admin page load runs a serial request waterfall, and the middle of it is
redundant work.

Traced through the code:

| Step | `getSession()` | HTTP |
| --- | --- | --- |
| `beforeLoad` → `requireAdminPageAccess` → `requireSignedInAdminIdentity` | ×1, then `fetchAdminJson` calls it again | `GET /api/admin/me` |
| `AdminLayout` mount effect (`AdminLayout.tsx:136`) | ×1, then `fetchAdminJson` calls it again | `GET /api/admin/me` **again** |
| Page body component effect | ×1 | `GET /api/admin/<data>` |

`fetchAdminIdentity()` is a bare `fetch` with no caching, so:

- **`/api/admin/me` is requested twice per page load**, with an identical
  response. Each request costs a server-side Supabase `admin_user` lookup.
- **The whole sequence repeats on every client-side admin→admin navigation.**
  Moving from Animals to Knowledge re-resolves identity twice from scratch.
- `supabase.auth.getSession()` is called four or more times per page load.

Measured context: 36 admin routes, 24 of them gated by
`requireAdminPageAccess`. There is no admin layout route — the routes are flat
siblings — and `/admin/login` and `/admin/reset-password` live under the same
`/admin/` prefix, so there is no existing shared parent where identity could be
resolved once.

## Goals

- One `/api/admin/me` request per page load instead of two.
- Zero identity requests on admin→admin navigation within a short window.
- No change to the route tree, and no change to how the 12 ungated admin routes
  (login, reset-password, access-denied) behave.

## Non-goals

Explicitly out of scope for this spec, tracked as follow-ups below:

- Converting admin routes to TanStack Router `loader`s so page data fetches in
  parallel with the shell. This is the larger perceived win, but it touches all
  36 route files and every self-fetching component, and it is much safer to do
  on top of a single cached identity source.
- Public bundle work (recharts on `/report/adoption`, Supabase `RealtimeClient`
  shipping in the entry chunk with zero `.channel()` usage, dead
  `AuditChart.tsx`).

## Security constraint: the cache must be client-only

`src/lib/supabase.ts` builds a **module-level singleton** browser client with no
`window` guard, and `src/lib/admin/session.ts` is imported by route modules that
are bundled for SSR. Module state in `session.ts` is therefore shared across
server requests.

A naive module-level identity cache would serve one admin's identity and role to
another admin's request. This is a data leak, not a performance detail.

The cache is therefore guarded so it is **only ever populated in the browser**.
On the server, `getAdminIdentity()` delegates straight to `fetchAdminIdentity()`
with no caching.

Today a server-side call already fails fast — the browser client has no session
on the server — so the guard is not load-bearing yet. It is written in anyway:
if cookie-based sessions are added later, an unguarded cache silently becomes a
cross-admin leak, and that is not a failure mode worth leaving latent.

## Design

### The cache

In `src/lib/admin/session.ts`:

```ts
const IDENTITY_TTL_MS = 60_000;
let cache: { promise: Promise<AdminMeResponse>; fetchedAt: number } | null = null;

export function getAdminIdentity(now = () => new Date()): Promise<AdminMeResponse> {
  if (typeof window === "undefined") return fetchAdminIdentity(); // never cache server-side
  const current = cache;
  if (current && now().getTime() - current.fetchedAt < IDENTITY_TTL_MS) return current.promise;

  const promise = fetchAdminIdentity();
  cache = { promise, fetchedAt: now().getTime() };
  // A failed identity must not stick, or one transient error bricks the panel
  // until reload. Only clear if this entry is still the current one, so a late
  // rejection cannot wipe a newer successful fetch.
  void promise.catch(() => {
    if (cache?.promise === promise) cache = null;
  });
  return promise;
}

export function invalidateAdminIdentity() {
  cache = null;
}
```

Three details carry the weight:

1. **Memoize the promise, not the resolved value.** `beforeLoad` and
   `AdminLayout`'s mount effect overlap in time. Caching only settled values
   would still let both fire a request. Sharing the in-flight promise is what
   actually removes the duplicate.
2. **`cache?.promise === promise`** on the failure path, so a late rejection
   cannot clear a newer entry.
3. **Injectable clock.** Per CLAUDE.md, functions whose behaviour depends on
   time take `now = () => new Date()` rather than reading the clock inline.

### Invalidation

- **TTL: 60 seconds.** Backstop for a role change made elsewhere.
- **Auth events:** invalidate on `SIGNED_OUT`, `SIGNED_IN`, and `USER_UPDATED`.
  `TOKEN_REFRESHED` does **not** invalidate — same user, same role.
- **Explicit:** call `invalidateAdminIdentity()` after access-management
  mutations that can change the acting user's own role, and in
  `AdminLayout.handleLogout`.

The `onAuthStateChange` listener is registered **lazily on first client-side
call**, guarded to register once. A module-level `supabase.auth.onAuthStateChange`
would be a side effect running during SSR.

### Call sites

- `requireSignedInAdminIdentity()` → `getAdminIdentity()`.
- `AdminLayout`'s mount effect → `getAdminIdentity()`; becomes a cache hit with
  zero HTTP.
- `AdminLayout` currently calls `supabase.auth.getSession()` itself (line 133)
  purely to read `session.user.email` and to bail when signed out. Both facts are
  already carried by the identity response — it sets `setEmail(admin.email)`
  immediately afterwards — so that call is dropped and the component reads
  `admin.email` from `getAdminIdentity()`. The signed-out case is already handled
  upstream by `requireSignedInAdminIdentity`'s redirect.

### Expected effect

- `/api/admin/me` per page load: **2 → 1**.
- Identity requests per admin→admin navigation within the TTL: **1 → 0**.
- `getSession()` calls per page load: **5 → 2** — one on the `beforeLoad`
  identity path, one in the page body's own `fetchAdminJson`. (Before: two on the
  `beforeLoad` path, two on `AdminLayout`'s, one in the page body.) Note
  `getSession()` is local — it reads storage and may refresh the token — so this
  is a smaller win than the HTTP reduction and is not the point of the change.

## Error handling

- **Fetch failure:** not cached; the next call retries.
- **401/403:** unchanged. The existing `AdminApiError` path and
  `requireAdminPageAccess`'s redirect to `/admin/login` or `/admin/access-denied`
  still apply.
- **Stale role:** bounded by the 60s TTL. A stale cached role affects **UI
  affordances only** — every admin mutation is still enforced server-side by
  `requireAdmin(request, roles, client)`. This is not a privilege-escalation
  surface.

## Testing

`src/lib/admin/session.test.ts`, using an injected clock and a call-counting
fake identity fetch:

- Two concurrent calls issue **one** underlying fetch.
- A repeat call after resolution but within the TTL issues **no** fetch.
- A call past the TTL refetches.
- A rejected fetch is not cached; the next call refetches.
- `invalidateAdminIdentity()` forces the next call to refetch.
- A late rejection does not clear a newer cached entry.
- With no `window`, the cache is never populated.

Plus a small regression guard asserting that both `requireSignedInAdminIdentity`
and `AdminLayout` route through `getAdminIdentity` rather than
`fetchAdminIdentity` — the same style as the existing
`src/lib/adminRouteAuditing.test.ts`.

## Follow-ups (separate specs)

1. **Route loaders for admin page data** — the larger perceived win; convert the
   busiest pages first rather than all 36 at once.
2. **Public bundle diet** — lazy-load recharts on `/report/adoption`
   (409 kB raw / 111 kB gzip), drop Supabase realtime from the entry chunk
   (251 kB gzip, zero `.channel()` usage), delete dead `AuditChart.tsx`.
