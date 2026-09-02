# APP_URL Default Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the server-side `APP_URL` fallback default across every call site, fixing `donations/config.server.ts`'s stale `:3000` default (everywhere else already uses `:5173`) by promoting its `getAppUrl()` function into a new shared file.

**Architecture:** New file `src/lib/appUrl.server.ts` exports `getAppUrl()` with the corrected `:5173` default. `donations/config.server.ts` loses its own copy; its 5 existing importers switch to importing `getAppUrl` from the new shared file instead. `volunteers/service.ts` and 6 content/stories files drop their duplicated inline fallback and call the shared function too.

**Tech Stack:** TypeScript, Bun test.

---

## File Structure

**Create:**
- `src/lib/appUrl.server.ts` — the single `getAppUrl()` implementation.
- `src/lib/appUrl.server.test.ts` — its unit tests.

**Modify:**
- `src/lib/donations/config.server.ts` — remove `getAppUrl`.
- `src/lib/publicAdoption/submission.server.ts`, `src/lib/sponsorship/submission.server.ts`, `src/lib/donations/cod-provider.server.ts`, `src/lib/donations/providers.server.ts`, `src/lib/donations/receipt-pdf.server.ts` — import `getAppUrl` from the new file instead of `config.server`.
- `src/lib/donations/cod-provider.server.test.ts`, `src/lib/sponsorship/submission.server.test.ts` — update hardcoded `localhost:3000` expectations to `localhost:5173`.
- `src/lib/volunteers/service.ts` — remove `defaultAppUrl()`, use the shared `getAppUrl()`.
- `src/lib/content/publicStoriesPage.server.ts`, `src/lib/content/publicStory.functions.ts`, `src/routes/api/admin/content/-handlers.ts`, `src/routes/api/stories.ts`, `src/routes/api/stories/map.ts`, `src/routes/api/stories/$slug.ts` — replace the inline fallback with the shared `getAppUrl()`.

---

### Task 1: Create the shared `getAppUrl()` and migrate its 5 existing importers

**Files:**
- Create: `src/lib/appUrl.server.ts`
- Create: `src/lib/appUrl.server.test.ts`
- Modify: `src/lib/donations/config.server.ts`
- Modify: `src/lib/publicAdoption/submission.server.ts`
- Modify: `src/lib/sponsorship/submission.server.ts`
- Modify: `src/lib/donations/cod-provider.server.ts`
- Modify: `src/lib/donations/providers.server.ts`
- Modify: `src/lib/donations/receipt-pdf.server.ts`
- Modify: `src/lib/donations/cod-provider.server.test.ts`
- Modify: `src/lib/sponsorship/submission.server.test.ts`

`src/lib/donations/config.server.ts` currently exports `getAppUrl()` with a stale `http://localhost:3000` default (every other fallback site in the repo already uses `:5173`, Vite's actual dev port). This function has 5 real importers today. This task creates the shared replacement, then updates `config.server.ts` and all 5 importers together, in one task, because removing `getAppUrl` from `config.server.ts` without simultaneously fixing its importers would leave the repo in a non-compiling state — these changes must land atomically.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/appUrl.server.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test";

import { getAppUrl } from "./appUrl.server";

describe("getAppUrl", () => {
  afterEach(() => {
    delete process.env.APP_URL;
  });

  test("falls back to the Vite dev server origin when APP_URL is unset", () => {
    delete process.env.APP_URL;
    expect(getAppUrl()).toBe("http://localhost:5173");
  });

  test("returns the real value when APP_URL is set", () => {
    process.env.APP_URL = "https://hkscda.vercel.app";
    expect(getAppUrl()).toBe("https://hkscda.vercel.app");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/appUrl.server.test.ts`
Expected: FAIL — `src/lib/appUrl.server.ts` does not exist yet (module-not-found error).

- [ ] **Step 3: Create `src/lib/appUrl.server.ts`**

```ts
/**
 * The server-side base URL for links built into emails, receipts, and
 * redirect/callback URLs (donation return URLs, receipt PDF asset URLs,
 * status-page links). Distinct from PUBLIC_SITE_ORIGIN in publicOrigin.ts,
 * which is for client-rendered HTML (canonicals, Open Graph tags) and reads
 * a different, client-visible env var (VITE_PUBLIC_SITE_ORIGIN).
 *
 * Defect G-20 (server-side half): this fallback used to be duplicated
 * across eight call sites, with donations/config.server.ts's copy carrying
 * a stale :3000 default while every other copy already used Vite's actual
 * dev server port, :5173. Unified here so there is exactly one fallback to
 * keep correct.
 */
export function getAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:5173";
}
```

**Outcome (2026-09-02):** Code quality review of Task 3 found that migrating the content/stories files removed a per-call-site comment (`publicStory.functions.ts`'s "A deployment hostname here would silently outlive decision D-1") without preserving its caution anywhere in the new shared function. Fixed in commit `fcdc45a` by adding a paragraph to `getAppUrl()`'s docblock warning against ever hardcoding a real deployment hostname as the default. The shipped `src/lib/appUrl.server.ts` docblock has 5 more lines than the listing above.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/appUrl.server.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Remove `getAppUrl` from `src/lib/donations/config.server.ts`**

The current top of the file is:

```ts
import process from "node:process";

import {
  decodeBase64Strict,
  getCodCipherSuite,
  parseRsaPrivateKey,
  parseRsaPublicKey,
  type CodCipherSuite,
} from "./cod-crypto.server";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getAppUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// The receipt bucket name is not a secret. Keep it separate so callers that
```

Replace it with (only the `getAppUrl` export and its blank line above are removed — everything else stays exactly as-is):

```ts
import process from "node:process";

import {
  decodeBase64Strict,
  getCodCipherSuite,
  parseRsaPrivateKey,
  parseRsaPublicKey,
  type CodCipherSuite,
} from "./cod-crypto.server";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// The receipt bucket name is not a secret. Keep it separate so callers that
```

- [ ] **Step 6: Update the 5 importers**

**`src/lib/publicAdoption/submission.server.ts`** — current line 16:

```ts
import { getAppUrl, getEmailConfig } from "../donations/config.server";
```

Replace with two lines:

```ts
import { getAppUrl } from "../appUrl.server";
import { getEmailConfig } from "../donations/config.server";
```

**`src/lib/sponsorship/submission.server.ts`** — current line 19:

```ts
import { getAppUrl, getEmailConfig } from "../donations/config.server";
```

Replace with two lines:

```ts
import { getAppUrl } from "../appUrl.server";
import { getEmailConfig } from "../donations/config.server";
```

**`src/lib/donations/cod-provider.server.ts`** — current line 3:

```ts
import { getAppUrl, getCodConfig, type CodConfig } from "./config.server";
```

Replace with two lines:

```ts
import { getAppUrl } from "../appUrl.server";
import { getCodConfig, type CodConfig } from "./config.server";
```

**`src/lib/donations/providers.server.ts`** — current line 4:

```ts
import { getAppUrl, getPayPalConfig, getStripeConfig } from "./config.server";
```

Replace with two lines:

```ts
import { getAppUrl } from "../appUrl.server";
import { getPayPalConfig, getStripeConfig } from "./config.server";
```

**`src/lib/donations/receipt-pdf.server.ts`** — current line 5:

```ts
import { getAppUrl, getReceiptConfig } from "./config.server";
```

Replace with two lines:

```ts
import { getAppUrl } from "../appUrl.server";
import { getReceiptConfig } from "./config.server";
```

None of these 5 files' actual `getAppUrl()` call sites change — only the import statement.

- [ ] **Step 7: Update the 2 test files' hardcoded port**

**`src/lib/donations/cod-provider.server.test.ts`** — current line 60:

```ts
      returnUrl: "http://localhost:3000/donate?status=pending&donation=donation-123",
```

Replace with:

```ts
      returnUrl: "http://localhost:5173/donate?status=pending&donation=donation-123",
```

**`src/lib/sponsorship/submission.server.test.ts`** — current line 416:

```ts
      statusUrl: "http://localhost:3000/sponsors/status/token",
```

Replace with:

```ts
      statusUrl: "http://localhost:5173/sponsors/status/token",
```

- [ ] **Step 8: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors. In particular, confirm `bun test src/lib/donations/cod-provider.server.test.ts` and `bun test src/lib/sponsorship/submission.server.test.ts` both still pass with the updated port.

- [ ] **Step 9: Commit**

```bash
git add src/lib/appUrl.server.ts src/lib/appUrl.server.test.ts src/lib/donations/config.server.ts src/lib/publicAdoption/submission.server.ts src/lib/sponsorship/submission.server.ts src/lib/donations/cod-provider.server.ts src/lib/donations/providers.server.ts src/lib/donations/receipt-pdf.server.ts src/lib/donations/cod-provider.server.test.ts src/lib/sponsorship/submission.server.test.ts
git commit -m "fix: unify the server-side APP_URL fallback to :5173, extract getAppUrl into a shared module"
```

---

### Task 2: Migrate `volunteers/service.ts` to the shared `getAppUrl()`

**Files:**
- Modify: `src/lib/volunteers/service.ts`

`src/lib/volunteers/service.ts` has its own private `defaultAppUrl()` helper (already using the correct `:5173` default) used as the default value for the `appUrl` parameter of its exported service factory. This task removes the duplication in favor of the shared function from Task 1.

- [ ] **Step 1: Update the import block**

The current top of `src/lib/volunteers/service.ts` is:

```ts
import { buildConsentRows } from "../donations/domain";
import {
  createStatusTokenPair,
  hashStatusToken,
  statusTokenExpiry,
} from "../publicAdoption/statusToken.server";
```

Replace it with:

```ts
import { getAppUrl } from "../appUrl.server";
import { buildConsentRows } from "../donations/domain";
import {
  createStatusTokenPair,
  hashStatusToken,
  statusTokenExpiry,
} from "../publicAdoption/statusToken.server";
```

- [ ] **Step 2: Remove `defaultAppUrl` and update its call site**

Current:

```ts
function defaultAppUrl() {
  return process.env.APP_URL ?? "http://localhost:5173";
}

function statusUrl(appUrl: string, token: string) {
```

Replace with:

```ts
function statusUrl(appUrl: string, token: string) {
```

Then find the call site (the service factory's default parameter, currently `appUrl = defaultAppUrl(),`) and replace it with:

```ts
  appUrl = getAppUrl(),
```

- [ ] **Step 3: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors. In particular confirm `bun test src/lib/volunteers/service.test.ts` (if it exists) still passes — the default behavior (`:5173`) is unchanged, only its source moved.

- [ ] **Step 4: Commit**

```bash
git add src/lib/volunteers/service.ts
git commit -m "refactor: use the shared getAppUrl() in volunteers/service.ts"
```

---

### Task 3: Migrate the 6 content/stories files to the shared `getAppUrl()`

**Files:**
- Modify: `src/lib/content/publicStoriesPage.server.ts`
- Modify: `src/lib/content/publicStory.functions.ts`
- Modify: `src/routes/api/admin/content/-handlers.ts`
- Modify: `src/routes/api/stories.ts`
- Modify: `src/routes/api/stories/map.ts`
- Modify: `src/routes/api/stories/$slug.ts`

These 6 files all independently duplicate `process.env.APP_URL ?? "http://localhost:5173"` inline. This task replaces each with a call to the shared `getAppUrl()` from Task 1. Since the fallback value (`:5173`) is unchanged for all 6, this is a pure refactor with zero behavior change.

- [ ] **Step 1: `src/lib/content/publicStoriesPage.server.ts`**

Current top of file:

```ts
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseContentRepository } from "./repository.server";
```

Replace with:

```ts
import { getAppUrl } from "../appUrl.server";
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseContentRepository } from "./repository.server";
```

Then, current:

```ts
function createPublicStoriesPageService() {
  const client = createSupabaseServiceClient();
  return createContentService({
    repo: createSupabaseContentRepository(client),
    publicBaseUrl: process.env.APP_URL ?? "http://localhost:5173",
  });
}
```

Replace with:

```ts
function createPublicStoriesPageService() {
  const client = createSupabaseServiceClient();
  return createContentService({
    repo: createSupabaseContentRepository(client),
    publicBaseUrl: getAppUrl(),
  });
}
```

- [ ] **Step 2: `src/lib/content/publicStory.functions.ts`**

This file is different from the others: it's a `createServerFn` handler that loads all of its dependencies via a single dynamic `Promise.all([import(...), ...])` call rather than static top-level imports (to keep this server function's bundle lazy). To stay consistent with that existing style, `getAppUrl` is added to the same dynamic-import group rather than a static import.

Current file:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicStory = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().trim().min(1).max(160) }))
  .handler(async ({ data }) => {
    const [
      { createSupabaseContentRepository },
      { createContentService },
      { createSupabaseServiceClient },
    ] = await Promise.all([
      import("./repository.server"),
      import("./service"),
      import("../donations/supabase.server"),
    ]);
    const service = createContentService({
      repo: createSupabaseContentRepository(createSupabaseServiceClient()),
      // Same default as the rest of the content module. A deployment hostname
      // here would silently outlive decision D-1.
      publicBaseUrl: process.env.APP_URL ?? "http://localhost:5173",
    });
    return service.getPublicContentBySlug(data.slug);
  });
```

Replace with:

```ts
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getPublicStory = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().trim().min(1).max(160) }))
  .handler(async ({ data }) => {
    const [
      { createSupabaseContentRepository },
      { createContentService },
      { createSupabaseServiceClient },
      { getAppUrl },
    ] = await Promise.all([
      import("./repository.server"),
      import("./service"),
      import("../donations/supabase.server"),
      import("../appUrl.server"),
    ]);
    const service = createContentService({
      repo: createSupabaseContentRepository(createSupabaseServiceClient()),
      publicBaseUrl: getAppUrl(),
    });
    return service.getPublicContentBySlug(data.slug);
  });
```

Note the old comment ("Same default as the rest of the content module...") is removed because it's no longer accurate framing — there's now exactly one shared default, not a convention every file repeats, so the comment's premise (warning about drift between copies) no longer applies.

- [ ] **Step 3: `src/routes/api/admin/content/-handlers.ts`**

Current file:

```ts
import { createContentHandlers } from "../../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../../lib/content/repository.server";
import { createContentService } from "../../../../lib/content/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = process.env.APP_URL ?? "http://localhost:5173";
  return createContentHandlers({
    requireContentAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}
```

Replace with:

```ts
import { getAppUrl } from "../../../../lib/appUrl.server";
import { createContentHandlers } from "../../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../../lib/content/repository.server";
import { createContentService } from "../../../../lib/content/service";
import {
  createSupabaseServiceClient,
  requireAdmin,
} from "../../../../lib/donations/supabase.server";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = getAppUrl();
  return createContentHandlers({
    requireContentAdmin: (request) => requireAdmin(request, ["staff", "admin"], client),
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}
```

- [ ] **Step 4: `src/routes/api/stories.ts`**

Current file:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createContentHandlers } from "../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../lib/content/repository.server";
import { createContentService } from "../../lib/content/service";
import { createSupabaseServiceClient } from "../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = process.env.APP_URL ?? "http://localhost:5173";
  return createContentHandlers({
    requireContentAdmin: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}

export const Route = createFileRoute("/api/stories")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listPublicStoriesPage({ request }),
    },
  },
});
```

Replace with:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { getAppUrl } from "../../lib/appUrl.server";
import { createContentHandlers } from "../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../lib/content/repository.server";
import { createContentService } from "../../lib/content/service";
import { createSupabaseServiceClient } from "../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = getAppUrl();
  return createContentHandlers({
    requireContentAdmin: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}

export const Route = createFileRoute("/api/stories")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listPublicStoriesPage({ request }),
    },
  },
});
```

- [ ] **Step 5: `src/routes/api/stories/map.ts`**

Current file:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createContentHandlers } from "../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../lib/content/repository.server";
import { createContentService } from "../../../lib/content/service";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = process.env.APP_URL ?? "http://localhost:5173";
  return createContentHandlers({
    requireContentAdmin: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}

export const Route = createFileRoute("/api/stories/map")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listPublicMapStories({ request }),
    },
  },
});
```

Replace with:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { getAppUrl } from "../../../lib/appUrl.server";
import { createContentHandlers } from "../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../lib/content/repository.server";
import { createContentService } from "../../../lib/content/service";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = getAppUrl();
  return createContentHandlers({
    requireContentAdmin: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}

export const Route = createFileRoute("/api/stories/map")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listPublicMapStories({ request }),
    },
  },
});
```

- [ ] **Step 6: `src/routes/api/stories/$slug.ts`**

Current file:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createContentHandlers } from "../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../lib/content/repository.server";
import { createContentService } from "../../../lib/content/service";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = process.env.APP_URL ?? "http://localhost:5173";
  return createContentHandlers({
    requireContentAdmin: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}

export const Route = createFileRoute("/api/stories/$slug")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getPublicContent({ request, params }),
    },
  },
});
```

Replace with:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { getAppUrl } from "../../../lib/appUrl.server";
import { createContentHandlers } from "../../../lib/content/http.server";
import { createSupabaseContentRepository } from "../../../lib/content/repository.server";
import { createContentService } from "../../../lib/content/service";
import { createSupabaseServiceClient } from "../../../lib/donations/supabase.server";

function createHandlers() {
  const client = createSupabaseServiceClient();
  const publicBaseUrl = getAppUrl();
  return createContentHandlers({
    requireContentAdmin: async () => {
      throw new Response("Forbidden", { status: 403 });
    },
    service: createContentService({ repo: createSupabaseContentRepository(client), publicBaseUrl }),
  });
}

export const Route = createFileRoute("/api/stories/$slug")({
  server: {
    handlers: {
      GET: ({ request, params }) => createHandlers().getPublicContent({ request, params }),
    },
  },
});
```

- [ ] **Step 7: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/content/publicStoriesPage.server.ts src/lib/content/publicStory.functions.ts src/routes/api/admin/content/-handlers.ts src/routes/api/stories.ts src/routes/api/stories/map.ts src/routes/api/stories/\$slug.ts
git commit -m "refactor: use the shared getAppUrl() across content and stories routes"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Confirm no other inline fallback or stale port remains**

Run: `grep -rn "APP_URL" src --include=*.ts | grep -v test | grep -v appUrl.server.ts`
Expected: every remaining match is a call to `getAppUrl()` (no bare `process.env.APP_URL` reads) or the `environmentContract.test.ts`/`.env.example`-related documentation check (which reads `.env.example`, not app code, and is out of scope per the spec) — no file should still contain `process.env.APP_URL ?? "http://localhost:`.

Run: `grep -rn "localhost:3000" src --include=*.ts`
Expected: no matches anywhere in `src/` — the only 3 occurrences that existed before this plan (the old `config.server.ts` default and the 2 test files) are now gone.

- [ ] **Step 2: Re-run the full gate**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 3: Confirm the donations-domain behavior actually changed as intended**

Re-read `src/lib/donations/cod-provider.server.test.ts` and `src/lib/sponsorship/submission.server.test.ts` to confirm their updated assertions (`localhost:5173`) reflect the corrected default, and that `bun test src/lib/donations/cod-provider.server.test.ts src/lib/sponsorship/submission.server.test.ts` passes.
