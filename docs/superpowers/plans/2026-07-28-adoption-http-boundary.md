# Adoption Coordinator HTTP Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 279-line adoption coordinator HTTP factory with five focused domain handler groups behind the unchanged public facade.

**Architecture:** Keep `createAdoptionCoordinatorHandlers()` in `src/lib/adoptions/http.server.ts` as the route-facing composition root. Move transport primitives into `src/lib/adoptions/http/shared.server.ts`; compose status, task, reporting, adopter, and case factories whose service dependencies use narrow `Pick<AdoptionCoordinatorService, ...>` types.

**Tech Stack:** TypeScript 5.9, Bun test runner, TanStack Start, Zod, Fetch `Request`/`Response`

## Global Constraints

- Preserve all 25 handler names, routes, authorization rules, request parsing, responses, status codes, headers, error messages, and validation/authentication order.
- Keep business validation in `createAdoptionCoordinatorService`.
- Preserve `cache-control: no-store` on JSON and CSV responses.
- Do not change services, repositories, schemas, migrations, routes, or UI.
- Do not introduce a generic handler-definition framework.
- Use test-first extraction and one commit per task.

---

### Task 1: Characterize the facade and extract shared transport helpers

**Files:**
- Create: `src/lib/adoptions/http/shared.server.ts`
- Create: `src/lib/adoptions/http/shared.server.test.ts`
- Modify: `src/lib/adoptions/http.server.ts`
- Modify: `src/lib/adoptions/http.test.ts`

**Interfaces:**
- Produces `AdoptionCoordinatorService`, `CoordinatorAuthorizer`, `HandlerContext`, `jsonResponse`, `csvResponse`, `jsonBody`, `requiredUuid`, `queryParams`, and `withErrors`.
- Preserves `createAdoptionCoordinatorHandlers(args)`.

- [ ] **Step 1: Add the complete facade contract test**

Append inside the existing facade `describe` block:

```ts
test("exposes the complete stable coordinator handler contract", () => {
  const { service } = createFakeService();
  const handlers = createHandlers({ service });
  expect(Object.keys(handlers).sort()).toEqual(
    [
      "changeCaseStatus", "createFollowup", "createManualCase", "createMatch",
      "createStatus", "createTask", "deleteStatus", "exportCoordinatorCsv",
      "finalizeAdoption", "getAdopter", "getCase",
      "getCoordinatorMonthlySummary", "getStatus", "getTask", "listAdopters",
      "listAnimalPipeline", "listCases", "listCoordinatorExportHistory",
      "listIntakeItems", "listStatuses", "listTasks",
      "regenerateCoordinatorExport", "searchManualCaseIdentity",
      "updateStatus", "updateTask",
    ].sort(),
  );
});
```

- [ ] **Step 2: Run it**

Run: `bun test src/lib/adoptions/http.test.ts -t "complete stable coordinator handler contract"`

Expected: PASS with the existing factory.

- [ ] **Step 3: Write failing shared-helper tests**

```ts
import { expect, test } from "bun:test";
import { jsonResponse, queryParams, requiredUuid, withErrors } from "./shared.server";

test("shared JSON responses retain headers and force no-store", async () => {
  const response = jsonResponse({ ok: true }, {
    status: 201,
    headers: { "x-test": "preserved" },
  });
  expect(response.status).toBe(201);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-test")).toBe("preserved");
});

test("invalid UUID responses retain validation-before-auth semantics", async () => {
  const response = await withErrors(async () => {
    requiredUuid({ id: "bad" }, "id");
    return jsonResponse({ unreachable: true });
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid id" });
});

test("queryParams returns decoded plain values", () => {
  expect(queryParams(new Request("https://x.test/?page=2&q=ginger%20cat")))
    .toEqual({ page: "2", q: "ginger cat" });
});
```

- [ ] **Step 4: Confirm RED**

Run: `bun test src/lib/adoptions/http/shared.server.test.ts`

Expected: FAIL because `shared.server.ts` does not exist.

- [ ] **Step 5: Extract the existing helpers without changing their bodies**

Move the current `HandlerContext`, response builders, JSON parsing, UUID parsing,
domain-error sets, `responseError`, `domainError`, and `withErrors` into
`shared.server.ts`. Add:

```ts
import { z } from "zod";
import type { AdminUser } from "../../donations/supabase.server";

export type AdoptionCoordinatorService = ReturnType<
  typeof import("../service").createAdoptionCoordinatorService
>;
export type CoordinatorAuthorizer = (request: Request) => Promise<AdminUser>;
export type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};
export function queryParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}
```

Export the moved helpers. Import them into `http.server.ts` and replace only
`Object.fromEntries(new URL(request.url).searchParams)` with
`queryParams(request)`.

- [ ] **Step 6: Confirm GREEN and commit**

Run:

```bash
bun test src/lib/adoptions/http/shared.server.test.ts src/lib/adoptions/http.test.ts
bun run typecheck
```

Expected: PASS and exit 0.

Commit:

```bash
git add src/lib/adoptions/http.server.ts src/lib/adoptions/http.test.ts src/lib/adoptions/http
git commit -m "refactor: extract adoption HTTP transport helpers"
```

---

### Task 2: Extract status handlers

**Files:**
- Create: `src/lib/adoptions/http/statusHandlers.server.ts`
- Create: `src/lib/adoptions/http/statusHandlers.server.test.ts`
- Modify: `src/lib/adoptions/http.server.ts`

**Interfaces:**
- Produces `createStatusHandlers({ requireCoordinator, requireStatusAdmin, service })`.
- Service type:

```ts
type StatusService = Pick<
  AdoptionCoordinatorService,
  "listStatuses" | "getStatus" | "createStatus" | "updateStatus" | "deleteStatus"
>;
```

- [ ] **Step 1: Write failing direct tests**

Use a complete `CoordinatorStatus` fixture and assert:

```ts
expect(authCalls).toEqual(["coordinator", "status-admin"]);
expect(createResponse.status).toBe(201);
expect(await missingResponse.json()).toEqual({ error: "Status not found" });
```

Add a UUID-order test where `updateStatus({ params: { id: "bad" } })` returns
400 and `requireStatusAdmin` remains uncalled.

- [ ] **Step 2: Confirm RED**

Run: `bun test src/lib/adoptions/http/statusHandlers.server.test.ts`

Expected: FAIL because `createStatusHandlers` does not exist.

- [ ] **Step 3: Move the five status handlers**

Create the factory with the exact existing bodies:

```ts
export function createStatusHandlers(deps: {
  requireCoordinator: CoordinatorAuthorizer;
  requireStatusAdmin: CoordinatorAuthorizer;
  service: StatusService;
}) {
  const { requireCoordinator, requireStatusAdmin, service } = deps;
  return {
    listStatuses,
    createStatus,
    getStatus,
    updateStatus,
    deleteStatus,
  };
}
```

Define those functions inside the factory so they close over the dependencies.
Do not reorder UUID validation or authorization.

- [ ] **Step 4: Compose, verify, and commit**

Spread `createStatusHandlers(...)` into the facade and delete only the five
inline status handlers.

Run:

```bash
bun test src/lib/adoptions/http/statusHandlers.server.test.ts src/lib/adoptions/http.test.ts
bun run typecheck
```

Expected: PASS and exit 0.

Commit: `git commit -am "refactor: extract adoption status handlers"` after
explicitly adding both new files.

---

### Task 3: Extract task handlers

**Files:**
- Create: `src/lib/adoptions/http/taskHandlers.server.ts`
- Create: `src/lib/adoptions/http/taskHandlers.server.test.ts`
- Modify: `src/lib/adoptions/http.server.ts`

**Interfaces:**

```ts
type TaskService = Pick<
  AdoptionCoordinatorService,
  "listTasks" | "createTask" | "getTask" | "updateTask"
>;
export function createTaskHandlers(deps: {
  requireCoordinator: CoordinatorAuthorizer;
  service: TaskService;
}): {
  listTasks(context: HandlerContext): Promise<Response>;
  createTask(context: HandlerContext): Promise<Response>;
  getTask(context: HandlerContext): Promise<Response>;
  updateTask(context: HandlerContext): Promise<Response>;
};
```

- [ ] **Step 1: Write failing tests**

Test a create request with `{ title: "Post-adoption call" }` and assert:

```ts
expect(serviceCalls).toEqual([{
  actorUserId: staff.authUserId,
  input: { title: "Post-adoption call" },
}]);
expect(response.status).toBe(201);
```

Test `getTask` with `id: "bad"` and assert 400 before authorization.

- [ ] **Step 2: Confirm RED**

Run: `bun test src/lib/adoptions/http/taskHandlers.server.test.ts`

Expected: missing factory failure.

- [ ] **Step 3: Move the four exact task handler bodies**

Use `queryParams` for list, `jsonBody` for writes, `requiredUuid` before auth
for detail/update, and retain `Task not found`.

- [ ] **Step 4: Compose, verify, and commit**

Run:

```bash
bun test src/lib/adoptions/http/taskHandlers.server.test.ts src/lib/adoptions/http.test.ts
bun run typecheck
```

Expected: PASS and exit 0.

Commit:

```bash
git add src/lib/adoptions/http.server.ts src/lib/adoptions/http/taskHandlers.server.ts src/lib/adoptions/http/taskHandlers.server.test.ts
git commit -m "refactor: extract adoption task handlers"
```

---

### Task 4: Extract reporting handlers

**Files:**
- Create: `src/lib/adoptions/http/reportingHandlers.server.ts`
- Create: `src/lib/adoptions/http/reportingHandlers.server.test.ts`
- Modify: `src/lib/adoptions/http.server.ts`

**Interfaces:**

```ts
type ReportingService = Pick<
  AdoptionCoordinatorService,
  "listCoordinatorExportHistory" | "getCoordinatorMonthlySummary" |
  "exportCoordinatorCsv" | "regenerateCoordinatorExport"
>;
```

- [ ] **Step 1: Write failing tests**

Assert an adopter CSV request forwards:

```ts
{
  actorUserId: staff.authUserId,
  kind: "adopters",
  rawSearch: { q: "Ada" },
}
```

Assert exact CSV body, filename, content type, content disposition, and
no-store headers. Test invalid regeneration ID returns 400 before auth.

- [ ] **Step 2: Confirm RED**

Run: `bun test src/lib/adoptions/http/reportingHandlers.server.test.ts`

Expected: missing factory failure.

- [ ] **Step 3: Move the four reporting bodies**

Retain `{ summary: ... }`, raw history response, `csvResponse`, and
validation-before-auth regeneration behavior.

- [ ] **Step 4: Compose, verify, and commit**

Run the new test plus `http.test.ts` and `bun run typecheck`; expect PASS.

Commit with `refactor: extract adoption reporting handlers`.

---

### Task 5: Extract adopter handlers

**Files:**
- Create: `src/lib/adoptions/http/adopterHandlers.server.ts`
- Create: `src/lib/adoptions/http/adopterHandlers.server.test.ts`
- Modify: `src/lib/adoptions/http.server.ts`

**Interfaces:**

```ts
type AdopterService = Pick<
  AdoptionCoordinatorService,
  "listAdopters" | "searchManualCaseIdentity" | "getAdopterDetail"
>;
```

- [ ] **Step 1: Write failing tests**

Assert `q=Ada%20Lovelace` becomes `{ q: "Ada Lovelace" }`. Assert a null detail
returns status 404, no-store, and exactly:

```ts
{ error: "Adopter profile not found" }
```

- [ ] **Step 2: Confirm RED**

Run: `bun test src/lib/adoptions/http/adopterHandlers.server.test.ts`

Expected: missing factory failure.

- [ ] **Step 3: Move the three adopter bodies**

Keep `requiredUuid` before authorization in `getAdopter`.

- [ ] **Step 4: Compose, verify, and commit**

Run the new test plus `http.test.ts` and typecheck; expect PASS.

Commit with `refactor: extract adoption adopter handlers`.

---

### Task 6: Extract case handlers and finish the facade

**Files:**
- Create: `src/lib/adoptions/http/caseHandlers.server.ts`
- Create: `src/lib/adoptions/http/caseHandlers.server.test.ts`
- Modify: `src/lib/adoptions/http.server.ts`

**Interfaces:**

```ts
type CaseService = Pick<
  AdoptionCoordinatorService,
  "listCases" | "listIntakeItems" | "listAnimalPipeline" |
  "createManualCase" | "getCaseDetail" | "changeCaseStatus" |
  "createMatch" | "createFollowup" | "finalizeAdoption"
>;
```

- [ ] **Step 1: Write failing tests**

Assert manual intake returns status 201 and:

```ts
{
  case: { id: result.caseId },
  supporterId: result.supporterId,
  adopterProfileId: result.adopterProfileId,
  taskId: result.taskId,
}
```

Assert invalid case IDs return 400 before auth for status change, match,
follow-up, and finalization.

- [ ] **Step 2: Confirm RED**

Run: `bun test src/lib/adoptions/http/caseHandlers.server.test.ts`

Expected: missing factory failure.

- [ ] **Step 3: Move the nine remaining handler bodies**

Keep intake and pipeline in this group. Preserve `Case not found`, all 201
statuses, `{ ok: true }`, and actor/body/case-ID mapping.

- [ ] **Step 4: Reduce the facade to composition**

Final facade:

```ts
export function createAdoptionCoordinatorHandlers(args: CreateArgs) {
  return {
    ...createStatusHandlers(args),
    ...createCaseHandlers(args),
    ...createTaskHandlers(args),
    ...createReportingHandlers(args),
    ...createAdopterHandlers(args),
  };
}
```

`CreateArgs` retains the full service plus both authorizers. Structural typing
allows each group to consume its narrower dependency shape.

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun test src/lib/adoptions/http src/lib/adoptions/http.test.ts
bun run typecheck
```

Expected: all HTTP tests PASS and typecheck exits 0.

Commit with `refactor: extract adoption case handlers`.

---

### Task 7: Final verification and review gate

**Files:** Inspect only the adoption HTTP boundary, its tests, and the commit diff.

- [ ] **Step 1: Run focused verification**

```bash
bun test src/lib/adoptions
bun run typecheck
bun run build
```

Expected: all adoption tests pass; typecheck and build exit 0.

- [ ] **Step 2: Run the full suite**

Run: `bun test`

Expected: no new failure. If the established parallel-only route-nesting
timeout appears, rerun that exact file alone and report it separately.

- [ ] **Step 3: Inspect scope**

```bash
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- src/lib/adoptions/http.server.ts src/lib/adoptions/http
git diff --check
git status --short --branch
```

Expected: only the design/plan and adoption HTTP boundary/tests changed;
the facade is composition-only; no whitespace errors remain.

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review`. Resolve every Critical or Important
finding, rerun affected tests, and record exact fresh test counts and command
exit statuses in the handoff. Do not create a verification-only commit.
