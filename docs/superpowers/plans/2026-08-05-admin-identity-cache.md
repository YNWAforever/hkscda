# Admin Identity Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every admin surface resolve the signed-in admin through one shared react-query entry, so `/api/admin/me` is fetched once per page load instead of twice and not at all on navigation within a minute.

**Architecture:** Add a single `adminIdentityQueryOptions()` factory (key + `queryFn` + `staleTime`). `beforeLoad` primes it via `queryClient.ensureQueryData` using the client already in router context; every component reads it with `useQuery`. This replaces two bare fetches and folds four drifted react-query call sites onto one key.

**Tech Stack:** TypeScript, TanStack Start/Router, TanStack Query v5, Supabase JS, `bun:test`.

**Spec:** `docs/superpowers/specs/2026-08-05-admin-identity-cache-design.md`

---

## Background the engineer needs

The admin identity (`GET /api/admin/me`) is resolved in **six** places that do
not agree with each other:

| Site | Key today | queryFn today |
| --- | --- | --- |
| `src/lib/admin/session.ts` `requireSignedInAdminIdentity` | — | bare `fetchAdminIdentity` |
| `src/components/admin/AdminLayout.tsx:136` | — | bare `fetchAdminIdentity` |
| `src/components/admin/access/AccessManagement.tsx:182` | `["admin-me"]` | `fetchAdminIdentity` |
| `src/routes/admin/access-denied.tsx:43` | `["admin-me"]` | `fetchAdminIdentity` |
| `src/components/admin/donations/PaymentsReconcile.tsx:105` | `["admin-me"]` | inline `fetchAdminJson("/api/admin/me")` |
| `src/components/admin/content/AdoptionGuideReleaseManagement.tsx:91` | `["admin-identity"]` | `fetchAdminIdentity` |

None sets `staleTime`, and react-query's default is `0`, so every mount
refetches. `["admin-identity"]` is a second key for the same resource, so
`AccessManagement`'s `invalidateQueries({ queryKey: ["admin-me"] })` never
reaches it.

Key files:

- `src/lib/admin/session.ts` — `fetchAdminJson`, `fetchAdminIdentity`,
  `requireSignedInAdminIdentity`, `requireAdminPageAccess`.
- `src/lib/admin/pageAccess.ts` — re-export barrel. Route files and components
  import from **here**, not from `session.ts`. New symbols must be re-exported
  or call sites cannot see them.
- `src/lib/admin/http.ts` — re-exports `fetchAdminJson`, `getAdminAccessToken`.
- `src/router.tsx:5-16` — `getRouter()` creates a fresh `QueryClient` per call
  and passes it as `context: { queryClient }`. This is why the cache is
  per-request on the server and why the client must be passed explicitly rather
  than kept in a module variable.
- `src/lib/admin/session.test.ts` — exists. Fakes Supabase with
  `mock.module("../supabase", …)` at module scope and swaps `globalThis.fetch`
  per test. **Extend it; do not add a second faking style.**

Environment note: `bun test` runs with **no DOM** (`typeof window` is
`undefined`, no happy-dom configured). These are logic and wiring tests, not
component renders.

Commands:

- One file: `bun test src/lib/admin/identity.test.ts`
- Full suite: `bun test`
- Typecheck: `bun run typecheck` — **the build does not typecheck**
- Lint: `bun run lint`

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/lib/admin/identity.ts` | Create | Canonical query definition for the admin identity: key, fetcher, staleTime. |
| `src/lib/admin/identity.test.ts` | Create | Pins the shared key and a non-zero staleTime. |
| `src/lib/admin/session.ts` | Modify | `requireSignedInAdminIdentity` / `requireAdminPageAccess` take a `QueryClient` and prime the cache. |
| `src/lib/admin/pageAccess.ts` | Modify | Re-export the new symbols. |
| `src/lib/admin/session.test.ts` | Modify | Wiring tests for the two guards. |
| 24 gated route files + `src/routes/admin/access-denied.tsx` | Modify | Pass `context.queryClient` into `beforeLoad`. |
| `src/components/admin/AdminLayout.tsx` | Modify | `useQuery` instead of a mount fetch; clear cache on logout. |
| `AccessManagement.tsx`, `PaymentsReconcile.tsx`, `AdoptionGuideReleaseManagement.tsx`, `access-denied.tsx` | Modify | Use the shared factory. |
| `src/lib/adminIdentityCaching.test.ts` | Create | Regression guard against the six sites drifting apart again. |

---

### Task 1: Create the shared query definition

**Files:**
- Create: `src/lib/admin/identity.ts`
- Create: `src/lib/admin/identity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/admin/identity.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import {
  ADMIN_IDENTITY_QUERY_KEY,
  ADMIN_IDENTITY_STALE_TIME_MS,
  adminIdentityQueryOptions,
} from "./identity";
import { fetchAdminIdentity } from "./session";

describe("admin identity query options", () => {
  test("every consumer gets the same cache key", () => {
    // Six places resolved the identity before this existed, under two different
    // keys — so invalidating one left the other showing a stale role.
    //
    // queryOptions() brands queryKey with react-query's DataTag type so it can
    // infer data types at the useQuery call sites. Spread both sides to compare
    // contents rather than the branded type — comparing branded-to-plain fails
    // `bun run typecheck`.
    expect([...adminIdentityQueryOptions().queryKey]).toEqual([...ADMIN_IDENTITY_QUERY_KEY]);
    expect([...ADMIN_IDENTITY_QUERY_KEY]).toEqual(["admin-me"]);
  });

  test("uses the shared fetcher rather than an inline duplicate", () => {
    expect(adminIdentityQueryOptions().queryFn).toBe(fetchAdminIdentity);
  });

  test("caches for long enough to survive a navigation", () => {
    // react-query's default staleTime is 0, which is why every mount refetched.
    expect(ADMIN_IDENTITY_STALE_TIME_MS).toBe(60_000);
    expect(adminIdentityQueryOptions().staleTime).toBe(ADMIN_IDENTITY_STALE_TIME_MS);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/lib/admin/identity.test.ts`
Expected: FAIL — cannot resolve `./identity`.

- [ ] **Step 3: Create the module**

Create `src/lib/admin/identity.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";

import { fetchAdminIdentity } from "./session";

export const ADMIN_IDENTITY_QUERY_KEY = ["admin-me"] as const;

/**
 * Long enough that a page load and the navigations after it share one response;
 * short enough that a role changed elsewhere shows up promptly. Role changes
 * made in this app invalidate the key directly, so this is only the backstop.
 */
export const ADMIN_IDENTITY_STALE_TIME_MS = 60_000;

/**
 * The one definition of "who is the signed-in admin".
 *
 * Six call sites used to answer this independently, under two different query
 * keys and with no staleTime, so the identity was refetched on every mount and
 * a role change never reached one of them. Everything goes through here now.
 */
export function adminIdentityQueryOptions() {
  return queryOptions({
    queryKey: ADMIN_IDENTITY_QUERY_KEY,
    queryFn: fetchAdminIdentity,
    staleTime: ADMIN_IDENTITY_STALE_TIME_MS,
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun test src/lib/admin/identity.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/identity.ts src/lib/admin/identity.test.ts
git commit -m "feat: add a shared admin identity query definition"
```

---

### Task 2: Prime the cache in beforeLoad

**Files:**
- Modify: `src/lib/admin/session.ts:122-139`
- Modify: `src/lib/admin/pageAccess.ts`
- Test: `src/lib/admin/session.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/admin/session.test.ts`. Extend the existing
`await import("./session")` destructure to include `requireSignedInAdminIdentity`,
and add `import { QueryClient } from "@tanstack/react-query";` at the top.

```ts
describe("requireSignedInAdminIdentity", () => {
  const originalFetch = globalThis.fetch;
  let calls: number;

  beforeEach(() => {
    calls = 0;
    globalThis.fetch = mock(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ admin: { id: "a1", email: "a@b.c", role: "admin" } }),
        { headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    getSession.mockResolvedValue({ data: { session: { access_token: "session-token" } } });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("resolves the identity through the query client it is given", async () => {
    const queryClient = new QueryClient();
    const { admin } = await requireSignedInAdminIdentity(queryClient);
    expect(admin.role).toBe("admin");
    expect(calls).toBe(1);
  });

  test("a second call on the same client issues no second request", async () => {
    // This is the duplicate GET /api/admin/me: beforeLoad primes the entry and
    // AdminLayout reads it back.
    const queryClient = new QueryClient();
    await requireSignedInAdminIdentity(queryClient);
    await requireSignedInAdminIdentity(queryClient);
    expect(calls).toBe(1);
  });

  test("redirects to login when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const queryClient = new QueryClient();
    await expect(requireSignedInAdminIdentity(queryClient)).rejects.toBeDefined();
    expect(calls).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test src/lib/admin/session.test.ts -t "requireSignedInAdminIdentity"`
Expected: FAIL — the function takes no arguments and does not use a query client.

- [ ] **Step 3: Thread the client through**

In `src/lib/admin/session.ts`, add the imports:

```ts
import type { QueryClient } from "@tanstack/react-query";

import { adminIdentityQueryOptions } from "./identity";
```

Then replace `requireSignedInAdminIdentity` and `requireAdminPageAccess`:

```ts
export async function requireSignedInAdminIdentity(queryClient: QueryClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw redirect({ to: "/admin/login" });
  // ensureQueryData is what makes AdminLayout's later useQuery a cache hit
  // instead of a second GET /api/admin/me.
  return queryClient.ensureQueryData(adminIdentityQueryOptions());
}

export async function requireAdminPageAccess(area: AdminAccessArea, queryClient: QueryClient) {
  const { admin } = await requireSignedInAdminIdentity(queryClient);
  if (!canRoleAccessAdminArea(admin.role, area)) {
    throw redirect({
      to: "/admin/access-denied",
      search: { area },
    } as never);
  }
  return admin;
}
```

`identity.ts` imports `fetchAdminIdentity` from `session.ts` and `session.ts`
imports `adminIdentityQueryOptions` from `identity.ts`. This circular import is
fine — both are function references resolved at call time, not module-evaluation
time. If it ever becomes a problem, move `fetchAdminIdentity` into `identity.ts`.

- [ ] **Step 4: Re-export the new symbols**

In `src/lib/admin/pageAccess.ts`:

```ts
export type { AdminMeResponse } from "./session";
export {
  fetchAdminIdentity,
  firstAllowedAdminRouteForIdentity,
  requireAdminPageAccess,
  requireSignedInAdminIdentity,
} from "./session";
export {
  ADMIN_IDENTITY_QUERY_KEY,
  ADMIN_IDENTITY_STALE_TIME_MS,
  adminIdentityQueryOptions,
} from "./identity";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/lib/admin/session.test.ts`
Expected: PASS for the new describe block. `bun run typecheck` will now report
errors in the 24 route files — that is Step 6.

- [ ] **Step 6: Update every gated route's beforeLoad**

Run `bun run typecheck` and fix each reported route. The change is mechanical —
in each file, `beforeLoad` gains a `{ context }` parameter and passes
`context.queryClient`:

```ts
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("contentManagement", context.queryClient);
  },
```

`src/routes/admin/access-denied.tsx:26-28` uses the other guard:

```ts
  beforeLoad: async ({ context }) => {
    await requireSignedInAdminIdentity(context.queryClient);
  },
```

To list the files to touch:

```bash
grep -rln "requireAdminPageAccess\|requireSignedInAdminIdentity" src/routes/admin
```

Expected: 25 files (24 gated + `access-denied.tsx`). Keep each route's existing
area string exactly as it is — do not "tidy" them.

- [ ] **Step 7: Verify**

Run: `bun test && bun run typecheck`
Expected: full suite PASS, typecheck clean. A typecheck error naming
`context.queryClient` means a route was missed.

- [ ] **Step 8: Commit**

```bash
git add src/lib/admin/session.ts src/lib/admin/pageAccess.ts src/lib/admin/session.test.ts src/routes/admin
git commit -m "refactor: prime the admin identity cache in beforeLoad"
```

---

### Task 3: Remove AdminLayout's duplicate request

**Files:**
- Modify: `src/components/admin/AdminLayout.tsx` — imports (line 3, 8), effect (131-143), logout (153-156)

`AdminLayout` currently calls `supabase.auth.getSession()` only to read
`session.user.email` and bail when signed out. Both are already in the identity
response, and the signed-out case is handled upstream by
`requireSignedInAdminIdentity`'s redirect — so that call goes away.

- [ ] **Step 1: Update the imports**

Replace line 8:

```ts
import { adminIdentityQueryOptions } from "../../lib/admin/pageAccess";
```

Add to the top import block:

```ts
import { useQuery, useQueryClient } from "@tanstack/react-query";
```

- [ ] **Step 2: Replace the state and effect**

Delete the `email` and `adminRole` `useState` declarations (lines 128-129) and
replace the effect (lines 131-143) with:

```tsx
  const queryClient = useQueryClient();
  // beforeLoad already primed this entry for the current navigation, so this is
  // a cache hit with no request. It used to be a second GET /api/admin/me.
  const { data: identity } = useQuery(adminIdentityQueryOptions());
  const email = identity?.admin.email ?? null;
  const adminRole = identity?.admin.role ?? null;

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
```

Keep the `collapsed` and `mobileOpen` `useState` declarations as they are.

- [ ] **Step 3: Clear the cache on logout**

Replace `handleLogout`:

```tsx
  async function handleLogout() {
    await supabase.auth.signOut();
    // Otherwise the next admin to sign in on this tab reads the previous one's
    // cached identity.
    queryClient.clear();
    navigate({ to: "/admin/login" });
  }
```

- [ ] **Step 4: Verify**

Run: `bun test && bun run typecheck && bun run lint`
Expected: PASS, clean, 0 lint errors.

`supabase` is still imported for `signOut`, so the line 5 import stays. If lint
flags it unused, Step 3 was missed. If it flags `useState` unused, more state
was deleted than intended.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AdminLayout.tsx
git commit -m "fix: stop AdminLayout refetching the admin identity"
```

---

### Task 4: Fold the four drifted consumers onto the shared key

**Files:**
- Modify: `src/components/admin/access/AccessManagement.tsx:181-192`
- Modify: `src/routes/admin/access-denied.tsx:43`
- Modify: `src/components/admin/donations/PaymentsReconcile.tsx:104-107`
- Modify: `src/components/admin/content/AdoptionGuideReleaseManagement.tsx:90-94`

- [ ] **Step 1: AccessManagement**

Replace the `meQuery` definition (lines 181-184):

```tsx
  const meQuery = useQuery(adminIdentityQueryOptions());
```

In `invalidate()` (line 190), replace the literal with the shared key:

```tsx
      queryClient.invalidateQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY }),
```

Update the import on line 7:

```ts
import { ADMIN_IDENTITY_QUERY_KEY, adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
```

- [ ] **Step 2: access-denied**

Replace line 43:

```tsx
  const { data } = useQuery(adminIdentityQueryOptions());
```

Update the import block at line 7-9 to pull `adminIdentityQueryOptions` from
`../../lib/admin/pageAccess` and drop `fetchAdminIdentity` if now unused.

- [ ] **Step 3: PaymentsReconcile**

Replace lines 104-107 — this one had an inline duplicate of the fetcher with its
own local response type:

```tsx
  const { data: identityData } = useQuery(adminIdentityQueryOptions());
```

Add the import:

```ts
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
```

If the local `AdminIdentityResponse` type is now unused, delete it. If other
code still uses it, leave it.

- [ ] **Step 4: AdoptionGuideReleaseManagement**

This is the one on the wrong key (`["admin-identity"]`), so it never saw a role
change. Replace lines 91-94:

```tsx
  const identityQuery = useQuery(adminIdentityQueryOptions());
```

Update the import on line 5:

```ts
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
```

- [ ] **Step 5: Verify**

Run: `bun test && bun run typecheck && bun run lint`
Expected: PASS, clean, 0 lint errors.

Then confirm the old keys are gone:

```bash
grep -rn '"admin-identity"' src/ ; grep -rn '"admin-me"' src/ --include=*.tsx
```

Expected: no output from either. The only `"admin-me"` literal left in the tree
should be in `src/lib/admin/identity.ts` and its test.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/access/AccessManagement.tsx src/routes/admin/access-denied.tsx src/components/admin/donations/PaymentsReconcile.tsx src/components/admin/content/AdoptionGuideReleaseManagement.tsx
git commit -m "refactor: read the admin identity through the shared query options"
```

---

### Task 5: Guard against the sites drifting apart again

**Files:**
- Create: `src/lib/adminIdentityCaching.test.ts`

Same style as the existing `src/lib/adminRouteAuditing.test.ts`: a source-level
regression guard.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const IDENTITY_MODULE = "src/lib/admin/identity.ts";

async function adminSources() {
  const globs = ["src/components/admin/**/*.{ts,tsx}", "src/routes/admin/**/*.{ts,tsx}"];
  const groups = await Promise.all(
    globs.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
  );
  return groups.flat().filter((path) => !path.includes(".test."));
}

describe("admin identity caching", () => {
  test("no admin surface hard-codes an identity query key", async () => {
    // Six sites resolved the identity under two different keys, so
    // invalidating ["admin-me"] after a role change left the ["admin-identity"]
    // consumer showing the old role. The key lives in one module now.
    for (const file of await adminSources()) {
      const source = readFileSync(file, "utf8");
      for (const literal of ['"admin-me"', '"admin-identity"']) {
        expect(
          source.includes(literal),
          `${file} hard-codes ${literal}. Use adminIdentityQueryOptions() / ` +
            `ADMIN_IDENTITY_QUERY_KEY from lib/admin/identity.ts instead.`,
        ).toBe(false);
      }
    }
  });

  test("AdminLayout does not fetch the identity itself", () => {
    const source = readFileSync("src/components/admin/AdminLayout.tsx", "utf8");
    expect(
      /fetchAdminIdentity\(/.test(source),
      "AdminLayout must read the identity through useQuery(adminIdentityQueryOptions()) — " +
        "calling fetchAdminIdentity() here is the duplicate GET /api/admin/me this removed.",
    ).toBe(false);
  });

  test("the shared options keep a non-zero staleTime", () => {
    const source = readFileSync(IDENTITY_MODULE, "utf8");
    // react-query defaults staleTime to 0; at 0 every mount refetches and the
    // navigation win disappears.
    expect(/staleTime:\s*ADMIN_IDENTITY_STALE_TIME_MS/.test(source)).toBe(true);
    expect(/ADMIN_IDENTITY_STALE_TIME_MS\s*=\s*60_000/.test(source)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `bun test src/lib/adminIdentityCaching.test.ts`
Expected: PASS.

To confirm it has teeth, temporarily put `queryKey: ["admin-me"]` back into
`AccessManagement.tsx` and re-run — it must FAIL. Revert.

- [ ] **Step 3: Commit**

```bash
git add src/lib/adminIdentityCaching.test.ts
git commit -m "test: guard the admin identity cache against key drift"
```

---

### Task 6: Full verification

- [ ] **Step 1: Run the whole gate**

```bash
bun test && bun run typecheck && bun run lint && bun run build
```

Expected: ~1096 tests pass, typecheck clean, lint 0 errors (27 pre-existing
warnings are expected), build succeeds.

- [ ] **Step 2: Confirm the behaviour in a browser**

The tests cover the wiring, not the end-to-end effect. Start the dev server,
sign in to `/admin`, open the network tab filtered to `admin/me`:

1. Load an admin page — expect **one** `GET /api/admin/me`, not two.
2. Navigate to another admin page within a minute — expect **zero** further
   requests.
3. Open Access Management and change a role — expect one refetch, and the
   sidebar role to update.
4. Sign out and back in — expect a fresh request.

This needs admin credentials. If they are unavailable, say so explicitly rather
than reporting the change as verified — the unit tests do not prove step 1.

- [ ] **Step 3: Confirm the tree is clean**

```bash
git status --short
```

---

## Out of scope

Per the spec's non-goals:

1. Converting admin routes to router `loader`s so page data fetches in parallel
   with the shell — the larger perceived win, but it touches all 36 route files.
2. Public bundle work: recharts on `/report/adoption` (409 kB raw / 111 kB gzip),
   Supabase `RealtimeClient` in the entry chunk with zero `.channel()` usage,
   dead `src/components/site/AuditChart.tsx`.
