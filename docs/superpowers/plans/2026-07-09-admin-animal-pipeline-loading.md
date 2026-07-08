# Admin Animal Pipeline Loading Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin animal pipeline's full-table browser loading with a paginated, server-filtered API while preserving existing animal profile and task workflows.

**Architecture:** Add a typed animal pipeline list contract to the adoption coordinator domain, expose it through the existing TanStack Start API handler stack, and update `AnimalPipeline` to fetch paginated rows through `fetchCoordinatorJson`. Reference tables stay separate but gain longer React Query stale times. Selected animal tasks and profile editing stay lazy-loaded.

**Tech Stack:** TanStack Start, React 19, TanStack Query 5, Supabase JS 2, Zod, Bun test, TypeScript.

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-08-admin-data-loading-speed-design.md` for Phase 1 behavior.
- Follow `docs/superpowers/specs/2026-07-09-admin-performance-next-phase-design.md`: do not change payments/reconciliation behavior in this phase.
- Use TDD: write the failing test first, run it red, implement the minimum, run it green.
- Do not add database migrations in this phase; existing indexes include `animal_profile_internal_position_idx` and `animal_profile_internal_adoptable_idx`.
- Before implementing the Supabase repository task, fetch `https://supabase.com/changelog.md` and the current Supabase JS `select`/`range` docs, then proceed only if no relevant breaking change applies.
- Keep unrelated local changes unstaged: the two deleted adoption route files, `.claude/settings.local.json`, and `AGENTS.md`.

---

## File Structure

- Modify `src/lib/adoptions/types.ts`: shared response and row types for the pipeline API.
- Modify `src/lib/adoptions/schemas.ts`: Zod schema for pipeline search params.
- Modify `src/lib/adoptions/schemas.test.ts`: schema normalization tests.
- Modify `src/components/admin/adoptions/animalPipelineLogic.ts`: frontend query-param builder and type re-exports.
- Modify `src/components/admin/adoptions/animalPipelineLogic.test.ts`: query-param tests.
- Modify `src/lib/adoptions/service.ts`: service method and repository interface entry.
- Modify `src/lib/adoptions/service.test.ts`: service normalization test.
- Modify `src/lib/adoptions/http.server.ts`: authenticated handler method.
- Modify `src/lib/adoptions/http.test.ts`: handler auth/response test.
- Create `src/routes/api/admin/adoptions/animals/pipeline.ts`: TanStack Start API route.
- Modify `src/lib/adoptions/repository.server.ts`: Supabase-backed paginated list query.
- Modify `src/lib/adoptions/repository.server.test.ts`: repository query and mapping tests.
- Modify `src/components/admin/adoptions/AnimalPipeline.tsx`: replace full-table list loading with the new API.

---

### Task 1: Shared Pipeline Contract And Search Params

**Files:**
- Modify: `src/lib/adoptions/types.ts`
- Modify: `src/lib/adoptions/schemas.ts`
- Modify: `src/lib/adoptions/schemas.test.ts`
- Modify: `src/components/admin/adoptions/animalPipelineLogic.ts`
- Modify: `src/components/admin/adoptions/animalPipelineLogic.test.ts`

**Interfaces:**
- Produces: `AnimalPipelineSearch`, `AnimalPipelineListResult`, `AnimalPipelineRow`, `buildAnimalPipelineSearchParams(input)`
- Consumes: existing `AnimalStatus` and `AnimalType` from `src/types/animal.ts`

- [ ] **Step 1: Write failing schema tests**

Append this test inside the existing adoption coordinator schema test block in `src/lib/adoptions/schemas.test.ts`, immediately after the `"normalizes adopter search defaults and boolean filters"` test, and add `animalPipelineSearchSchema` to the import list.

```ts
test("normalizes animal pipeline search filters", () => {
  expect(
    animalPipelineSearchSchema.parse({
      q: " Mochi ",
      animalId: "77777777-8888-4333-8444-555555555555",
      status: "available",
      type: "cat",
      adoptable: "not_adoptable",
      supportPool: "inside",
      positionId: "none",
      page: "2",
      pageSize: "50",
    }),
  ).toEqual({
    q: "Mochi",
    animalId: "77777777-8888-4333-8444-555555555555",
    status: "available",
    type: "cat",
    adoptable: "not_adoptable",
    supportPool: "inside",
    positionId: "none",
    page: 2,
    pageSize: 50,
  });

  expect(animalPipelineSearchSchema.parse({ page: "0", pageSize: "500" })).toEqual({
    q: undefined,
    animalId: undefined,
    status: "all",
    type: "all",
    adoptable: "all",
    supportPool: "all",
    positionId: "all",
    page: 1,
    pageSize: 25,
  });
});
```

- [ ] **Step 2: Run schema test red**

Run: `bun test src/lib/adoptions/schemas.test.ts`

Expected: FAIL because `animalPipelineSearchSchema` is not exported.

- [ ] **Step 3: Write failing frontend search-param tests**

Replace the existing `"builds deep-link search params for an animal id"` test in `src/components/admin/adoptions/animalPipelineLogic.test.ts` with:

```ts
test("builds animal pipeline list search params with normalized ordering", () => {
  expect(
    buildAnimalPipelineSearchParams({
      q: " Mochi ",
      status: "available",
      type: "cat",
      adoptable: "adoptable",
      supportPool: "outside",
      positionId: "none",
      page: 2,
      pageSize: 50,
    }).toString(),
  ).toBe(
    "q=Mochi&status=available&type=cat&adoptable=adoptable&supportPool=outside&positionId=none&page=2&pageSize=50",
  );

  expect(
    buildAnimalPipelineSearchParams({
      animalId: "  animal-1  ",
    }).toString(),
  ).toBe("animalId=animal-1&page=1&pageSize=25");
});
```

- [ ] **Step 4: Run frontend logic test red**

Run: `bun test src/components/admin/adoptions/animalPipelineLogic.test.ts`

Expected: FAIL because the existing builder does not accept list filters or page defaults.

- [ ] **Step 5: Add shared types**

In `src/lib/adoptions/types.ts`, add this import at the top:

```ts
import type { Animal, AnimalStatus, AnimalType } from "../../types/animal";
```

Then add these types after `AdoptionCaseSummary`:

```ts
export type AnimalInternalProfile = {
  animal_id: string;
  internal_code: string | null;
  arrival_date: string | null;
  arrival_source_id: string | null;
  current_position_id: string | null;
  cage: string | null;
  has_chip: boolean | null;
  chip_remarks: string | null;
  is_desexed: boolean | null;
  desexed_at: string | null;
  desex_remarks: string | null;
  is_adoptable: boolean;
  is_inside_support_pool: boolean;
  adopted_at: string | null;
  deceased_at: string | null;
  internal_remarks: string | null;
};

export type AnimalPositionSummary = {
  id: string;
  name: string;
  type: string;
};

export type ArrivalSourceSummary = {
  id: string;
  name_zh: string;
  name_en: string | null;
};

export type AnimalPipelineRow = Pick<
  Animal,
  | "id"
  | "type"
  | "name"
  | "name_en"
  | "gender"
  | "age"
  | "status"
  | "image_url"
  | "created_at"
  | "updated_at"
> & {
  profile: AnimalInternalProfile;
  currentPosition: AnimalPositionSummary | null;
  arrivalSource: ArrivalSourceSummary | null;
};

export type AnimalPipelineSearch = {
  q?: string;
  animalId?: string;
  status: AnimalStatus | "all";
  type: AnimalType | "all";
  adoptable: "all" | "adoptable" | "not_adoptable";
  supportPool: "all" | "inside" | "outside";
  positionId: string;
  page: number;
  pageSize: number;
};

export type AnimalPipelineListResult = {
  animals: AnimalPipelineRow[];
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 6: Add the Zod schema**

In `src/lib/adoptions/schemas.ts`, add this export after `adopterSearchSchema`:

```ts
export const animalPipelineSearchSchema = z.object({
  q: optionalTrimmed,
  animalId: optionalTrimmed,
  status: z.enum(["all", "available", "fostered", "adopted"]).catch("all"),
  type: z.enum(["all", "cat", "dog", "sponsor"]).catch("all"),
  adoptable: z.enum(["all", "adoptable", "not_adoptable"]).catch("all"),
  supportPool: z.enum(["all", "inside", "outside"]).catch("all"),
  positionId: optionalTrimmed.transform((value) => value ?? "all"),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
});
```

- [ ] **Step 7: Update pipeline logic types and builder**

In `src/components/admin/adoptions/animalPipelineLogic.ts`, remove the local `AnimalInternalProfile`, `AnimalPositionSummary`, `ArrivalSourceSummary`, and `AnimalPipelineRow` definitions. Replace the top import and type section with:

```ts
import type { AnimalStatus, AnimalType } from "../../../types/animal";
import type {
  AnimalInternalProfile,
  AnimalPipelineRow,
  AnimalPositionSummary,
  ArrivalSourceSummary,
} from "../../../lib/adoptions/types";

export type {
  AnimalInternalProfile,
  AnimalPipelineRow,
  AnimalPositionSummary,
  ArrivalSourceSummary,
} from "../../../lib/adoptions/types";
```

Replace `buildAnimalPipelineSearchParams` with:

```ts
type AnimalPipelineSearchParamsInput = Partial<AnimalPipelineFilters> & {
  q?: string | null;
  animalId?: string | null;
  page?: number | null;
  pageSize?: number | null;
};

export function buildAnimalPipelineSearchParams(filters: AnimalPipelineSearchParamsInput = {}) {
  const params = new URLSearchParams();
  const query = trimmed(filters.q);
  const animalId = trimmed(filters.animalId);
  const status = filters.status ?? "all";
  const type = filters.type ?? "all";
  const adoptable = filters.adoptable ?? "all";
  const supportPool = filters.supportPool ?? "all";
  const positionId = trimmed(filters.positionId) || "all";
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 25;

  if (query) params.set("q", query);
  if (animalId) params.set("animalId", animalId);
  if (status !== "all") params.set("status", status);
  if (type !== "all") params.set("type", type);
  if (adoptable !== "all") params.set("adoptable", adoptable);
  if (supportPool !== "all") params.set("supportPool", supportPool);
  if (positionId !== "all") params.set("positionId", positionId);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return params;
}
```

- [ ] **Step 8: Run Task 1 tests green**

Run:

```bash
bun test src/lib/adoptions/schemas.test.ts src/components/admin/adoptions/animalPipelineLogic.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/lib/adoptions/types.ts src/lib/adoptions/schemas.ts src/lib/adoptions/schemas.test.ts src/components/admin/adoptions/animalPipelineLogic.ts src/components/admin/adoptions/animalPipelineLogic.test.ts
git commit -m "feat: add animal pipeline list contract"
```

---

### Task 2: Service, HTTP Handler, And Route

**Files:**
- Modify: `src/lib/adoptions/service.ts`
- Modify: `src/lib/adoptions/service.test.ts`
- Modify: `src/lib/adoptions/http.server.ts`
- Modify: `src/lib/adoptions/http.test.ts`
- Create: `src/routes/api/admin/adoptions/animals/pipeline.ts`

**Interfaces:**
- Consumes: `AnimalPipelineSearch`, `AnimalPipelineListResult`, `animalPipelineSearchSchema`
- Produces: `service.listAnimalPipeline(rawSearch)`, `handlers.listAnimalPipeline({ request })`, route `GET /api/admin/adoptions/animals/pipeline`

- [ ] **Step 1: Write failing service test**

In `createRepo`, add this method before `listCases`:

```ts
async listAnimalPipeline(input) {
  calls.push({ name: "listAnimalPipeline", payload: input });
  return { animals: [], total: 0, page: input.page, pageSize: input.pageSize };
},
```

Add this test inside the existing service test block, immediately after `"lists adopters with normalized filters"`:

```ts
test("lists animal pipeline rows with normalized filters", async () => {
  const { service, calls } = setup();

  await expect(
    service.listAnimalPipeline({
      q: " Mochi ",
      status: "available",
      type: "cat",
      adoptable: "not_adoptable",
      supportPool: "inside",
      positionId: "none",
      page: "2",
      pageSize: "50",
    }),
  ).resolves.toEqual({ animals: [], total: 0, page: 2, pageSize: 50 });

  expect(calls.at(-1)).toEqual({
    name: "listAnimalPipeline",
    payload: {
      q: "Mochi",
      animalId: undefined,
      status: "available",
      type: "cat",
      adoptable: "not_adoptable",
      supportPool: "inside",
      positionId: "none",
      page: 2,
      pageSize: 50,
    },
  });
});
```

- [ ] **Step 2: Run service test red**

Run: `bun test src/lib/adoptions/service.test.ts`

Expected: FAIL because the service/repository interface does not include `listAnimalPipeline`.

- [ ] **Step 3: Write failing HTTP handler test**

In `src/lib/adoptions/http.test.ts`, add this method in `createFakeService` before `listCases`:

```ts
async listAnimalPipeline(rawSearch) {
  calls.push({ name: "listAnimalPipeline", payload: rawSearch });
  return { animals: [], total: 0, page: 2, pageSize: 10 };
},
```

Add this test near the list-case handler tests:

```ts
test("animal pipeline list requires coordinator auth and returns no-store JSON", async () => {
  const { calls, service } = createFakeService();
  const handlers = createHandlers({ service });

  const response = await handlers.listAnimalPipeline({
    request: new Request(
      "https://example.test/api/admin/adoptions/animals/pipeline?page=2&pageSize=10&q=Mochi",
    ),
  });

  expect(response.status).toBe(200);
  expectNoStoreJson(response);
  expect(await response.json()).toEqual({ animals: [], total: 0, page: 2, pageSize: 10 });
  expect(calls).toEqual([
    { name: "listAnimalPipeline", payload: { page: "2", pageSize: "10", q: "Mochi" } },
  ]);
});
```

- [ ] **Step 4: Run HTTP test red**

Run: `bun test src/lib/adoptions/http.test.ts`

Expected: FAIL because `handlers.listAnimalPipeline` does not exist.

- [ ] **Step 5: Implement service interface and method**

In `src/lib/adoptions/service.ts`, add imports:

```ts
import type { AnimalPipelineListResult, AnimalPipelineSearch } from "./types";
import { animalPipelineSearchSchema } from "./schemas";
```

If `service.ts` already imports from `./types` and `./schemas`, merge these names into the existing import lists instead of creating duplicate imports.

Add to `AdoptionCoordinatorRepository`:

```ts
listAnimalPipeline(input: AnimalPipelineSearch): Promise<AnimalPipelineListResult>;
```

Add to the returned service object before `listCases`:

```ts
listAnimalPipeline(rawSearch: unknown) {
  return repo.listAnimalPipeline(animalPipelineSearchSchema.parse(rawSearch));
},
```

- [ ] **Step 6: Implement HTTP handler method**

In `src/lib/adoptions/http.server.ts`, add this method before `listCases`:

```ts
listAnimalPipeline({ request }: HandlerContext) {
  return withErrors(async () => {
    await requireCoordinator(request);
    const search = Object.fromEntries(new URL(request.url).searchParams);
    return jsonResponse(await service.listAnimalPipeline(search));
  });
},
```

- [ ] **Step 7: Create the API route**

Create `src/routes/api/admin/adoptions/animals/pipeline.ts` with:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { createHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/adoptions/animals/pipeline")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().listAnimalPipeline({ request }),
    },
  },
});
```

- [ ] **Step 8: Run Task 2 tests green**

Run:

```bash
bun test src/lib/adoptions/service.test.ts src/lib/adoptions/http.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

```bash
git add src/lib/adoptions/service.ts src/lib/adoptions/service.test.ts src/lib/adoptions/http.server.ts src/lib/adoptions/http.test.ts src/routes/api/admin/adoptions/animals/pipeline.ts
git commit -m "feat: expose animal pipeline list api"
```

---

### Task 3: Supabase Repository Query

**Files:**
- Modify: `src/lib/adoptions/repository.server.ts`
- Modify: `src/lib/adoptions/repository.server.test.ts`

**Interfaces:**
- Consumes: `AnimalPipelineSearch`
- Produces: `repo.listAnimalPipeline(input): Promise<AnimalPipelineListResult>`

- [ ] **Step 1: Verify Supabase docs for this task**

Run these checks before editing repository code:

```bash
powershell -Command "Invoke-WebRequest -Uri https://supabase.com/changelog.md -UseBasicParsing | Select-Object -ExpandProperty Content | Select-String -Pattern 'breaking-change|select|range' -Context 0,2"
```

Open the current Supabase JS docs for `select`, `range`, and filters. Continue only if no relevant breaking change affects Supabase JS query builder calls used here.

- [ ] **Step 2: Write failing repository tests**

In `src/lib/adoptions/repository.server.test.ts`, add this private field beside the other `FakeQuery` private filter fields:

```ts
private notFilters: Array<{ column: string; operator: string; value: unknown }> = [];
```

Then add this `not` recorder after the `is(column, value)` method:

```ts
not(column: string, operator: string, value: unknown) {
  this.state.calls.push({ table: this.table, method: "not", payload: { column, operator, value } });
  this.notFilters.push({ column, operator, value });
  return this;
}
```

Then add this line at the end of `applyFilters(rows)` before the final return value is used:

```ts
.filter((row) => this.notFilters.every((filter) => matchesNotFilter(row, filter)))
```

Add this helper near `matchesOrFilter`:

```ts
function matchesNotFilter(
  row: Record<string, unknown>,
  filter: { column: string; operator: string; value: unknown },
) {
  if (filter.operator === "in" && typeof filter.value === "string") {
    const ids = filter.value.replace(/^\(/, "").replace(/\)$/, "").split(",").filter(Boolean);
    return !ids.includes(String(row[filter.column]));
  }
  if (filter.operator === "is" && filter.value === null) {
    return fieldValue(row, filter.column) !== null;
  }
  return true;
}
```

Add these tests after the existing `"exports animals with internal profile and lookup labels"` test:

```ts
test("lists paginated animal pipeline rows with selected columns and page profiles", async () => {
  const { repo, calls } = setupRepository({
    animalRows: [
      animalRow({
        id: animalId,
        gender: "female",
        age: "2 years",
        image_url: "https://example.test/mochi.jpg",
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-20T00:00:00.000Z",
      }),
    ],
    internalProfileRows: [
      {
        animal_id: animalId,
        internal_code: "CAT-204",
        arrival_date: "2026-06-01",
        arrival_source_id: arrivalSourceId,
        current_position_id: animalPositionId,
        cage: "A-12",
        has_chip: true,
        chip_remarks: "Chip scanned",
        is_desexed: false,
        desexed_at: null,
        desex_remarks: null,
        is_adoptable: false,
        is_inside_support_pool: true,
        adopted_at: null,
        deceased_at: null,
        internal_remarks: "Needs quiet home",
      },
    ],
    animalPositionRows: [{ id: animalPositionId, name: "Foster home", type: "foster" }],
    arrivalSourceRows: [{ id: arrivalSourceId, name_zh: "Street rescue", name_en: "Street" }],
  });

  const result = await repo.listAnimalPipeline({
    status: "all",
    type: "all",
    adoptable: "all",
    supportPool: "all",
    positionId: "all",
    page: 1,
    pageSize: 25,
  });

  expect(result).toEqual({
    animals: [
      expect.objectContaining({
        id: animalId,
        name: "Mochi",
        profile: expect.objectContaining({
          animal_id: animalId,
          internal_code: "CAT-204",
          is_adoptable: false,
          is_inside_support_pool: true,
        }),
        currentPosition: { id: animalPositionId, name: "Foster home", type: "foster" },
        arrivalSource: { id: arrivalSourceId, name_zh: "Street rescue", name_en: "Street" },
      }),
    ],
    total: 1,
    page: 1,
    pageSize: 25,
  });
  expect(calls).toContainEqual({
    table: "animals",
    method: "select",
    payload: "id,type,name,name_en,gender,age,status,image_url,created_at,updated_at",
    options: { count: "exact" },
  });
  expect(calls).toContainEqual({
    table: "animals",
    method: "range",
    payload: { from: 0, to: 24 },
  });
  expect(callsFor(calls, "animal_profile_internal", "select")).toHaveLength(1);
});

test("applies animal pipeline filters before paginating animal rows", async () => {
  const { repo, calls } = setupRepository({
    animalRows: [
      animalRow({ id: animalId, type: "cat", status: "available" }),
      animalRow({ id: "99999999-aaaa-4bbb-8ccc-dddddddddddd", type: "dog", status: "available" }),
    ],
    internalProfileRows: [
      {
        animal_id: animalId,
        internal_code: "CAT-204",
        arrival_date: null,
        arrival_source_id: null,
        current_position_id: animalPositionId,
        cage: "A-12",
        has_chip: null,
        chip_remarks: null,
        is_desexed: null,
        desexed_at: null,
        desex_remarks: null,
        is_adoptable: false,
        is_inside_support_pool: true,
        adopted_at: null,
        deceased_at: null,
        internal_remarks: null,
      },
    ],
  });

  await repo.listAnimalPipeline({
    q: "CAT",
    status: "available",
    type: "cat",
    adoptable: "not_adoptable",
    supportPool: "inside",
    positionId: animalPositionId,
    page: 2,
    pageSize: 10,
  });

  expect(callPayloads(calls, "animals", "eq")).toEqual(
    expect.arrayContaining([
      { column: "status", value: "available" },
      { column: "type", value: "cat" },
    ]),
  );
  expect(callPayloads(calls, "animal_profile_internal", "eq")).toEqual(
    expect.arrayContaining([
      { column: "is_adoptable", value: false },
      { column: "is_inside_support_pool", value: true },
      { column: "current_position_id", value: animalPositionId },
    ]),
  );
  expect(calls).toContainEqual({
    table: "animals",
    method: "range",
    payload: { from: 10, to: 19 },
  });
});
```

- [ ] **Step 3: Run repository test red**

Run: `bun test src/lib/adoptions/repository.server.test.ts`

Expected: FAIL because `repo.listAnimalPipeline` does not exist.

- [ ] **Step 4: Implement repository helpers**

In `src/lib/adoptions/repository.server.ts`, merge these imports into existing import lists:

```ts
import type {
  AnimalInternalProfile,
  AnimalPipelineListResult,
  AnimalPipelineRow,
  AnimalPipelineSearch,
} from "./types";
```

Add these constants near the existing animal export row constants/types:

```ts
const animalPipelineAnimalColumns =
  "id,type,name,name_en,gender,age,status,image_url,created_at,updated_at";

const animalPipelineProfileColumns = [
  "animal_id",
  "internal_code",
  "arrival_date",
  "arrival_source_id",
  "current_position_id",
  "cage",
  "has_chip",
  "chip_remarks",
  "is_desexed",
  "desexed_at",
  "desex_remarks",
  "is_adoptable",
  "is_inside_support_pool",
  "adopted_at",
  "deceased_at",
  "internal_remarks",
].join(",");
```

Add these helper functions before `createSupabaseAdoptionCoordinatorRepository`:

```ts
function defaultInternalProfile(animalId: string): AnimalInternalProfile {
  return {
    animal_id: animalId,
    internal_code: null,
    arrival_date: null,
    arrival_source_id: null,
    current_position_id: null,
    cage: null,
    has_chip: null,
    chip_remarks: null,
    is_desexed: null,
    desexed_at: null,
    desex_remarks: null,
    is_adoptable: true,
    is_inside_support_pool: false,
    adopted_at: null,
    deceased_at: null,
    internal_remarks: null,
  };
}

function combineCandidateSet(current: Set<string> | null, ids: string[]) {
  const next = new Set(ids);
  if (!current) return next;
  return new Set([...current].filter((id) => next.has(id)));
}

function postgrestInList(ids: string[]) {
  return `(${ids.join(",")})`;
}

function mapAnimalPipelineRow(
  row: Record<string, unknown>,
  profile: AnimalInternalProfile | undefined,
  positionsById: Map<string, AnimalPositionRow>,
  sourcesById: Map<string, ArrivalSourceRow>,
): AnimalPipelineRow {
  const profileRow = profile ?? defaultInternalProfile(row.id as string);
  const position = profileRow.current_position_id
    ? positionsById.get(profileRow.current_position_id)
    : undefined;
  const source = profileRow.arrival_source_id ? sourcesById.get(profileRow.arrival_source_id) : undefined;

  return {
    id: row.id as string,
    type: row.type as AnimalPipelineRow["type"],
    name: row.name as string,
    name_en: (row.name_en as string | null) ?? null,
    gender: row.gender as AnimalPipelineRow["gender"],
    age: row.age as string,
    status: row.status as AnimalPipelineRow["status"],
    image_url: (row.image_url as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
    profile: profileRow,
    currentPosition: position
      ? { id: position.id, name: position.name, type: (position as { type?: string }).type ?? "unknown" }
      : null,
    arrivalSource: source
      ? { id: source.id, name_zh: source.name_zh ?? source.name_en ?? source.id, name_en: source.name_en }
      : null,
  };
}
```

- [ ] **Step 5: Implement `listAnimalPipeline`**

Inside the object returned by `createSupabaseAdoptionCoordinatorRepository`, add this method before `listCases`:

```ts
async listAnimalPipeline(input: AnimalPipelineSearch): Promise<AnimalPipelineListResult> {
  const from = (input.page - 1) * input.pageSize;
  let includeIds: Set<string> | null = null;
  const excludeIds = new Set<string>();

  if (input.animalId) {
    includeIds = combineCandidateSet(includeIds, [input.animalId]);
  }

  if (input.q) {
    const pattern = `%${sanitizeOrLikeValue(input.q)}%`;
    const [animalMatches, profileMatches] = await Promise.all([
      client.from("animals").select("id").or(`name.ilike.${pattern},name_en.ilike.${pattern}`),
      client
        .from("animal_profile_internal")
        .select("animal_id")
        .or(`internal_code.ilike.${pattern},cage.ilike.${pattern}`),
    ]);
    if (animalMatches.error) throw animalMatches.error;
    if (profileMatches.error) throw profileMatches.error;
    includeIds = combineCandidateSet(includeIds, [
      ...((animalMatches.data ?? []) as Array<{ id: string }>).map((row) => row.id),
      ...((profileMatches.data ?? []) as Array<{ animal_id: string }>).map((row) => row.animal_id),
    ]);
  }

  if (
    input.adoptable === "not_adoptable" ||
    input.supportPool === "inside" ||
    (input.positionId !== "all" && input.positionId !== "none")
  ) {
    let profileQuery = client.from("animal_profile_internal").select("animal_id");
    if (input.adoptable === "not_adoptable") profileQuery = profileQuery.eq("is_adoptable", false);
    if (input.supportPool === "inside") {
      profileQuery = profileQuery.eq("is_inside_support_pool", true);
    }
    if (input.positionId !== "all" && input.positionId !== "none") {
      profileQuery = profileQuery.eq("current_position_id", input.positionId);
    }
    const { data, error } = await profileQuery;
    if (error) throw error;
    includeIds = combineCandidateSet(
      includeIds,
      ((data ?? []) as Array<{ animal_id: string }>).map((row) => row.animal_id),
    );
  }

  if (input.adoptable === "adoptable") {
    const { data, error } = await client
      .from("animal_profile_internal")
      .select("animal_id")
      .eq("is_adoptable", false);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ animal_id: string }>) excludeIds.add(row.animal_id);
  }

  if (input.supportPool === "outside") {
    const { data, error } = await client
      .from("animal_profile_internal")
      .select("animal_id")
      .eq("is_inside_support_pool", true);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ animal_id: string }>) excludeIds.add(row.animal_id);
  }

  if (input.positionId === "none") {
    const { data, error } = await client
      .from("animal_profile_internal")
      .select("animal_id")
      .not("current_position_id", "is", null);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ animal_id: string }>) excludeIds.add(row.animal_id);
  }

  if (includeIds && includeIds.size === 0) {
    return { animals: [], total: 0, page: input.page, pageSize: input.pageSize };
  }

  let animalQuery = client
    .from("animals")
    .select(animalPipelineAnimalColumns, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, from + input.pageSize - 1);

  if (input.status !== "all") animalQuery = animalQuery.eq("status", input.status);
  if (input.type !== "all") animalQuery = animalQuery.eq("type", input.type);
  if (includeIds) animalQuery = animalQuery.in("id", [...includeIds]);
  if (excludeIds.size > 0) animalQuery = animalQuery.not("id", "in", postgrestInList([...excludeIds]));

  const { data: animalData, error: animalError, count } = await animalQuery;
  if (animalError) throw animalError;

  const animalRows = (animalData ?? []) as Record<string, unknown>[];
  const animalIds = animalRows.map((row) => row.id as string);
  if (animalIds.length === 0) {
    return { animals: [], total: count ?? 0, page: input.page, pageSize: input.pageSize };
  }

  const { data: profileData, error: profileError } = await client
    .from("animal_profile_internal")
    .select(animalPipelineProfileColumns)
    .in("animal_id", animalIds);
  if (profileError) throw profileError;

  const profileRows = (profileData ?? []) as AnimalInternalProfile[];
  const positionIds = unique(profileRows.map((profile) => profile.current_position_id));
  const sourceIds = unique(profileRows.map((profile) => profile.arrival_source_id));

  let positionRows: AnimalPositionRow[] = [];
  if (positionIds.length > 0) {
    const { data, error } = await client.from("animal_position").select("id,name,type").in("id", positionIds);
    if (error) throw error;
    positionRows = (data ?? []) as AnimalPositionRow[];
  }

  let sourceRows: ArrivalSourceRow[] = [];
  if (sourceIds.length > 0) {
    const { data, error } = await client.from("arrival_source").select("id,name_zh,name_en").in("id", sourceIds);
    if (error) throw error;
    sourceRows = (data ?? []) as ArrivalSourceRow[];
  }

  const profilesByAnimalId = new Map(profileRows.map((profile) => [profile.animal_id, profile]));
  const positionsById = new Map(positionRows.map((position) => [position.id, position]));
  const sourcesById = new Map(sourceRows.map((source) => [source.id, source]));

  return {
    animals: animalRows.map((row) =>
      mapAnimalPipelineRow(row, profilesByAnimalId.get(row.id as string), positionsById, sourcesById),
    ),
    total: count ?? 0,
    page: input.page,
    pageSize: input.pageSize,
  };
},
```

- [ ] **Step 6: Run Task 3 tests green**

Run: `bun test src/lib/adoptions/repository.server.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/lib/adoptions/repository.server.ts src/lib/adoptions/repository.server.test.ts
git commit -m "feat: query paginated animal pipeline rows"
```

---

### Task 4: Animal Pipeline UI Uses The Paginated API

**Files:**
- Modify: `src/components/admin/adoptions/AnimalPipeline.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/adoptions/animals/pipeline`
- Consumes: `AnimalPipelineListResult`
- Produces: paginated UI state with debounced search and cached reference data

- [ ] **Step 1: Run current UI-adjacent tests before editing**

Run:

```bash
bun test src/components/admin/adoptions/animalPipelineLogic.test.ts
```

Expected: PASS from Task 1. This is the guard for query-param behavior before the component changes.

- [ ] **Step 2: Update imports**

In `src/components/admin/adoptions/AnimalPipeline.tsx`, change the React Query import to:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
```

Remove `Animal` from the type import from `../../../types/animal`; keep `AnimalStatus` and `AnimalType`.

Add `AnimalPipelineListResult` to the type import from `../../../lib/adoptions/types`.

Add `buildAnimalPipelineSearchParams` to the import from `./animalPipelineLogic`.

- [ ] **Step 3: Replace list query constants**

Replace:

```ts
const ANIMALS_QUERY_KEY = ["coordinator-animals"] as const;
const INTERNAL_PROFILES_QUERY_KEY = ["animal-internal-profiles"] as const;
```

with:

```ts
const PIPELINE_QUERY_KEY = ["coordinator-animal-pipeline"] as const;
const PIPELINE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const PIPELINE_REFERENCE_STALE_TIME_MS = 5 * 60 * 1000;
const PIPELINE_SEARCH_DEBOUNCE_MS = 300;
```

Remove `EMPTY_ANIMALS` and `EMPTY_INTERNAL_PROFILES`.

- [ ] **Step 4: Remove full-table readers**

Delete `readAnimals()` and `readInternalProfiles()` from `AnimalPipeline.tsx`.

Add this reader near the other async readers:

```ts
async function readAnimalPipeline(searchParams: URLSearchParams) {
  return fetchCoordinatorJson<AnimalPipelineListResult>(
    `/api/admin/adoptions/animals/pipeline?${searchParams.toString()}`,
  );
}
```

- [ ] **Step 5: Add debounce helper**

Add this helper above `export function AnimalPipeline`:

```ts
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}
```

- [ ] **Step 6: Replace query state and list queries**

Inside `AnimalPipeline`, add:

```ts
const [page, setPage] = useState(1);
const [pageSize, setPageSize] = useState<(typeof PIPELINE_PAGE_SIZE_OPTIONS)[number]>(25);
const debouncedQuery = useDebouncedValue(query, PIPELINE_SEARCH_DEBOUNCE_MS);
```

Replace `animalsQuery` and `profilesQuery` with:

```ts
const searchParams = useMemo(
  () =>
    buildAnimalPipelineSearchParams({
      q: debouncedQuery,
      ...filters,
      page,
      pageSize,
    }),
  [debouncedQuery, filters, page, pageSize],
);

const pipelineQuery = useQuery<AnimalPipelineListResult, Error>({
  queryKey: [...PIPELINE_QUERY_KEY, searchParams.toString()],
  queryFn: () => readAnimalPipeline(searchParams),
  placeholderData: keepPreviousData,
});

const initialAnimalParams = useMemo(
  () =>
    initialAnimalId
      ? buildAnimalPipelineSearchParams({ animalId: initialAnimalId, page: 1, pageSize: 1 })
      : null,
  [initialAnimalId],
);

const initialAnimalQuery = useQuery<AnimalPipelineListResult, Error>({
  queryKey: [...PIPELINE_QUERY_KEY, "initial", initialAnimalParams?.toString() ?? ""],
  queryFn: () => readAnimalPipeline(initialAnimalParams ?? new URLSearchParams()),
  enabled: Boolean(initialAnimalParams),
  staleTime: PIPELINE_REFERENCE_STALE_TIME_MS,
});
```

Add `staleTime: PIPELINE_REFERENCE_STALE_TIME_MS` to `positionsQuery`, `sourcesQuery`, and `statusesQuery`.

- [ ] **Step 7: Replace derived rows and groups**

Replace:

```ts
const animals = animalsQuery.data ?? EMPTY_ANIMALS;
const profiles = profilesQuery.data ?? EMPTY_INTERNAL_PROFILES;
```

and the `rows` and `visibleRows` `useMemo` blocks with:

```ts
const rows = pipelineQuery.data?.animals ?? [];
const total = pipelineQuery.data?.total ?? 0;
const totalPages = Math.max(1, Math.ceil(total / pageSize));
const visibleRows = rows;
```

Keep the existing `groups = groupAnimalPipelineRows(visibleRows, groupBy)` block.

- [ ] **Step 8: Preserve deep-link dialog behavior**

Replace the `useEffect` that currently waits for `rows.length` with:

```ts
useEffect(() => {
  if (!initialAnimalId || appliedInitialAnimalId.current === initialAnimalId) {
    return;
  }
  const row =
    rows.find((animal) => animal.id === initialAnimalId) ??
    initialAnimalQuery.data?.animals.find((animal) => animal.id === initialAnimalId);
  if (row) {
    appliedInitialAnimalId.current = initialAnimalId;
    setSelectedAnimalId(row.id);
    setProfileForm(cloneProfile(row.profile));
  }
}, [initialAnimalId, initialAnimalQuery.data?.animals, rows]);
```

- [ ] **Step 9: Update invalidation and refresh**

In `lifecycleMutation.onSuccess`, replace invalidation with:

```ts
await queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY });
```

In `saveProfileMutation.onSuccess`, replace invalidation with:

```ts
await queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY });
```

Replace `refetchAll()` with:

```ts
function refetchAll() {
  pipelineQuery.refetch();
  positionsQuery.refetch();
  sourcesQuery.refetch();
  statusesQuery.refetch();
  if (selectedAnimalId) selectedAnimalTasksQuery.refetch();
}
```

- [ ] **Step 10: Reset page on filter changes**

Replace `updateFilter` with:

```ts
function updateFilter<K extends keyof AnimalPipelineFilters>(
  key: K,
  value: AnimalPipelineFilters[K],
) {
  setFilters((current) => ({ ...current, [key]: value }));
  setPage(1);
}
```

Change the search input handler to:

```tsx
onChange={(event) => {
  setQuery(event.target.value);
  setPage(1);
}}
```

- [ ] **Step 11: Update loading, errors, counts, and pagination controls**

Replace `isFetching` with:

```ts
const isFetching =
  pipelineQuery.isFetching ||
  positionsQuery.isFetching ||
  sourcesQuery.isFetching ||
  statusesQuery.isFetching;
```

Remove `profilesQuery.error` from `readErrors`.

Replace `counts` with:

```ts
const counts = {
  shown: rows.length,
  total,
  adoptableOnPage: rows.filter((row) => row.profile.is_adoptable).length,
  supportPoolOnPage: rows.filter((row) => row.profile.is_inside_support_pool).length,
};
```

Update the count badges to read:

```tsx
<Badge
  variant="outline"
  className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
>
  {counts.shown} shown
</Badge>
<span>{counts.total} matching total</span>
<span>{counts.adoptableOnPage} adoptable on page</span>
<span>{counts.supportPoolOnPage} in support pool on page</span>
```

Replace `animalsQuery.error` checks with `pipelineQuery.error`, and `animalsQuery.isLoading` checks with `pipelineQuery.isLoading`.

After the groups list, add page controls:

```tsx
<div className="flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
  <span>
    Page {page} of {totalPages}
  </span>
  <div className="flex items-center gap-2">
    <Select
      value={String(pageSize)}
      onValueChange={(value) => {
        setPageSize(Number(value) as (typeof PIPELINE_PAGE_SIZE_OPTIONS)[number]);
        setPage(1);
      }}
    >
      <SelectTrigger aria-label="Rows per page" className="h-8 w-20">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PIPELINE_PAGE_SIZE_OPTIONS.map((option) => (
          <SelectItem key={option} value={String(option)}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
      disabled={page <= 1 || isFetching}
    >
      Previous
    </Button>
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
      disabled={page >= totalPages || isFetching}
    >
      Next
    </Button>
  </div>
</div>
```

- [ ] **Step 12: Run UI-adjacent tests green**

Run:

```bash
bun test src/components/admin/adoptions/animalPipelineLogic.test.ts src/lib/adoptions/schemas.test.ts src/lib/adoptions/service.test.ts src/lib/adoptions/http.test.ts src/lib/adoptions/repository.server.test.ts
```

Expected: PASS.

- [ ] **Step 13: Commit Task 4**

```bash
git add src/components/admin/adoptions/AnimalPipeline.tsx
git commit -m "feat: load animal pipeline through paginated api"
```

---

### Task 5: Full Verification And PR Readiness

**Files:**
- Verify all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: completed Task 1-4 commits.
- Produces: validated branch ready for PR.

- [ ] **Step 1: Run targeted tests**

```bash
bun test src/components/admin/adoptions/animalPipelineLogic.test.ts src/lib/adoptions/schemas.test.ts src/lib/adoptions/service.test.ts src/lib/adoptions/http.test.ts src/lib/adoptions/repository.server.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

```bash
bun test
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 5: Inspect git status**

```bash
git status -sb
```

Expected: only the known pre-existing unstaged local files remain outside the committed task changes.

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin codex/admin-performance-next-phase
```

Create a draft PR into `main` with a body covering:

- animal pipeline no longer fetches full animals and full internal profiles in the browser
- new paginated server endpoint
- debounced search and cached reference data
- payments/reconciliation left untouched for separate Phase 2 design
- verification commands and results
