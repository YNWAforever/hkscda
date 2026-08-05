# Admin identity cache — design

Date: 2026-08-05
Status: approved, ready for implementation planning

> Revised during implementation planning. The first version specced a
> hand-rolled promise memo in `src/lib/admin/session.ts`. That was wrong: the
> codebase already caches this data with react-query in four places, and a
> second caching layer would have gone stale exactly when it mattered. See
> "Rejected: hand-rolled cache" at the end.

## Problem

Every admin page load runs a serial request waterfall, and the middle of it is
redundant work.

| Step | HTTP |
| --- | --- |
| `beforeLoad` → `requireAdminPageAccess` → `requireSignedInAdminIdentity` | `GET /api/admin/me` |
| `AdminLayout` mount effect (`AdminLayout.tsx:136`) | `GET /api/admin/me` **again** |
| Page body component effect | `GET /api/admin/<data>` |

`fetchAdminIdentity()` is a bare `fetch` with no caching, so `/api/admin/me` is
requested twice per page load with an identical response — each costing a
server-side Supabase `admin_user` lookup — and the whole sequence repeats on
every client-side admin→admin navigation.

### The identity is already cached, inconsistently

Six places resolve the signed-in admin, and they do not agree:

| Site | Key | queryFn | staleTime |
| --- | --- | --- | --- |
| `session.ts` `requireSignedInAdminIdentity` | — | bare `fetchAdminIdentity` | — |
| `AdminLayout.tsx:136` | — | bare `fetchAdminIdentity` | — |
| `AccessManagement.tsx:182` | `["admin-me"]` | `fetchAdminIdentity` | none |
| `access-denied.tsx:43` | `["admin-me"]` | `fetchAdminIdentity` | none |
| `PaymentsReconcile.tsx:105` | `["admin-me"]` | inline `fetchAdminJson("/api/admin/me")` | none |
| `AdoptionGuideReleaseManagement.tsx:91` | `["admin-identity"]` | `fetchAdminIdentity` | none |

Consequences that exist today, independent of the duplicate:

- **Two cache keys for one resource.** `AdoptionGuideReleaseManagement` reads
  `["admin-identity"]`, so `AccessManagement`'s
  `invalidateQueries({ queryKey: ["admin-me"] })` never clears it. After an
  admin changes a role, that surface keeps the old identity.
- **No `staleTime` anywhere.** react-query's default is `0`, so every mount of
  these components refetches `/api/admin/me`.
- **One site duplicates the fetch inline** rather than calling
  `fetchAdminIdentity`, with its own local response type.

Measured context: 36 admin routes, 24 gated by `requireAdminPageAccess`. There
is no admin layout route — routes are flat siblings — and `/admin/login` and
`/admin/reset-password` sit under the same prefix.

## Goals

- One `/api/admin/me` request per page load instead of two.
- Zero identity requests on admin→admin navigation inside the stale window.
- One cache key, one `queryFn`, one `staleTime` for the admin identity, so
  invalidation reaches every consumer.

## Non-goals

- Converting admin routes to router `loader`s so page data fetches in parallel
  with the shell. Larger perceived win, but it touches all 36 route files and
  every self-fetching component; safer on top of a single identity source.
- Public bundle work (recharts on `/report/adoption`, Supabase `RealtimeClient`
  in the entry chunk with zero `.channel()` usage, dead `AuditChart.tsx`).

## Design

react-query is already the caching layer, the `QueryClient` is already in router
context (`src/router.tsx:10`), and `getRouter()` builds a fresh client per call —
so on the server each request gets its own cache with no cross-request leak.
Use it rather than adding a second layer beside it.

### Shared query definition

New module `src/lib/admin/identity.ts`, one responsibility — the canonical
definition of "who is the signed-in admin":

```ts
import { queryOptions } from "@tanstack/react-query";
import { fetchAdminIdentity } from "./session";

export const ADMIN_IDENTITY_QUERY_KEY = ["admin-me"] as const;

/**
 * Long enough that a page load and the navigations that follow it share one
 * response; short enough that a role changed elsewhere shows up promptly.
 */
export const ADMIN_IDENTITY_STALE_TIME_MS = 60_000;

export function adminIdentityQueryOptions() {
  return queryOptions({
    queryKey: ADMIN_IDENTITY_QUERY_KEY,
    queryFn: fetchAdminIdentity,
    staleTime: ADMIN_IDENTITY_STALE_TIME_MS,
  });
}
```

Every consumer goes through this factory, so the key, fetcher and staleTime
cannot drift apart again.

### `beforeLoad` primes the cache

`requireSignedInAdminIdentity` and `requireAdminPageAccess` take the
`QueryClient` from router context:

```ts
export async function requireSignedInAdminIdentity(queryClient: QueryClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw redirect({ to: "/admin/login" });
  return queryClient.ensureQueryData(adminIdentityQueryOptions());
}
```

Call sites become `beforeLoad: async ({ context }) =>
  requireAdminPageAccess("area", context.queryClient)`.

Passing the client explicitly rather than reaching for a module-level singleton
is what keeps the cache per-request on the server.

### Consumers

- `AdminLayout` replaces its mount effect with
  `useQuery(adminIdentityQueryOptions())`. `beforeLoad` has already populated
  the entry for this navigation, so this is a cache hit with no request — it is
  the second `GET /api/admin/me` today.
- `AdminLayout` also drops its own `supabase.auth.getSession()` call, which
  exists only to read `session.user.email` and bail when signed out. Both are
  already in the identity response, and the signed-out case is handled upstream
  by `requireSignedInAdminIdentity`'s redirect.
- `AccessManagement`, `access-denied`, `PaymentsReconcile` and
  `AdoptionGuideReleaseManagement` all switch to
  `useQuery(adminIdentityQueryOptions())`. This is what folds
  `["admin-identity"]` back into `["admin-me"]`.

### Invalidation

`AccessManagement`'s existing
`queryClient.invalidateQueries({ queryKey: ["admin-me"] })` becomes correct for
every consumer once they share the key — no new invalidation machinery. It
should use `ADMIN_IDENTITY_QUERY_KEY` rather than a repeated literal.

`AdminLayout.handleLogout` calls `queryClient.clear()` after `signOut()`, so the
next admin to sign in on the same tab cannot read the previous one's cached
identity.

### Expected effect

- `/api/admin/me` per page load: **2 → 1**.
- Identity requests per admin→admin navigation inside the stale window: **1 → 0**.
- Mounting `AccessManagement`, `PaymentsReconcile` or the guide-release surface
  no longer refetches identity, because `staleTime` is no longer `0`.
- `AdoptionGuideReleaseManagement` starts honouring role-change invalidation.

## Error handling

- **Fetch failure:** react-query does not cache rejections as data; the next
  mount or `ensureQueryData` retries. `ensureQueryData` rejects, so a failure in
  `beforeLoad` propagates exactly as `fetchAdminIdentity` does today.
- **401/403:** unchanged. `AdminApiError` and `requireAdminPageAccess`'s
  redirects to `/admin/login` and `/admin/access-denied` still apply.
- **Stale role:** bounded by the 60s `staleTime`, and invalidated immediately on
  a role change through the shared key. A stale role affects **UI affordances
  only** — every admin mutation is still enforced server-side by
  `requireAdmin(request, roles, client)`. Not a privilege-escalation surface.

## Testing

`bun test` runs without a DOM, so these are logic and wiring tests, not renders.

- `src/lib/admin/identity.test.ts` — the factory returns the shared key, the
  shared `queryFn`, and a non-zero `staleTime`. Cheap, but it is what stops a
  future edit reintroducing `staleTime: 0`.
- `src/lib/admin/session.test.ts` (exists; extend) — `requireSignedInAdminIdentity`
  redirects when there is no session, and otherwise resolves through
  `ensureQueryData` on the client it was handed. Use a real `QueryClient` and a
  `globalThis.fetch` spy, matching the file's existing style; assert that a
  second call with the same client issues no second request.
- `src/lib/adminIdentityCaching.test.ts` (new) — source-level regression guard,
  in the style of `src/lib/adminRouteAuditing.test.ts`: no admin source outside
  `identity.ts` may reference a raw `"admin-me"` or `"admin-identity"` literal,
  and `AdminLayout` may not call `fetchAdminIdentity` directly. This is the
  check that keeps the six consumers from drifting apart a second time.

## Rejected: hand-rolled cache

The first draft memoized the in-flight promise in a module-level variable in
`session.ts`, with a 60s TTL, an injected `isBrowser` guard, and an
`onAuthStateChange` listener.

Rejected once the full call-site inventory came in:

- **It would have gone stale exactly when it mattered.** `AccessManagement`
  invalidates `["admin-me"]` after a role change. That clears react-query's copy
  but not a module-level one, so `AdminLayout` would show the old role right
  after the operation designed to change it.
- **It solved an SSR problem that does not exist.** The `isBrowser` guard was
  there because module state is shared across server requests. `getRouter()`
  already creates a `QueryClient` per request, so react-query's cache is
  per-request by construction.
- **It left the existing drift in place** — two keys, four uncoordinated
  consumers, `staleTime: 0` — and added a third caching mechanism beside them.

The react-query version is also less code: no promise bookkeeping, no TTL
arithmetic, no browser guard, no auth listener.

Its one real cost: `requireAdminPageAccess` gains a `QueryClient` parameter, so
all 24 gated route files need a one-line `beforeLoad` change. Mechanical, and
`bun run typecheck` catches any miss.
