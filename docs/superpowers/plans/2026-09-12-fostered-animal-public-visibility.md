# Fostered-Animal Public Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ~65 fostered animals the RLS policy in `20260911170000_publish_fostered_animals.sql` already lets through visible on the public site, by updating the six application-layer reads that still hard-code `status = 'available'`.

**Architecture:** No migration, no new abstraction beyond one shared constant and one predicate helper colocated with the existing `AnimalStatus` type. Six existing files each get one query/predicate swapped from a single hard-coded status to the shared two-value list; one new RLS test locks in the database-level contract this all depends on.

**Tech Stack:** TypeScript, Bun test, Supabase (`@supabase/supabase-js`), TanStack Start `createServerFn`, TanStack Router file routes.

**Spec:** `docs/superpowers/specs/2026-09-12-fostered-animal-public-visibility-design.md`

---

## Task 1: Shared status constant and predicate

**Files:**
- Modify: `src/types/animal.ts:2` (after `AnimalStatus`)
- Test: `src/types/animal.test.ts` (new)

- [x] **Step 1: Write the failing test**

Create `src/types/animal.test.ts`:

```ts
import { describe, expect, test } from "bun:test";

import { isPubliclyVisibleStatus, PUBLIC_VISIBLE_ANIMAL_STATUSES } from "./animal";

describe("isPubliclyVisibleStatus", () => {
  test("admits available and fostered", () => {
    expect(isPubliclyVisibleStatus("available")).toBe(true);
    expect(isPubliclyVisibleStatus("fostered")).toBe(true);
  });

  test("excludes adopted", () => {
    expect(isPubliclyVisibleStatus("adopted")).toBe(false);
  });

  test("PUBLIC_VISIBLE_ANIMAL_STATUSES names exactly the two admitted states", () => {
    expect(PUBLIC_VISIBLE_ANIMAL_STATUSES).toEqual(["available", "fostered"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/types/animal.test.ts`
Expected: FAIL — `isPubliclyVisibleStatus` / `PUBLIC_VISIBLE_ANIMAL_STATUSES` are not exported by `./animal`.

- [ ] **Step 3: Write minimal implementation**

In `src/types/animal.ts`, immediately after line 2
(`export type AnimalStatus = "available" | "adopted" | "fostered";`), insert:

```ts
export const PUBLIC_VISIBLE_ANIMAL_STATUSES: readonly AnimalStatus[] = ["available", "fostered"];

export function isPubliclyVisibleStatus(status: AnimalStatus): boolean {
  return PUBLIC_VISIBLE_ANIMAL_STATUSES.includes(status);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/types/animal.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/types/animal.ts src/types/animal.test.ts
git commit -m "feat: add shared predicate for publicly visible animal statuses"
```

---

## Task 2: Shared listing-membership predicate

**Files:**
- Modify: `src/lib/animals/publicListing.ts:1-19`
- Test: `src/lib/animals/publicListing.test.ts`

**Files:**

- [ ] **Step 1: Write the failing test**

Add to the end of `src/lib/animals/publicListing.test.ts` (after the last existing
`test(...)` block, same top-level scope — this file mixes a `describe` block and
bare top-level `test`s already):

```ts
test("includes fostered animals alongside available ones, still excludes adopted", () => {
  const animals = [
    animal("shelter-cat", { status: "available" }),
    animal("foster-cat", { status: "fostered" }),
    animal("adopted-cat", { status: "adopted" }),
  ];

  const result = buildPublicAnimalListing({
    animals,
    type: "cat",
    ageFilter: "all",
    genderFilter: "all",
    page: 1,
    pageSize: 10,
  });

  expect(result.animals.map(({ id }) => id).sort()).toEqual(["foster-cat", "shelter-cat"]);
  expect(result.total).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/animals/publicListing.test.ts`
Expected: FAIL — `result.total` is `1`, `result.animals` contains only `["shelter-cat"]`
(the fostered animal is excluded).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/animals/publicListing.ts`, change the import block:

```ts
import type {
  AgeFilter,
  Animal,
  GenderFilter,
  NeuteredFilter,
  SuitabilityFilter,
} from "../../types/animal";
import { parseAgeFilter } from "../../types/animal";
```

to:

```ts
import type {
  AgeFilter,
  Animal,
  GenderFilter,
  NeuteredFilter,
  SuitabilityFilter,
} from "../../types/animal";
import { isPubliclyVisibleStatus, parseAgeFilter } from "../../types/animal";
```

Then change `isPublicAnimalMember`:

```ts
export function isPublicAnimalMember(
  animal: Pick<
    Animal,
    "type" | "status" | "retired_at" | "adoption_eligible" | "sponsorship_eligible"
  >,
  type: PublicAnimalType,
) {
  if (animal.retired_at || animal.status !== "available") return false;
```

to:

```ts
export function isPublicAnimalMember(
  animal: Pick<
    Animal,
    "type" | "status" | "retired_at" | "adoption_eligible" | "sponsorship_eligible"
  >,
  type: PublicAnimalType,
) {
  if (animal.retired_at || !isPubliclyVisibleStatus(animal.status)) return false;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/animals/publicListing.test.ts`
Expected: all tests in the file pass (existing cases plus the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/animals/publicListing.ts src/lib/animals/publicListing.test.ts
git commit -m "fix: include fostered animals in the public listing membership predicate"
```

---

## Task 3: Submission eligibility query

**Files:**
- Modify: `src/lib/animals/eligibility.server.ts`
- Test: `src/lib/animals/eligibility.server.test.ts` (rewritten fake, one new case)

The existing fake query in this test ignores its `.eq`/`.in` arguments entirely — it
returns all rows regardless of what was asked for, relying only on the in-memory
`isPublicAnimalMember` filter downstream. That can't tell apart "the DB query still
excludes fostered rows" from "it doesn't," so this task replaces the fake with one
that actually applies the `status` filter it's given, in addition to adding the
fostered case.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/lib/animals/eligibility.server.test.ts` with:

```ts
import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readEligibleAnimals } from "./eligibility.server";

// Only simulates filtering on `status` -- `id`, the eligibility booleans, and
// `retired_at` are intentionally pass-through, since those are exercised via
// isPublicAnimalMember downstream, not at this fake's query layer.
function createEligibilityFakeClient(data: Record<string, unknown>[]) {
  let filtered = data;
  const query = {
    select: () => query,
    in: (column: string, values: readonly string[]) => {
      if (column === "status") {
        filtered = filtered.filter((row) => values.includes(row.status as string));
      }
      return query;
    },
    eq: (column: string, value: unknown) => {
      if (column === "status") filtered = filtered.filter((row) => row.status === value);
      return query;
    },
    is: async () => ({ data: filtered, error: null }),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

test("submission eligibility rejects retired and wrong membership even from a stale read", async () => {
  const data = [
    {
      id: "both",
      type: "cat",
      status: "available",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
    {
      id: "sponsor",
      type: "dog",
      status: "available",
      adoption_eligible: false,
      sponsorship_eligible: true,
    },
    {
      id: "retired",
      type: "cat",
      status: "available",
      adoption_eligible: true,
      sponsorship_eligible: true,
      retired_at: "2026-09-07",
    },
    {
      id: "adopted",
      type: "cat",
      status: "adopted",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
  ];
  const client = createEligibilityFakeClient(data);
  expect(
    (
      await readEligibleAnimals(
        client,
        data.map((a) => a.id),
        "adoption",
      )
    ).map((a) => a.id),
  ).toEqual(["both"]);
  expect(
    (
      await readEligibleAnimals(
        client,
        data.map((a) => a.id),
        "sponsorship",
      )
    ).map((a) => a.id),
  ).toEqual(["both", "sponsor"]);
});

test("asks the database for fostered animals alongside available ones", async () => {
  const data = [
    {
      id: "shelter",
      type: "cat",
      status: "available",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
    {
      id: "foster",
      type: "cat",
      status: "fostered",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
    {
      id: "gone",
      type: "cat",
      status: "adopted",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
  ];
  const client = createEligibilityFakeClient(data);

  expect(
    (
      await readEligibleAnimals(
        client,
        data.map((a) => a.id),
        "adoption",
      )
    )
      .map((a) => a.id)
      .sort(),
  ).toEqual(["foster", "shelter"]);
});

test("asks the database for fostered animals for sponsorship intent too", async () => {
  const data = [
    {
      id: "foster-sponsor",
      type: "dog",
      status: "fostered",
      adoption_eligible: true,
      sponsorship_eligible: true,
    },
  ];
  const client = createEligibilityFakeClient(data);

  expect(
    (
      await readEligibleAnimals(
        client,
        data.map((a) => a.id),
        "sponsorship",
      )
    ).map((a) => a.id),
  ).toEqual(["foster-sponsor"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/animals/eligibility.server.test.ts`
Expected: the first test passes (unchanged behavior); the second and third tests
FAIL — expected `["foster", "shelter"]`/`["foster-sponsor"]` but the fostered rows
are missing, because the fake now genuinely filters on `.eq("status", "available")`
and the current code still calls `.eq`, not `.in`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/animals/eligibility.server.ts`, change:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicAnimalMember } from "./publicListing";
import type { Animal } from "../../types/animal";
```

to:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPublicAnimalMember } from "./publicListing";
import type { Animal } from "../../types/animal";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../../types/animal";
```

Then change:

```ts
  const { data, error } = await client
    .from("animals")
    .select("id,type,status,adoption_eligible,sponsorship_eligible,retired_at")
    .in("id", ids)
    .eq("status", "available")
    .eq(intent === "sponsorship" ? "sponsorship_eligible" : "adoption_eligible", true)
    .is("retired_at", null);
```

to:

```ts
  const { data, error } = await client
    .from("animals")
    .select("id,type,status,adoption_eligible,sponsorship_eligible,retired_at")
    .in("id", ids)
    .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)
    .eq(intent === "sponsorship" ? "sponsorship_eligible" : "adoption_eligible", true)
    .is("retired_at", null);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/animals/eligibility.server.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/animals/eligibility.server.ts src/lib/animals/eligibility.server.test.ts
git commit -m "fix: let submission eligibility find fostered animals"
```

---

## Task 4: Public listing query

**Files:**
- Modify: `src/lib/animals/publicListing.server.ts`
- Test: `src/lib/animals/publicListing.server.test.ts` (new)

`readPublicAnimals` imports the ambient `supabase` singleton via a static import, so
the test mocks that module with `mock.module` before dynamically importing the
function under test — the same ordering `PledgeReviewLane.test.tsx` already uses in
this codebase for the same reason (bun's `mock.module` patches the shared module
registry for the whole process, not just one file, so real exports are captured
first and restored in `afterAll`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/animals/publicListing.server.test.ts`:

```ts
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Spread into a new object, not a bare reference -- bun's mock.module mutates
// the shared module namespace in place, so a bare reference would be mutated
// out from under us the moment the mock below is installed, and afterAll's
// "restore" would silently restore the already-mocked object. See 23566de
// and 4480fdb for the two prior times this exact bug was fixed in this repo.
const realSupabaseModule = { ...(await import("../supabase")) };

function createListingFakeClient(data: Record<string, unknown>[]) {
  const eqFilters: Array<[string, unknown]> = [];
  let inFilter: { column: string; values: readonly string[] } | undefined;
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      eqFilters.push([column, value]);
      return query;
    },
    in: (column: string, values: readonly string[]) => {
      inFilter = { column, values };
      return query;
    },
    is: () => query,
    order: () => query,
    range: async () => {
      const filtered = data.filter((row) => {
        const passesEq = eqFilters.every(([column, value]) => row[column] === value);
        const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
        return passesEq && passesIn;
      });
      return { data: filtered, error: null };
    },
  };
  return { from: () => query } as unknown as SupabaseClient;
}

const baseAnimal = {
  name: "Test",
  name_en: null,
  gender: "female" as const,
  age: "約 2 歲",
  age_en: null,
  description: null,
  description_en: null,
  notes: null,
  notes_en: null,
  image_url: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  adoption_eligible: true,
  sponsorship_eligible: true,
  retired_at: null,
  public_profile: null,
};

afterAll(() => {
  mock.module("../supabase", () => realSupabaseModule);
});

describe("readPublicAnimals", () => {
  test("includes fostered cats alongside available ones, excludes adopted", async () => {
    const data = [
      { ...baseAnimal, id: "shelter", type: "cat", status: "available" },
      { ...baseAnimal, id: "foster", type: "cat", status: "fostered" },
      { ...baseAnimal, id: "gone", type: "cat", status: "adopted" },
    ];
    mock.module("../supabase", () => ({ supabase: createListingFakeClient(data) }));
    const { readPublicAnimals } = await import("./publicListing.server");

    const result = await readPublicAnimals({ type: "cat", genderFilter: "all" });

    expect(result.map((a) => a.id).sort()).toEqual(["foster", "shelter"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/animals/publicListing.server.test.ts`
Expected: FAIL — result contains only `["shelter"]`, because the fake's `.eq`
filter (matching the current `.eq("status", "available")` call) excludes the
fostered row.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/animals/publicListing.server.ts`, change:

```ts
import { projectPublicAnimal } from "./publicProfile";
import { supabase } from "../supabase";
import type { Animal, GenderFilter } from "../../types/animal";
import type { PublicAnimalType } from "./publicListing";
```

to:

```ts
import { projectPublicAnimal } from "./publicProfile";
import { supabase } from "../supabase";
import type { Animal, GenderFilter } from "../../types/animal";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../../types/animal";
import type { PublicAnimalType } from "./publicListing";
```

Then change:

```ts
    let query = supabase
      .from("animals")
      .select("*")
      .eq("status", "available")
      .is("retired_at", null)
```

to:

```ts
    let query = supabase
      .from("animals")
      .select("*")
      .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)
      .is("retired_at", null)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/animals/publicListing.server.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/animals/publicListing.server.ts src/lib/animals/publicListing.server.test.ts
git commit -m "fix: list fostered animals on the public cat/dog/sponsor pages"
```

---

## Task 5: Single public animal lookup

**Files:**
- Modify: `src/lib/animals/publicAnimal.functions.ts`
- Test: `src/lib/animals/publicAnimal.functions.test.ts` (new)

**Revised after Task 5 was first attempted:** `getPublicAnimal` is a
`createServerFn` handler, and calling it directly (`getPublicAnimal({ data })`)
outside a real request throws `TypeError: null is not an object (evaluating
'userCtx.context')` from inside `@tanstack/react-start`'s own
`createServerFn.js` — confirmed by reproduction, not a guess. There is no
existing precedent anywhere in this codebase for invoking a `createServerFn`
wrapper directly in a test (grepped the whole repo for a `*.test.ts` paired
with a file containing `createServerFn`; the one match,
`submit-application.functions.test.ts`, tests the plain function underneath
the wrapper, not the wrapper itself). This task follows that same, established
shape: extract the handler's body into a plain, separately-exported
`resolvePublicAnimal` function that takes the validated `data` directly, with
`getPublicAnimal` reduced to a thin call-through. The test calls
`resolvePublicAnimal` and never touches `createServerFn` at all.

- [ ] **Step 1: Write the failing test**

Create `src/lib/animals/publicAnimal.functions.test.ts`:

```ts
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Spread into a new object, not a bare reference -- bun's mock.module mutates
// the shared module namespace in place, so a bare reference would be mutated
// out from under us the moment the mock below is installed, and afterAll's
// "restore" would silently restore the already-mocked object. See 23566de
// and 4480fdb for the two prior times this exact bug was fixed in this repo.
const realSupabaseModule = { ...(await import("../supabase")) };

function createAnimalFakeClient(data: Record<string, unknown>[]) {
  const eqFilters: Array<[string, unknown]> = [];
  let inFilter: { column: string; values: readonly string[] } | undefined;
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      eqFilters.push([column, value]);
      return query;
    },
    in: (column: string, values: readonly string[]) => {
      inFilter = { column, values };
      return query;
    },
    is: () => query,
    maybeSingle: async () => {
      const match = data.find((row) => {
        const passesEq = eqFilters.every(([column, value]) => row[column] === value);
        const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
        return passesEq && passesIn;
      });
      return { data: match ?? null, error: null };
    },
  };
  return { from: () => query } as unknown as SupabaseClient;
}

afterAll(() => {
  mock.module("../supabase", () => realSupabaseModule);
});

describe("resolvePublicAnimal", () => {
  test("finds a fostered animal by id, same as an available one", async () => {
    const fosterCat = {
      id: "12345678-1234-1234-1234-123456789012",
      type: "cat",
      name: "Mochi",
      name_en: null,
      gender: "female",
      age: "約 2 歲",
      age_en: null,
      description: null,
      description_en: null,
      notes: null,
      notes_en: null,
      status: "fostered",
      image_url: null,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      adoption_eligible: true,
      sponsorship_eligible: true,
      retired_at: null,
      public_profile: null,
    };
    mock.module("../supabase", () => ({ supabase: createAnimalFakeClient([fosterCat]) }));
    const { resolvePublicAnimal } = await import("./publicAnimal.functions");

    const result = await resolvePublicAnimal({
      id: "12345678-1234-1234-1234-123456789012",
      type: "cat",
    });

    expect(result?.id).toBe("12345678-1234-1234-1234-123456789012");
  });
});
```

(Note: the id must be a real UUID shape, not an arbitrary string like
`"foster-1"` — `isPublicAnimalId`'s guard clause rejects anything else before
the query ever runs, which would make the test fail for the wrong reason and
never actually exercise the status filter this task is fixing. Found during
Task 5's own implementation and code review.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/animals/publicAnimal.functions.test.ts`
Expected: FAIL — either a missing-export error (`resolvePublicAnimal` doesn't
exist yet) or, once it exists from Step 3 minus the status fix, `result` is
`null` because the fake's `.eq("status", "available")` match excludes the
fostered fixture row.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/animals/publicAnimal.functions.ts`, change:

```ts
import { projectPublicAnimal } from "./publicProfile";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Animal } from "../../types/animal";
import { isPublicAnimalId } from "./publicAnimal";

const publicAnimalInput = z.object({
  id: z.string(),
  type: z.enum(["cat", "dog", "sponsor"]).optional(),
});

export const getPublicAnimal = createServerFn({ method: "GET" })
  .inputValidator(publicAnimalInput)
  .handler(async ({ data }) => {
    // Screened here rather than in the validator: a malformed id is a missing
    // page, and rejecting it as invalid input would surface as a 500.
    if (!isPublicAnimalId(data.id)) return null;

    const { supabase } = await import("../supabase");
    let query = supabase.from("animals").select("*").eq("id", data.id).eq("status", "available");
    query = query
      .is("retired_at", null)
      .eq(
        data.type === "sponsor" || !data.type ? "sponsorship_eligible" : "adoption_eligible",
        true,
      );
    if (data.type && data.type !== "sponsor") query = query.eq("type", data.type);

    const { data: animal, error } = await query.maybeSingle();
    if (error) throw new Error("Could not load public animal");
    return animal ? projectPublicAnimal(animal as Animal) : null;
  });
```

to:

```ts
import { projectPublicAnimal } from "./publicProfile";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Animal } from "../../types/animal";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../../types/animal";
import { isPublicAnimalId } from "./publicAnimal";

const publicAnimalInput = z.object({
  id: z.string(),
  type: z.enum(["cat", "dog", "sponsor"]).optional(),
});

// Extracted so it's directly callable in tests -- createServerFn's wrapped
// export throws outside a real request context (no userCtx), the same reason
// submit-application.functions.ts keeps its core logic in a plain,
// separately-exported function rather than testing the wrapper itself.
export async function resolvePublicAnimal(data: {
  id: string;
  type?: "cat" | "dog" | "sponsor";
}) {
  // Screened here rather than in the validator: a malformed id is a missing
  // page, and rejecting it as invalid input would surface as a 500.
  if (!isPublicAnimalId(data.id)) return null;

  const { supabase } = await import("../supabase");
  let query = supabase
    .from("animals")
    .select("*")
    .eq("id", data.id)
    .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES);
  query = query
    .is("retired_at", null)
    .eq(
      data.type === "sponsor" || !data.type ? "sponsorship_eligible" : "adoption_eligible",
      true,
    );
  if (data.type && data.type !== "sponsor") query = query.eq("type", data.type);

  const { data: animal, error } = await query.maybeSingle();
  if (error) throw new Error("Could not load public animal");
  return animal ? projectPublicAnimal(animal as Animal) : null;
}

export const getPublicAnimal = createServerFn({ method: "GET" })
  .inputValidator(publicAnimalInput)
  .handler(async ({ data }) => resolvePublicAnimal(data));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/animals/publicAnimal.functions.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/animals/publicAnimal.functions.ts src/lib/animals/publicAnimal.functions.test.ts
git commit -m "fix: let a fostered animal's own page resolve, same as an available one"
```

---

## Task 6: Homepage impact counters

**Files:**
- Modify: `src/lib/animals/publicImpact.functions.ts`
- Test: `src/lib/animals/publicImpact.functions.test.ts` (new)

Per the approved design, fostered animals count into the same "available" figure
shown on the homepage — one definition of available everywhere, not a
shelter-only variant.

**Revised after Task 5's blocker:** `getPublicImpactItems` is also a
`createServerFn` handler, and calling it directly the way this task originally
specified hits the exact same `userCtx.context` failure Task 5 found. This
task uses the same fix: extract the body into a plain, separately-exported
`resolvePublicImpactItems` function, with `getPublicImpactItems` reduced to a
thin call-through. The test calls `resolvePublicImpactItems` directly.

- [ ] **Step 1: Write the failing test**

Create `src/lib/animals/publicImpact.functions.test.ts`:

```ts
import { afterAll, describe, expect, mock, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

// Spread into a new object, not a bare reference -- bun's mock.module mutates
// the shared module namespace in place, so a bare reference would be mutated
// out from under us the moment the mock below is installed, and afterAll's
// "restore" would silently restore the already-mocked object. See 23566de
// and 4480fdb for the two prior times this exact bug was fixed in this repo.
const realSupabaseModule = { ...(await import("../supabase")) };
const realPublicImpactServerModule = { ...(await import("../adoptions/publicImpact.server")) };

// resolvePublicImpactItems calls supabase.from("animals") twice concurrently
// (once per species, via Promise.all) -- from() must hand back a FRESH query
// object with its own filter state each time, or the two calls' .eq()/.in()
// pushes land on the same shared arrays and corrupt each other's filters.
function createImpactFakeClient(data: Record<string, unknown>[]) {
  function createQuery() {
    const eqFilters: Array<[string, unknown]> = [];
    let inFilter: { column: string; values: readonly string[] } | undefined;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        eqFilters.push([column, value]);
        return query;
      },
      in: (column: string, values: readonly string[]) => {
        inFilter = { column, values };
        return query;
      },
      is: async () => {
        const matched = data.filter((row) => {
          const passesEq = eqFilters.every(([column, value]) => row[column] === value);
          const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
          return passesEq && passesIn;
        });
        return { count: matched.length, error: null };
      },
    };
    return query;
  }
  return { from: () => createQuery() } as unknown as SupabaseClient;
}

afterAll(() => {
  mock.module("../supabase", () => realSupabaseModule);
  mock.module("../adoptions/publicImpact.server", () => realPublicImpactServerModule);
});

describe("resolvePublicImpactItems", () => {
  test("counts fostered cats and dogs as available, not just status='available'", async () => {
    const data = [
      { type: "cat", status: "available", adoption_eligible: true, retired_at: null },
      { type: "cat", status: "fostered", adoption_eligible: true, retired_at: null },
      { type: "cat", status: "adopted", adoption_eligible: true, retired_at: null },
      { type: "dog", status: "fostered", adoption_eligible: true, retired_at: null },
    ];
    mock.module("../supabase", () => ({ supabase: createImpactFakeClient(data) }));
    mock.module("../adoptions/publicImpact.server", () => ({
      loadAdoptionSpeciesTotals: async () => ({ cat: 0, dog: 0 }),
    }));
    const { resolvePublicImpactItems } = await import("./publicImpact.functions");

    const { items } = await resolvePublicImpactItems();

    expect(items.find((item) => item.label === "待領養貓貓")?.value).toBe(2);
    expect(items.find((item) => item.label === "待領養狗狗")?.value).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/animals/publicImpact.functions.test.ts`
Expected: FAIL — either a missing-export error (`resolvePublicImpactItems`
doesn't exist yet) or, once it exists from Step 3 minus the status fix,
`"待領養貓貓"` value is `1` (only the available cat), not `2`; `"待領養狗狗"` is
`undefined` (the fostered dog's count is `0`, so `buildPublicImpact` filters
it out entirely, per its `value > 0` rule).

- [ ] **Step 3: Write minimal implementation**

In `src/lib/animals/publicImpact.functions.ts`, change the whole file from:

```ts
import { createServerFn } from "@tanstack/react-start";

import { buildPublicImpact, type PublicImpactItem } from "./publicImpact";

type CountResult = { count: number | null; error: { message: string } | null };

/**
 * Read-only public projection over the anonymous client for available counts,
 * so the existing RLS policy stays authoritative there. Adopted counts come
 * from the service-role adoption-impact aggregate instead - the anon policy
 * exposes only available animals, so an anon query for status = adopted could
 * only ever return empty (defect G-04).
 */
export const getPublicImpactItems = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ items: PublicImpactItem[]; asOf: string | null }> => {
    const { supabase } = await import("../supabase");
    const { loadAdoptionSpeciesTotals } = await import("../adoptions/publicImpact.server");

    async function countAvailable(type: "cat" | "dog"): Promise<CountResult> {
      const { count, error } = await supabase
        .from("animals")
        .select("id", { count: "exact", head: true })
        .eq("type", type)
        .eq("status", "available")
        .eq("adoption_eligible", true)
        .is("retired_at", null);
      return { count: count ?? null, error: error ? { message: error.message } : null };
    }

    const [availableCats, availableDogs, adoptedTotals] = await Promise.all([
      countAvailable("cat"),
      countAvailable("dog"),
      loadAdoptionSpeciesTotals().catch((error) => {
        console.error("Adoption species totals unavailable; omitting adopted-count cards.", error);
        return null;
      }),
    ]);

    const verified = (r: CountResult) => (r.error ? null : r.count);
    const asOf = new Date().toISOString();
    const items = buildPublicImpact({
      availableCats: verified(availableCats),
      availableDogs: verified(availableDogs),
      adoptedCats: adoptedTotals?.cat ?? null,
      adoptedDogs: adoptedTotals?.dog ?? null,
      asOf,
    });

    return { items, asOf: items.length ? asOf : null };
  },
);
```

to:

```ts
import { createServerFn } from "@tanstack/react-start";

import { buildPublicImpact, type PublicImpactItem } from "./publicImpact";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../../types/animal";

type CountResult = { count: number | null; error: { message: string } | null };

// Extracted so it's directly callable in tests -- createServerFn's wrapped
// export throws outside a real request context (no userCtx), the same reason
// submit-application.functions.ts keeps its core logic in a plain,
// separately-exported function rather than testing the wrapper itself.
//
// Read-only public projection over the anonymous client for available counts,
// so the existing RLS policy stays authoritative there. Adopted counts come
// from the service-role adoption-impact aggregate instead - the anon policy
// exposes only available animals, so an anon query for status = adopted could
// only ever return empty (defect G-04).
export async function resolvePublicImpactItems(): Promise<{
  items: PublicImpactItem[];
  asOf: string | null;
}> {
  const { supabase } = await import("../supabase");
  const { loadAdoptionSpeciesTotals } = await import("../adoptions/publicImpact.server");

  async function countAvailable(type: "cat" | "dog"): Promise<CountResult> {
    const { count, error } = await supabase
      .from("animals")
      .select("id", { count: "exact", head: true })
      .eq("type", type)
      .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)
      .eq("adoption_eligible", true)
      .is("retired_at", null);
    return { count: count ?? null, error: error ? { message: error.message } : null };
  }

  const [availableCats, availableDogs, adoptedTotals] = await Promise.all([
    countAvailable("cat"),
    countAvailable("dog"),
    loadAdoptionSpeciesTotals().catch((error) => {
      console.error("Adoption species totals unavailable; omitting adopted-count cards.", error);
      return null;
    }),
  ]);

  const verified = (r: CountResult) => (r.error ? null : r.count);
  const asOf = new Date().toISOString();
  const items = buildPublicImpact({
    availableCats: verified(availableCats),
    availableDogs: verified(availableDogs),
    adoptedCats: adoptedTotals?.cat ?? null,
    adoptedDogs: adoptedTotals?.dog ?? null,
    asOf,
  });

  return { items, asOf: items.length ? asOf : null };
}

export const getPublicImpactItems = createServerFn({ method: "GET" }).handler(() =>
  resolvePublicImpactItems(),
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/animals/publicImpact.functions.test.ts`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/animals/publicImpact.functions.ts src/lib/animals/publicImpact.functions.test.ts
git commit -m "fix: count fostered animals into the homepage available totals"
```

---

## Task 7: Sitemap

**Files:**
- Modify: `src/routes/sitemap[.]xml.ts`
- Test: `src/routes/sitemap[.]xml.test.ts` (new)

`publicDetailPaths` is not exported today. It gains an `export` purely so this test
can call it directly instead of reaching into TanStack Router's internal route
handler shape — no behavior change.

- [ ] **Step 1: Write the failing test**

Create `src/routes/sitemap[.]xml.test.ts`:

```ts
import { afterAll, describe, expect, mock, test } from "bun:test";

// Spread into new objects, not bare references -- see the note in Task 4
// on why a bare reference here would defeat the afterAll restoration below.
const realSupabaseModule = { ...(await import("../lib/supabase")) };
const realStoriesModule = { ...(await import("../lib/content/publicStoriesPage.server")) };

function createSitemapFakeClient(data: Record<string, unknown>[]) {
  const eqFilters: Array<[string, unknown]> = [];
  let inFilter: { column: string; values: readonly string[] } | undefined;
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      eqFilters.push([column, value]);
      return query;
    },
    in: (column: string, values: readonly string[]) => {
      inFilter = { column, values };
      return query;
    },
    is: async () => {
      const matched = data.filter((row) => {
        const passesEq = eqFilters.every(([column, value]) => row[column] === value);
        const passesIn = !inFilter || inFilter.values.includes(row[inFilter.column] as string);
        return passesEq && passesIn;
      });
      return { data: matched, error: null };
    },
  };
  return { from: () => query };
}

afterAll(() => {
  mock.module("../lib/supabase", () => realSupabaseModule);
  mock.module("../lib/content/publicStoriesPage.server", () => realStoriesModule);
});

describe("publicDetailPaths", () => {
  test("includes a fostered animal's adoption and sponsor paths, excludes an adopted one", async () => {
    const data = [
      {
        id: "shelter-1",
        type: "cat",
        status: "available",
        adoption_eligible: true,
        sponsorship_eligible: false,
      },
      {
        id: "foster-1",
        type: "cat",
        status: "fostered",
        adoption_eligible: true,
        sponsorship_eligible: true,
      },
      {
        id: "gone-1",
        type: "cat",
        status: "adopted",
        adoption_eligible: true,
        sponsorship_eligible: true,
      },
    ];
    mock.module("../lib/supabase", () => ({ supabase: createSitemapFakeClient(data) }));
    mock.module("../lib/content/publicStoriesPage.server", () => ({
      loadPublicStoriesPage: async () => ({ items: [] }),
    }));
    const { publicDetailPaths } = await import("./sitemap[.]xml");

    const paths = await publicDetailPaths();

    expect(paths).toContain("/animals/cat/foster-1");
    expect(paths).toContain("/sponsors/foster-1");
    expect(paths).not.toContain("/animals/cat/gone-1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test "src/routes/sitemap[.]xml.test.ts"`
Expected: FAIL — the result is missing `/animals/cat/foster-1` and
`/sponsors/foster-1`, because the fake's `.eq("status", "available")` match
excludes the fostered row before `publicDetailPaths` ever builds its paths.

- [ ] **Step 3: Write minimal implementation**

In `src/routes/sitemap[.]xml.ts`, change:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_SITE_ORIGIN } from "@/lib/publicOrigin";

import { loadPublicStoriesPage } from "../lib/content/publicStoriesPage.server";
import { supabase } from "../lib/supabase";
```

to:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { PUBLIC_SITE_ORIGIN } from "@/lib/publicOrigin";

import { loadPublicStoriesPage } from "../lib/content/publicStoriesPage.server";
import { supabase } from "../lib/supabase";
import { PUBLIC_VISIBLE_ANIMAL_STATUSES } from "../types/animal";
```

Then change:

```ts
async function publicDetailPaths() {
  const [animalsResult, storiesResult] = await Promise.allSettled([
    supabase
      .from("animals")
      .select("id,type,adoption_eligible,sponsorship_eligible")
      .eq("status", "available")
      .is("retired_at", null),
    loadPublicStoriesPage(),
  ]);
```

to:

```ts
export async function publicDetailPaths() {
  const [animalsResult, storiesResult] = await Promise.allSettled([
    supabase
      .from("animals")
      .select("id,type,adoption_eligible,sponsorship_eligible")
      .in("status", PUBLIC_VISIBLE_ANIMAL_STATUSES)
      .is("retired_at", null),
    loadPublicStoriesPage(),
  ]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test "src/routes/sitemap[.]xml.test.ts"`
Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/sitemap[.]xml.ts" "src/routes/sitemap[.]xml.test.ts"
git commit -m "fix: list fostered animals in the sitemap"
```

---

## Task 8: RLS-level regression test

**Files:**
- Create: `supabase/rls-tests/animalsPublicVisibility.rls.test.ts`

`20260911170000_publish_fostered_animals.sql` is already applied to production and
to the local stack; this task adds no migration, only the test this policy has
never had. It mirrors the reachability-check and role-client idiom already
established in `supabase/rls-tests/moneyPii.rls.test.ts` and
`supabase/rls-tests/sponsorshipAssignment.rls.test.ts`, simplified to just `anon`
and `service` since the public animals policy has no role requirement beyond that.

- [ ] **Step 1: Write the failing test**

Create `supabase/rls-tests/animalsPublicVisibility.rls.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// See moneyPii.rls.test.ts for the rationale behind these fixed local demo
// keys and the env var overrides -- this file intentionally mirrors that
// setup rather than inventing a second convention.
const SUPABASE_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:55321";
const ANON_KEY =
  process.env.SUPABASE_LOCAL_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function isLocalStackReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY },
      signal: AbortSignal.timeout(5000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}

let warnedSkip = false;
function warnSkipOnce() {
  if (warnedSkip) return;
  warnedSkip = true;
  console.log(
    "Skipping RLS behavioral tests: local Supabase stack not reachable at " +
      SUPABASE_URL +
      ". Run `bunx supabase start` first, then `bun run test:rls` (not plain `bun test`).",
  );
}

const reachable = await isLocalStackReachable();
if (!reachable) warnSkipOnce();

let service: SupabaseClient;
let anon: SupabaseClient;
const seededAnimalIds: string[] = [];

describe.skipIf(!reachable)("RLS behavioral matrix: public animal visibility", () => {
  beforeAll(() => {
    service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    anon = createClient(SUPABASE_URL, ANON_KEY);
  });

  afterAll(async () => {
    if (seededAnimalIds.length > 0) {
      await service.from("animals").delete().in("id", seededAnimalIds);
    }
  });

  test("anon can read a fostered, published, eligible animal", async () => {
    const { data: fostered, error: insertError } = await service
      .from("animals")
      .insert({
        type: "cat",
        name: "RLS Foster Test Cat",
        gender: "female",
        age: "約 2 歲",
        status: "fostered",
        adoption_eligible: true,
        sponsorship_eligible: false,
        publication_state: "published",
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    seededAnimalIds.push(fostered!.id as string);

    const { data, error } = await anon.from("animals").select("id").eq("id", fostered!.id).maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(fostered!.id);
  });

  test("anon cannot read an adopted animal, or one still in draft", async () => {
    const { data: adopted, error: adoptedError } = await service
      .from("animals")
      .insert({
        type: "cat",
        name: "RLS Adopted Test Cat",
        gender: "female",
        age: "約 3 歲",
        status: "adopted",
        adoption_eligible: true,
        sponsorship_eligible: false,
        publication_state: "published",
      })
      .select("id")
      .single();
    expect(adoptedError).toBeNull();
    seededAnimalIds.push(adopted!.id as string);

    const { data: draft, error: draftError } = await service
      .from("animals")
      .insert({
        type: "cat",
        name: "RLS Draft Test Cat",
        gender: "female",
        age: "約 1 歲",
        status: "fostered",
        adoption_eligible: true,
        sponsorship_eligible: false,
        publication_state: "draft",
      })
      .select("id")
      .single();
    expect(draftError).toBeNull();
    seededAnimalIds.push(draft!.id as string);

    const { data: adoptedRead } = await anon.from("animals").select("id").eq("id", adopted!.id).maybeSingle();
    const { data: draftRead } = await anon.from("animals").select("id").eq("id", draft!.id).maybeSingle();

    expect(adoptedRead).toBeNull();
    expect(draftRead).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx supabase start` (if the local stack is not already running), then
`bun run test:rls`
Expected: if the stack is reachable, both tests currently PASS already — this
step exists to confirm the harness itself connects and seeds/cleans up
correctly (there is no application code to be "red" against here; the migration
this locks in is already applied). If the local stack is not reachable, the
suite reports "Skipping RLS behavioral tests" and 0 run — that is expected in an
environment without `supabase start`, not a failure of this task.

- [ ] **Step 3: N/A**

No implementation step — the RLS policy already exists (`20260911170000`). This
task only adds the missing test coverage for it.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:rls`
Expected: 2 pass (plus the existing RLS suite's own tests, unaffected).

- [ ] **Step 5: Commit**

```bash
git add supabase/rls-tests/animalsPublicVisibility.rls.test.ts
git commit -m "test: cover public animal visibility at the RLS level"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 2: Full test suite**

Run: `bun test`
Expected: all tests pass, including the new ones added in Tasks 1–7 (Task 8's RLS
suite runs separately, see Step 4).

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: 0 errors (the same pre-existing `react-refresh` warnings as before this
work; no new warnings from the 8 files this plan touches).

- [ ] **Step 4: RLS suite**

Run: `bun run test:rls`
Expected: all pass, including Task 8's two new tests.

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: exit 0.

- [ ] **Step 6: Commit if Steps 1–5 required any fixups**

Only run this if any of the above required a code change (e.g. a lint fix):

```bash
git add -A
git commit -m "fix: address gate failures found in full verification"
```

If nothing needed fixing, there is nothing to commit — this task is
verification-only.
