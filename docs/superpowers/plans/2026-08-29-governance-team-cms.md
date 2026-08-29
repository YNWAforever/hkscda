# Governance/Team CMS Records (BP-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/about/team`'s static "not published yet" board section with a real, admin-managed roster with an audit trail, and build the minimal admin CRUD needed to maintain it.

**Architecture:** A new `governance` domain follows this codebase's established layered pattern (`repository.server.ts` → `service.ts` → `http.ts` → route handlers), closely mirroring the existing `knowledge` domain's structure. A new `board_member` table is **not** anon-readable — this codebase's actual established convention (confirmed by reading `knowledge_posts`'s migration and every `publicPage.server.ts` file) is that even genuinely public content is read via the service-role client through a server loader, never through direct anon RLS reads; the "public" filtering happens in the repository/service layer, not in Postgres policy. This deviates from the spec doc's original sketch (which proposed anon RLS reads) — corrected here to match the codebase's real, consistent pattern instead of introducing a new one.

**Tech Stack:** TanStack Start (React 19), Supabase Postgres (service-role client throughout — no new anon grants), Zod, `@tanstack/react-query` (admin UI), Bun test runner.

**Spec:** `docs/superpowers/specs/2026-08-29-governance-team-cms-design.md`

---

## Git setup

This plan runs in an isolated worktree on branch `docs/governance-team-cms-impl`, branched from `docs/governance-team-cms-design` (which already has the spec commit `9a02053` on top of `main`). A single PR from the impl branch targets `main` directly at the end.

**Important operational note for Task 1 and Task 8**: this plan creates a real migration that must be applied to the actual Supabase project (ref `iihqjzilgawhfdhdevam`) for the feature to work end-to-end. Task 1 only writes the SQL file (safe, reversible, no live effect). Task 8's manual browser check is where the migration actually needs to be applied — get explicit human confirmation before running `supabase db push` (or equivalent) against the live project; do not apply it automatically without that confirmation.

---

### Task 1: Migration — `board_member` table

**Files:**
- Create: `supabase/migrations/20260829120000_governance_board_members.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260829120000_governance_board_members.sql
create table if not exists public.board_member (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  role_title text not null check (char_length(role_title) between 1 and 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  effective_date date not null,
  is_active boolean not null default true,
  created_by uuid references public.admin_user(id) on delete set null,
  updated_by uuid references public.admin_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists board_member_public_idx
  on public.board_member (is_active, sort_order);

alter table public.board_member enable row level security;

grant select, insert, update, delete on public.board_member to service_role;

revoke all on public.board_member from anon, authenticated;

drop trigger if exists set_updated_at on public.board_member;
create trigger set_updated_at before update on public.board_member
  for each row execute function public.set_updated_at();
```

This mirrors `knowledge_posts`'s migration (`supabase/migrations/20260718120000_group_enquiries_and_knowledge.sql`) exactly: RLS enabled with zero anon/authenticated grants, all access via `service_role` only, reusing the existing `public.set_updated_at()` trigger function (already defined in `20260623160506_phase_2_donations_mvp.sql` — do not redefine it).

- [ ] **Step 2: Do NOT apply this migration yet**

This step only creates the SQL file in the repo. It is not applied to any database in this task — that happens explicitly in Task 8, with human confirmation, after every layer above it is built and tested against fakes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260829120000_governance_board_members.sql
git commit -m "feat: add board_member table migration (not yet applied)"
```

---

### Task 2: Types and Zod schemas

**Files:**
- Create: `src/lib/governance/types.ts`
- Create: `src/lib/governance/schemas.ts`
- Test: `src/lib/governance/schemas.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// src/lib/governance/types.ts
export type BoardMember = {
  id: string;
  name: string;
  roleTitle: string;
  sortOrder: number;
  effectiveDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BoardMemberInput = {
  id?: string;
  name: string;
  roleTitle: string;
  sortOrder: number;
  effectiveDate: string;
};

export type PublicBoardRosterMember = {
  name: string;
  roleTitle: string;
  sortOrder: number;
};

export type PublicBoardRoster = {
  members: PublicBoardRosterMember[];
  lastUpdated: string | null;
};

export type GovernanceAuditLog = {
  actor_user_id: string;
  action: "board_member.create" | "board_member.update" | "board_member.deactivate";
  entity: "board_member";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp: string;
};

export interface GovernanceRepository {
  listPublicRoster(): Promise<PublicBoardRoster>;
  listAdmin(): Promise<BoardMember[]>;
  upsert(input: BoardMemberInput): Promise<BoardMember>;
  deactivate(id: string): Promise<void>;
  insertAuditLog(input: GovernanceAuditLog): Promise<void>;
}
```

- [ ] **Step 2: Write the failing schema tests**

```ts
// src/lib/governance/schemas.test.ts
import { describe, expect, test } from "bun:test";
import { boardMemberInputSchema, deactivateBoardMemberSchema } from "./schemas";

describe("boardMemberInputSchema", () => {
  test("accepts a valid new-member input and defaults sortOrder to 0", () => {
    const parsed = boardMemberInputSchema.parse({
      name: "陳大文",
      roleTitle: "主席",
      effectiveDate: "2026-08-01",
    });
    expect(parsed).toEqual({ name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" });
  });

  test("accepts an existing member's id for updates", () => {
    const parsed = boardMemberInputSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "陳大文",
      roleTitle: "主席",
      sortOrder: 2,
      effectiveDate: "2026-08-01",
    });
    expect(parsed.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("rejects an empty name", () => {
    expect(() =>
      boardMemberInputSchema.parse({ name: "", roleTitle: "主席", effectiveDate: "2026-08-01" }),
    ).toThrow();
  });

  test("rejects a malformed effectiveDate", () => {
    expect(() =>
      boardMemberInputSchema.parse({ name: "陳大文", roleTitle: "主席", effectiveDate: "2026/08/01" }),
    ).toThrow();
  });

  test("rejects a negative sortOrder", () => {
    expect(() =>
      boardMemberInputSchema.parse({
        name: "陳大文",
        roleTitle: "主席",
        sortOrder: -1,
        effectiveDate: "2026-08-01",
      }),
    ).toThrow();
  });
});

describe("deactivateBoardMemberSchema", () => {
  test("accepts a valid uuid", () => {
    const parsed = deactivateBoardMemberSchema.parse({ id: "11111111-1111-4111-8111-111111111111" });
    expect(parsed.id).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("rejects a non-uuid id", () => {
    expect(() => deactivateBoardMemberSchema.parse({ id: "not-a-uuid" })).toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test src/lib/governance/schemas.test.ts`
Expected: FAIL — `schemas.ts` does not exist yet.

- [ ] **Step 4: Write `schemas.ts`**

```ts
// src/lib/governance/schemas.ts
import { z } from "zod";

const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const boardMemberIdSchema = z.string().uuid();

export const boardMemberInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: requiredText(120),
  roleTitle: requiredText(120),
  sortOrder: z.coerce.number().int().min(0).default(0),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveDate must be YYYY-MM-DD"),
});

export const deactivateBoardMemberSchema = z.object({ id: boardMemberIdSchema });

export type BoardMemberInput = z.infer<typeof boardMemberInputSchema>;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/lib/governance/schemas.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/governance/types.ts src/lib/governance/schemas.ts src/lib/governance/schemas.test.ts
git commit -m "feat: add governance domain types and validation schemas"
```

---

### Task 3: Service layer with audit logging

**Files:**
- Create: `src/lib/governance/service.ts`
- Test: `src/lib/governance/service.test.ts`

**Context:** Mirrors `src/lib/knowledge/service.ts` exactly — a DI factory taking `{repo, now}`, where `now` defaults to `() => new Date()` (this codebase's injectable-clock convention: never call `new Date()` inline in logic you intend to test).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/governance/service.test.ts
import { describe, expect, test } from "bun:test";
import { createGovernanceService } from "./service";
import type { BoardMember, GovernanceAuditLog, GovernanceRepository } from "./types";

function fakeMember(overrides: Partial<BoardMember> = {}): BoardMember {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "陳大文",
    roleTitle: "主席",
    sortOrder: 0,
    effectiveDate: "2026-08-01",
    isActive: true,
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

function createFakeRepo(overrides: Partial<GovernanceRepository> = {}): {
  repo: GovernanceRepository;
  auditCalls: GovernanceAuditLog[];
} {
  const auditCalls: GovernanceAuditLog[] = [];
  const repo: GovernanceRepository = {
    listPublicRoster: async () => ({ members: [], lastUpdated: null }),
    listAdmin: async () => [],
    upsert: async () => fakeMember(),
    deactivate: async () => {},
    insertAuditLog: async (input) => {
      auditCalls.push(input);
    },
    ...overrides,
  };
  return { repo, auditCalls };
}

describe("createGovernanceService", () => {
  test("upsert without an id creates a member and audits board_member.create", async () => {
    const { repo, auditCalls } = createFakeRepo({ upsert: async () => fakeMember() });
    const service = createGovernanceService({ repo, now: () => new Date("2026-08-29T12:00:00.000Z") });

    const member = await service.upsert({
      actorUserId: "admin-1",
      input: { name: "陳大文", roleTitle: "主席", effectiveDate: "2026-08-01" },
    });

    expect(member.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(auditCalls).toEqual([
      {
        actor_user_id: "admin-1",
        action: "board_member.create",
        entity: "board_member",
        entity_id: "11111111-1111-4111-8111-111111111111",
        detail: { name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" },
        timestamp: "2026-08-29T12:00:00.000Z",
      },
    ]);
  });

  test("upsert with an id updates a member and audits board_member.update", async () => {
    const { repo, auditCalls } = createFakeRepo({ upsert: async () => fakeMember() });
    const service = createGovernanceService({ repo, now: () => new Date("2026-08-29T12:00:00.000Z") });

    await service.upsert({
      actorUserId: "admin-1",
      input: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "陳大文",
        roleTitle: "副主席",
        sortOrder: 1,
        effectiveDate: "2026-08-01",
      },
    });

    expect(auditCalls[0].action).toBe("board_member.update");
  });

  test("deactivate removes a member from the active roster and audits board_member.deactivate", async () => {
    let deactivatedId: string | null = null;
    const { repo, auditCalls } = createFakeRepo({
      deactivate: async (id) => {
        deactivatedId = id;
      },
    });
    const service = createGovernanceService({ repo, now: () => new Date("2026-08-29T12:00:00.000Z") });

    await service.deactivate({ actorUserId: "admin-1", id: "11111111-1111-4111-8111-111111111111" });

    expect(deactivatedId).toBe("11111111-1111-4111-8111-111111111111");
    expect(auditCalls).toEqual([
      {
        actor_user_id: "admin-1",
        action: "board_member.deactivate",
        entity: "board_member",
        entity_id: "11111111-1111-4111-8111-111111111111",
        detail: {},
        timestamp: "2026-08-29T12:00:00.000Z",
      },
    ]);
  });

  test("upsert rejects invalid input before ever touching the repository", async () => {
    const { repo, auditCalls } = createFakeRepo();
    const service = createGovernanceService({ repo });

    await expect(
      service.upsert({ actorUserId: "admin-1", input: { name: "", roleTitle: "主席", effectiveDate: "2026-08-01" } }),
    ).rejects.toThrow();
    expect(auditCalls).toHaveLength(0);
  });

  test("listPublicRoster and listAdmin delegate straight to the repository", async () => {
    const { repo } = createFakeRepo({
      listPublicRoster: async () => ({ members: [{ name: "陳大文", roleTitle: "主席", sortOrder: 0 }], lastUpdated: "2026-08-29T00:00:00.000Z" }),
      listAdmin: async () => [fakeMember()],
    });
    const service = createGovernanceService({ repo });

    await expect(service.listPublicRoster()).resolves.toEqual({
      members: [{ name: "陳大文", roleTitle: "主席", sortOrder: 0 }],
      lastUpdated: "2026-08-29T00:00:00.000Z",
    });
    await expect(service.listAdmin()).resolves.toEqual([fakeMember()]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/governance/service.test.ts`
Expected: FAIL — `service.ts` does not exist yet.

- [ ] **Step 3: Write `service.ts`**

```ts
// src/lib/governance/service.ts
import { boardMemberInputSchema, deactivateBoardMemberSchema } from "./schemas";
import type { GovernanceAuditLog, GovernanceRepository } from "./types";

export function createGovernanceService({
  repo,
  now = () => new Date(),
}: {
  repo: GovernanceRepository;
  now?: () => Date;
}) {
  async function audit(input: Omit<GovernanceAuditLog, "timestamp">) {
    await repo.insertAuditLog({ ...input, timestamp: now().toISOString() });
  }

  return {
    listPublicRoster() {
      return repo.listPublicRoster();
    },

    listAdmin() {
      return repo.listAdmin();
    },

    async upsert({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = boardMemberInputSchema.parse(input);
      const { id, ...rest } = parsed;
      const member = await repo.upsert(id ? { id, ...rest } : rest);
      await audit({
        actor_user_id: actorUserId,
        action: parsed.id ? "board_member.update" : "board_member.create",
        entity: "board_member",
        entity_id: member.id,
        detail: parsed,
      });
      return member;
    },

    async deactivate({ actorUserId, id }: { actorUserId: string; id: string }) {
      const parsed = deactivateBoardMemberSchema.parse({ id });
      await repo.deactivate(parsed.id);
      await audit({
        actor_user_id: actorUserId,
        action: "board_member.deactivate",
        entity: "board_member",
        entity_id: parsed.id,
        detail: {},
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/governance/service.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/governance/service.ts src/lib/governance/service.test.ts
git commit -m "feat: add governance service layer with audit logging"
```

---

### Task 4: Service-role repository

**Files:**
- Create: `src/lib/governance/repository.server.ts`
- Test: `src/lib/governance/repository.server.test.ts`

**Context:** `board_member` has zero anon/authenticated grants (Task 1) — this repository is only ever called with a service-role client. `listPublicRoster()` filters `is_active = true`, orders by `sort_order`, and projects to only `name`/`roleTitle`/`sortOrder` (never `id`, `createdBy`, `updatedBy`, or timestamps beyond the single `lastUpdated` summary) — the admin-facing `listAdmin()` returns full rows including inactive ones.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/governance/repository.server.test.ts
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseGovernanceRepository } from "./repository.server";

type FakeResult = { data?: unknown[] | null; error?: { message: string } | null };

function createBuilder(calls: unknown[], result: FakeResult) {
  const builder: Record<string, unknown> = {
    select(columns: string, options?: unknown) {
      calls.push({ name: "select", columns, options });
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push({ name: "eq", column, value });
      return builder;
    },
    order(column: string, options?: unknown) {
      calls.push({ name: "order", column, options });
      return builder;
    },
    insert(payload: unknown) {
      calls.push({ name: "insert", payload });
      return builder;
    },
    update(payload: unknown) {
      calls.push({ name: "update", payload });
      return builder;
    },
    single() {
      calls.push({ name: "single" });
      return Promise.resolve(result);
    },
    then(resolve: (value: FakeResult) => void) {
      resolve(result);
    },
  };
  return builder;
}

function createClient(results: Record<string, FakeResult>) {
  const calls: unknown[] = [];
  const client = {
    calls,
    from(table: string) {
      calls.push({ name: "from", table });
      return createBuilder(calls, results[table] ?? { data: [], error: null });
    },
  };
  return client as unknown as SupabaseClient & { calls: unknown[] };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "陳大文",
  role_title: "主席",
  sort_order: 0,
  effective_date: "2026-08-01",
  is_active: true,
  created_at: "2026-08-29T00:00:00.000Z",
  updated_at: "2026-08-29T00:00:00.000Z",
  ...overrides,
});

describe("listPublicRoster", () => {
  test("projects only name, roleTitle, and sortOrder, and computes the latest updatedAt", async () => {
    const client = createClient({
      board_member: {
        data: [
          row({ id: "a", name: "甲", sort_order: 0, updated_at: "2026-08-10T00:00:00.000Z" }),
          row({ id: "b", name: "乙", sort_order: 1, updated_at: "2026-08-29T00:00:00.000Z" }),
        ],
        error: null,
      },
    });
    const repo = createSupabaseGovernanceRepository(client);

    const roster = await repo.listPublicRoster();

    expect(roster.members).toEqual([
      { name: "甲", roleTitle: "主席", sortOrder: 0 },
      { name: "乙", roleTitle: "主席", sortOrder: 1 },
    ]);
    expect(roster.lastUpdated).toBe("2026-08-29T00:00:00.000Z");
  });

  test("returns an empty roster with a null lastUpdated when there are no active members", async () => {
    const client = createClient({ board_member: { data: [], error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    await expect(repo.listPublicRoster()).resolves.toEqual({ members: [], lastUpdated: null });
  });

  test("filters to is_active = true only", async () => {
    const client = createClient({ board_member: { data: [], error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    await repo.listPublicRoster();

    expect(client.calls).toContainEqual({ name: "eq", column: "is_active", value: true });
  });
});

describe("listAdmin", () => {
  test("returns full rows including inactive members, ordered by sortOrder", async () => {
    const client = createClient({
      board_member: { data: [row({ id: "a" }), row({ id: "b", is_active: false })], error: null },
    });
    const repo = createSupabaseGovernanceRepository(client);

    const members = await repo.listAdmin();

    expect(members).toHaveLength(2);
    expect(members[1].isActive).toBe(false);
  });
});

describe("upsert", () => {
  test("inserts a new member when no id is given", async () => {
    const client = createClient({ board_member: { data: row(), error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    const member = await repo.upsert({ name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" });

    expect(member.name).toBe("陳大文");
    expect(client.calls).toContainEqual({ name: "insert", payload: { name: "陳大文", role_title: "主席", sort_order: 0, effective_date: "2026-08-01" } });
  });

  test("updates an existing member when an id is given", async () => {
    const client = createClient({ board_member: { data: row(), error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    await repo.upsert({
      id: "11111111-1111-4111-8111-111111111111",
      name: "陳大文",
      roleTitle: "主席",
      sortOrder: 0,
      effectiveDate: "2026-08-01",
    });

    expect(client.calls).toContainEqual({
      name: "update",
      payload: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "陳大文",
        role_title: "主席",
        sort_order: 0,
        effective_date: "2026-08-01",
      },
    });
  });
});

describe("deactivate", () => {
  test("sets is_active to false rather than deleting the row", async () => {
    const client = createClient({ board_member: { data: [], error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    await repo.deactivate("11111111-1111-4111-8111-111111111111");

    expect(client.calls).toContainEqual({ name: "update", payload: { is_active: false } });
    expect(client.calls).toContainEqual({ name: "eq", column: "id", value: "11111111-1111-4111-8111-111111111111" });
  });
});

describe("insertAuditLog", () => {
  test("writes to the shared audit_log table", async () => {
    const client = createClient({ audit_log: { data: [], error: null } });
    const repo = createSupabaseGovernanceRepository(client);

    await repo.insertAuditLog({
      actor_user_id: "admin-1",
      action: "board_member.create",
      entity: "board_member",
      entity_id: "11111111-1111-4111-8111-111111111111",
      detail: {},
      timestamp: "2026-08-29T00:00:00.000Z",
    });

    expect(client.calls).toContainEqual({ name: "from", table: "audit_log" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/governance/repository.server.test.ts`
Expected: FAIL — `repository.server.ts` does not exist yet.

- [ ] **Step 3: Write `repository.server.ts`**

```ts
// src/lib/governance/repository.server.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  BoardMember,
  BoardMemberInput,
  GovernanceAuditLog,
  GovernanceRepository,
  PublicBoardRoster,
} from "./types";

const ROW_COLUMNS = "id,name,role_title,sort_order,effective_date,is_active,created_at,updated_at";

const rowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role_title: z.string().min(1),
  sort_order: z.number().int().min(0),
  effective_date: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

function mapRow(raw: unknown): BoardMember | null {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    name: parsed.data.name,
    roleTitle: parsed.data.role_title,
    sortOrder: parsed.data.sort_order,
    effectiveDate: parsed.data.effective_date,
    isActive: parsed.data.is_active,
    createdAt: parsed.data.created_at,
    updatedAt: parsed.data.updated_at,
  };
}

function toRow(input: BoardMemberInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    name: input.name,
    role_title: input.roleTitle,
    sort_order: input.sortOrder,
    effective_date: input.effectiveDate,
  };
}

export function createSupabaseGovernanceRepository(client: SupabaseClient): GovernanceRepository {
  return {
    async listPublicRoster(): Promise<PublicBoardRoster> {
      const { data, error } = await client
        .from("board_member")
        .select(ROW_COLUMNS)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;

      const members = ((data ?? []) as unknown[])
        .map(mapRow)
        .filter((row): row is BoardMember => row !== null);

      const lastUpdated = members.reduce<string | null>(
        (latest, member) => (!latest || member.updatedAt > latest ? member.updatedAt : latest),
        null,
      );

      return {
        members: members.map((m) => ({ name: m.name, roleTitle: m.roleTitle, sortOrder: m.sortOrder })),
        lastUpdated,
      };
    },

    async listAdmin(): Promise<BoardMember[]> {
      const { data, error } = await client
        .from("board_member")
        .select(ROW_COLUMNS)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown[]).map(mapRow).filter((row): row is BoardMember => row !== null);
    },

    async upsert(input: BoardMemberInput): Promise<BoardMember> {
      const query = input.id
        ? client.from("board_member").update(toRow(input)).eq("id", input.id)
        : client.from("board_member").insert(toRow(input));
      const { data, error } = await query.select(ROW_COLUMNS).single();
      if (error) throw error;
      const mapped = mapRow(data);
      if (!mapped) throw new Error("Board member mutation returned an invalid row");
      return mapped;
    },

    async deactivate(id: string): Promise<void> {
      const { error } = await client.from("board_member").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },

    async insertAuditLog(input: GovernanceAuditLog): Promise<void> {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/governance/repository.server.test.ts`
Expected: PASS (9 tests)

If the fake client's `.single()`/`.then()` interplay doesn't resolve the way `upsert`'s test expects (the fake needs to support `.select(...).single()` chained after `.insert(...)`/`.update(...)`), adjust the fake builder to match — do not change the real implementation to work around a test double that doesn't model the real Supabase query-builder chain correctly.

- [ ] **Step 5: Commit**

```bash
git add src/lib/governance/repository.server.ts src/lib/governance/repository.server.test.ts
git commit -m "feat: add service-role repository for board_member"
```

---

### Task 5: HTTP handlers and admin API route

**Files:**
- Create: `src/lib/governance/http.ts`
- Create: `src/routes/api/admin/governance.ts`
- Test: `src/lib/governance/http.test.ts`

**Context:** Mirrors `src/lib/knowledge/http.ts` and `src/routes/api/admin/knowledge.ts` exactly, gating on `["admin"]` only (not `["staff", "admin"]` like knowledge) per the design's access decision.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/governance/http.test.ts
import { describe, expect, test } from "bun:test";
import { createAdminGovernanceHandlers } from "./http";
import type { AdminUser } from "../donations/supabase.server";

const admin: AdminUser = { id: "admin-1", authUserId: "auth-1", email: "a@example.test", role: "admin", status: "active" };

function createHandlers(overrides: Partial<Parameters<typeof createAdminGovernanceHandlers>[0]["service"]> = {}) {
  return createAdminGovernanceHandlers({
    requireGovernanceAdmin: async () => admin,
    service: {
      listAdmin: async () => [],
      upsert: async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        name: "陳大文",
        roleTitle: "主席",
        sortOrder: 0,
        effectiveDate: "2026-08-01",
        isActive: true,
        createdAt: "2026-08-29T00:00:00.000Z",
        updatedAt: "2026-08-29T00:00:00.000Z",
      }),
      deactivate: async () => {},
      ...overrides,
    },
  });
}

describe("createAdminGovernanceHandlers", () => {
  test("list returns the admin roster as JSON with no-store caching", async () => {
    const handlers = createHandlers({ listAdmin: async () => [] });
    const response = await handlers.list({ request: new Request("http://x/api/admin/governance") });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([]);
  });

  test("upsert parses the request body and returns the created member", async () => {
    const handlers = createHandlers();
    const response = await handlers.upsert({
      request: new Request("http://x/api/admin/governance", {
        method: "POST",
        body: JSON.stringify({ name: "陳大文", roleTitle: "主席", effectiveDate: "2026-08-01" }),
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.member.name).toBe("陳大文");
  });

  test("deactivate requires an id in the body", async () => {
    const handlers = createHandlers();
    const response = await handlers.deactivate({
      request: new Request("http://x/api/admin/governance", { method: "DELETE", body: JSON.stringify({}) }),
    });

    expect(response.status).toBe(400);
  });

  test("a thrown Response from requireGovernanceAdmin is returned as-is (e.g. 403 for a non-admin role)", async () => {
    const handlers = createAdminGovernanceHandlers({
      requireGovernanceAdmin: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      service: { listAdmin: async () => [], upsert: async () => { throw new Error("unreachable"); }, deactivate: async () => {} },
    });

    const response = await handlers.list({ request: new Request("http://x/api/admin/governance") });
    expect(response.status).toBe(403);
  });

  test("an unexpected service error maps to a 500 without leaking details", async () => {
    const handlers = createHandlers({ listAdmin: async () => { throw new Error("db exploded"); } });
    const response = await handlers.list({ request: new Request("http://x/api/admin/governance") });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Could not process governance request");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/governance/http.test.ts`
Expected: FAIL — `http.ts` does not exist yet.

- [ ] **Step 3: Write `http.ts`**

```ts
// src/lib/governance/http.ts
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createGovernanceService } from "./service";

type HandlerContext = { request: Request };
type GovernanceService = ReturnType<typeof createGovernanceService>;

type CreateAdminGovernanceHandlersArgs = {
  requireGovernanceAdmin: (request: Request) => Promise<AdminUser>;
  service: Pick<GovernanceService, "listAdmin" | "upsert" | "deactivate">;
};

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonNoStore({ error: "Invalid JSON body" }, { status: 400 });
  }
}

async function withGovernanceErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return jsonNoStore({ error: "Invalid governance request" }, { status: 400 });
    console.error(error);
    return jsonNoStore({ error: "Could not process governance request" }, { status: 500 });
  }
}

export function createAdminGovernanceHandlers({ requireGovernanceAdmin, service }: CreateAdminGovernanceHandlersArgs) {
  return {
    list({ request }: HandlerContext) {
      return withGovernanceErrors(async () => {
        await requireGovernanceAdmin(request);
        return jsonNoStore(await service.listAdmin());
      });
    },

    upsert({ request }: HandlerContext) {
      return withGovernanceErrors(async () => {
        const admin = await requireGovernanceAdmin(request);
        return jsonNoStore({ member: await service.upsert({ actorUserId: admin.id, input: await jsonBody(request) }) });
      });
    },

    deactivate({ request }: HandlerContext) {
      return withGovernanceErrors(async () => {
        const admin = await requireGovernanceAdmin(request);
        const body = (await jsonBody(request)) as { id?: string };
        if (!body.id) return jsonNoStore({ error: "Missing board member id" }, { status: 400 });
        await service.deactivate({ actorUserId: admin.id, id: body.id });
        return jsonNoStore({ ok: true });
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/governance/http.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the API route**

```ts
// src/routes/api/admin/governance.ts
import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient, requireAdmin } from "../../../lib/donations/supabase.server";
import { createAdminGovernanceHandlers } from "../../../lib/governance/http";
import { createSupabaseGovernanceRepository } from "../../../lib/governance/repository.server";
import { createGovernanceService } from "../../../lib/governance/service";

export function createHandlers() {
  const client = createSupabaseServiceClient();
  return createAdminGovernanceHandlers({
    requireGovernanceAdmin: (request) => requireAdmin(request, ["admin"], client),
    service: createGovernanceService({ repo: createSupabaseGovernanceRepository(client) }),
  });
}

export const Route = createFileRoute("/api/admin/governance")({
  server: {
    handlers: {
      GET: ({ request }) => createHandlers().list({ request }),
      POST: ({ request }) => createHandlers().upsert({ request }),
      DELETE: ({ request }) => createHandlers().deactivate({ request }),
    },
  },
});
```

- [ ] **Step 6: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/governance/http.ts src/lib/governance/http.test.ts src/routes/api/admin/governance.ts
git commit -m "feat: add admin-only governance API route (requireAdmin ['admin'])"
```

---

### Task 6: Access control wiring, admin UI, and admin route

**Files:**
- Modify: `src/lib/admin/access.ts`
- Modify: `src/components/admin/adminNav.ts`
- Create: `src/components/admin/content/GovernanceManagement.tsx`
- Create: `src/routes/admin/governance.tsx`
- Test: `src/components/admin/content/GovernanceManagement.test.ts`

**Context:** Read the current `src/lib/admin/access.ts` and `src/components/admin/adminNav.ts` first. Both `staff` and `admin` currently share `contentManagement`; this task adds a brand-new `governanceManagement` area granted **only** to `admin`.

- [ ] **Step 1: Add the new access area to `src/lib/admin/access.ts`**

In the `AdminAccessArea` union type, add `"governanceManagement"`:

```diff
 export type AdminAccessArea =
   | "animals"
   | "adoptionCases"
   | "manualIntake"
   | "coordinatorTasks"
   | "adopters"
   | "coordinatorReports"
   | "coordinatorStatuses"
   | "payments"
   | "supporters"
   | "volunteerManagement"
   | "contentManagement"
+  | "governanceManagement"
   | "accessManagement";
```

In `ROLE_ACCESS`, add it only to `admin` (not `staff`, not `treasurer`):

```diff
   admin: new Set([
     "animals",
     "adoptionCases",
     "manualIntake",
     "coordinatorTasks",
     "adopters",
     "coordinatorReports",
     "coordinatorStatuses",
     "volunteerManagement",
     "payments",
     "supporters",
     "contentManagement",
+    "governanceManagement",
     "accessManagement",
   ]),
```

In `NAV_ITEM_AREAS`, add:

```diff
   content: "contentManagement",
   "adoption-information": "contentManagement",
   knowledge: "contentManagement",
+  governance: "governanceManagement",
   supporters: "supporters",
```

In `getAdminAreaForLocation`, add a branch before the final `return "animals"`:

```diff
   if (input.pathname.startsWith("/admin/content")) return "contentManagement";
+  if (input.pathname.startsWith("/admin/governance")) return "governanceManagement";
   if (input.pathname.startsWith("/admin/access")) return "accessManagement";
   return "animals";
```

- [ ] **Step 2: Add the nav item to `src/components/admin/adminNav.ts`**

Add a new entry to `ADMIN_NAV_ITEMS` (place it after the `knowledge` entry):

```diff
   {
     id: "knowledge",
     section: "content",
     group: "promotion",
     label: "知識庫",
     icon: ClipboardPenLine,
     to: "/admin/content/knowledge",
     activePath: "/admin/content/knowledge",
   },
+  {
+    id: "governance",
+    section: "content",
+    group: "promotion",
+    label: "團隊與管治",
+    icon: Users,
+    to: "/admin/governance",
+    activePath: "/admin/governance",
+  },
```

`Users` is already imported at the top of this file (used elsewhere) — confirm this before adding; if it isn't imported, add it to the existing `lucide-react` import block.

- [ ] **Step 3: Write the admin UI component and its pure-function test**

```ts
// src/components/admin/content/GovernanceManagement.test.ts
import { describe, expect, test } from "bun:test";
import { toInput } from "./GovernanceManagement";

describe("toInput", () => {
  test("omits id for a new-member draft", () => {
    expect(
      toInput({ name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" }),
    ).toEqual({ name: "陳大文", roleTitle: "主席", sortOrder: 0, effectiveDate: "2026-08-01" });
  });

  test("includes id when editing an existing member", () => {
    expect(
      toInput({
        id: "11111111-1111-4111-8111-111111111111",
        name: "陳大文",
        roleTitle: "主席",
        sortOrder: 0,
        effectiveDate: "2026-08-01",
      }),
    ).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      name: "陳大文",
      roleTitle: "主席",
      sortOrder: 0,
      effectiveDate: "2026-08-01",
    });
  });
});
```

```tsx
// src/components/admin/content/GovernanceManagement.tsx
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminJson } from "../../../lib/admin/http";
import type { BoardMember, BoardMemberInput } from "../../../lib/governance/types";

export const ADMIN_GOVERNANCE_QUERY_KEY = ["admin-governance"] as const;

type BoardMemberDraft = {
  id?: string;
  name: string;
  roleTitle: string;
  sortOrder: number;
  effectiveDate: string;
};

function draftFromMember(member?: BoardMember): BoardMemberDraft {
  return {
    id: member?.id,
    name: member?.name ?? "",
    roleTitle: member?.roleTitle ?? "",
    sortOrder: member?.sortOrder ?? 0,
    effectiveDate: member?.effectiveDate ?? new Date().toISOString().slice(0, 10),
  };
}

export function toInput(draft: BoardMemberDraft): BoardMemberInput {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name,
    roleTitle: draft.roleTitle,
    sortOrder: draft.sortOrder,
    effectiveDate: draft.effectiveDate,
  };
}

export function invalidateGovernanceQueries(client: { invalidateQueries(input: { queryKey: readonly string[] }): Promise<unknown> }) {
  return client.invalidateQueries({ queryKey: ADMIN_GOVERNANCE_QUERY_KEY });
}

export function GovernanceManagement() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<BoardMemberDraft | null>(null);

  const membersQuery = useQuery({
    queryKey: ADMIN_GOVERNANCE_QUERY_KEY,
    queryFn: () => fetchAdminJson<BoardMember[]>("/api/admin/governance"),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: BoardMemberInput) =>
      fetchAdminJson<{ member: BoardMember }>("/api/admin/governance", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      setDraft(null);
      return invalidateGovernanceQueries(queryClient);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) =>
      fetchAdminJson<{ ok: true }>("/api/admin/governance", { method: "DELETE", body: JSON.stringify({ id }) }),
    onSuccess: () => invalidateGovernanceQueries(queryClient),
  });

  const members = membersQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">團隊與管治</h1>
        <button type="button" className="btn-primary min-h-11 px-4" onClick={() => setDraft(draftFromMember())}>
          新增成員
        </button>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">姓名</th>
            <th className="py-2">職銜</th>
            <th className="py-2">排序</th>
            <th className="py-2">生效日期</th>
            <th className="py-2">狀態</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b">
              <td className="py-2">{member.name}</td>
              <td className="py-2">{member.roleTitle}</td>
              <td className="py-2">{member.sortOrder}</td>
              <td className="py-2">{member.effectiveDate}</td>
              <td className="py-2">{member.isActive ? "在任" : "已卸任"}</td>
              <td className="py-2">
                <button type="button" onClick={() => setDraft(draftFromMember(member))}>
                  編輯
                </button>
                {member.isActive ? (
                  <button type="button" onClick={() => deactivateMutation.mutate(member.id)} disabled={deactivateMutation.isPending}>
                    卸任
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {draft ? (
        <form
          className="space-y-3 border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            upsertMutation.mutate(toInput(draft));
          }}
        >
          <label className="block">
            姓名
            <input className="mt-1 block w-full border px-3 py-2" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
          </label>
          <label className="block">
            職銜
            <input className="mt-1 block w-full border px-3 py-2" value={draft.roleTitle} onChange={(event) => setDraft({ ...draft, roleTitle: event.target.value })} required />
          </label>
          <label className="block">
            排序
            <input type="number" className="mt-1 block w-full border px-3 py-2" value={draft.sortOrder} onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })} />
          </label>
          <label className="block">
            生效日期
            <input type="date" className="mt-1 block w-full border px-3 py-2" value={draft.effectiveDate} onChange={(event) => setDraft({ ...draft, effectiveDate: event.target.value })} required />
          </label>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary min-h-11 px-4" disabled={upsertMutation.isPending}>
              儲存
            </button>
            <button type="button" className="btn-secondary min-h-11 px-4" onClick={() => setDraft(null)}>
              取消
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Write the admin route**

```tsx
// src/routes/admin/governance.tsx
import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { GovernanceManagement } from "../../components/admin/content/GovernanceManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/governance")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("governanceManagement", context.queryClient);
  },
  component: AdminGovernancePage,
});

export function AdminGovernancePage() {
  return (
    <AdminLayout activeSection="content">
      <GovernanceManagement />
    </AdminLayout>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/components/admin/content/GovernanceManagement.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Typecheck and lint**

```bash
bunx tsc --noEmit
bunx eslint src/lib/admin/access.ts src/components/admin/adminNav.ts src/components/admin/content/GovernanceManagement.tsx src/routes/admin/governance.tsx
```

Fix nothing yourself beyond a scoped, single-file `bunx prettier --write <file>` for a pure formatting issue.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/access.ts src/components/admin/adminNav.ts src/components/admin/content/GovernanceManagement.tsx src/components/admin/content/GovernanceManagement.test.ts src/routes/admin/governance.tsx
git commit -m "feat: add admin-only governance UI, nav item, and access area"
```

---

### Task 7: Real `/about/team` board section

**Files:**
- Create: `src/lib/governance/publicPage.server.ts`
- Create: `src/lib/governance/publicPage.functions.ts`
- Modify: `src/routes/about/team.tsx`
- Test: `src/routes/about/team.test.tsx` (new)

**Context:** Read the current `src/routes/about/team.tsx` first (it has no loader today). Public reads go through the service-role client via a server loader — **not** anon RLS (there is none on this table) — following the exact pattern already used by `src/lib/knowledge/publicPage.server.ts`.

- [ ] **Step 1: Write `publicPage.server.ts` and `publicPage.functions.ts`**

```ts
// src/lib/governance/publicPage.server.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "../donations/supabase.server";
import { createSupabaseGovernanceRepository } from "./repository.server";
import type { PublicBoardRoster } from "./types";

export type { PublicBoardRoster } from "./types";

export async function loadPublicBoardRoster(
  createClient: () => SupabaseClient = createSupabaseServiceClient,
): Promise<PublicBoardRoster> {
  return createSupabaseGovernanceRepository(createClient()).listPublicRoster();
}
```

```ts
// src/lib/governance/publicPage.functions.ts
import { createServerFn } from "@tanstack/react-start";

export const getPublicBoardRoster = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicBoardRoster } = await import("./publicPage.server");
  return loadPublicBoardRoster();
});
```

- [ ] **Step 2: Write the failing route tests**

```tsx
// src/routes/about/team.test.tsx
import { expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

import type { PublicBoardRoster } from "@/lib/governance/publicPage.server";

const realReactRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  createFileRoute: () => (options: unknown) => options,
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const populatedRoster: PublicBoardRoster = {
  members: [
    { name: "陳大文", roleTitle: "主席", sortOrder: 0 },
    { name: "李小明", roleTitle: "義務秘書", sortOrder: 1 },
  ],
  lastUpdated: "2026-08-29T00:00:00.000Z",
};

test("renders the board roster and a last-updated date when populated", async () => {
  const { TeamPage } = await import("./team");
  const html = renderToString(<TeamPage roster={populatedRoster} />);

  expect(html).toContain("陳大文");
  expect(html).toContain("主席");
  expect(html).toContain("2026年8月29日");
  expect(html).not.toContain("尚未有公開資料");
  expect(html.match(/<h1/g) ?? []).toHaveLength(1);
});

test("shows a genuinely-empty state distinct from an error, when there are zero active members", async () => {
  const { TeamPage } = await import("./team");
  const html = renderToString(<TeamPage roster={{ members: [], lastUpdated: null }} />);

  expect(html).toContain("尚未有公開資料");
  expect(html).not.toContain("暫時未能載入");
});

test("shows a distinct temporarily-unavailable state on load failure", async () => {
  const { TeamLoadError } = await import("./team");
  const html = renderToString(<TeamLoadError />);

  expect(html).toContain("暫時未能載入");
  expect(html).not.toContain("尚未有公開資料");
  expect(html).toContain('role="alert"');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test src/routes/about/team.test.tsx`
Expected: FAIL — `TeamPage`/`TeamLoadError` are not exported with the new signature yet.

- [ ] **Step 4: Replace the route implementation**

Read the current `src/routes/about/team.tsx` in full first (it has a `head()` with title/description/canonical that must be preserved unchanged, and a `chapters`/`cta` structure on `PublicPageFrame` that must also be preserved unchanged — only the board section at the bottom changes). Replace the file with:

```tsx
// src/routes/about/team.tsx
import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicPageFrame } from "../../components/site/PublicPageFrame";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { resilientPublicLoader } from "../../lib/routing/resilientLoader";
import { getPublicBoardRoster } from "../../lib/governance/publicPage.functions";
import type { PublicBoardRoster } from "../../lib/governance/publicPage.server";
import { brand } from "../../lib/brand/brand";

export const Route = createFileRoute("/about/team")({
  loader: resilientPublicLoader(() => getPublicBoardRoster()),
  errorComponent: TeamLoadError,
  head: () => ({
    meta: [
      { title: "團隊與管治 · 香港拯救貓狗協會 HKSCDA" },
      { name: "description", content: "香港拯救貓狗協會的管治架構、義工團隊，以及聯絡團隊的方法。" },
    ],
    links: [{ rel: "canonical", href: publicUrl("/about/team") }],
  }),
  component: TeamRoute,
});

function TeamRoute() {
  const result = Route.useLoaderData();
  if (result.status === "error") return <TeamLoadError />;
  return <TeamPage roster={result.data} />;
}

function formatLastUpdated(value: string) {
  return new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Hong_Kong",
  }).format(new Date(value));
}

export function TeamPage({ roster }: { roster: PublicBoardRoster }) {
  return (
    <PublicPageFrame
      eyebrow="關於協會"
      title="團隊與管治"
      description="協會由董事會監督，日常救援、照護與領養工作由職員及義工團隊執行。"
      chapters={[
        {
          eyebrow: "義工團隊",
          title: "日常救援與照護由義工支撐",
          description: "協會有一群熱心義工，定期參與餵飼、清潔貓舍狗舍、協助領養配對及活動籌辦等工作。",
          bullets: ["餵飼與日常照護", "貓舍狗舍清潔", "領養配對協助", "活動籌辦與社區教育"],
        },
      ]}
      cta={{
        eyebrow: "加入我們",
        title: "義工團隊長期歡迎新成員。",
        description: "如有興趣參與，可先了解目前的義工崗位與安排。",
        action: { label: "了解義工工作", to: "/volunteer" },
      }}
    >
      <section className="section">
        <div className="public-container">
          {roster.members.length > 0 ? (
            <>
              <ul className="divide-y divide-[var(--color-border)]">
                {roster.members.map((member) => (
                  <li key={`${member.name}-${member.roleTitle}`} className="flex items-center justify-between py-3">
                    <span className="font-bold text-[var(--color-text)]">{member.name}</span>
                    <span className="text-[var(--color-text-muted)]">{member.roleTitle}</span>
                  </li>
                ))}
              </ul>
              {roster.lastUpdated ? (
                <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                  資料最後更新 {formatLastUpdated(roster.lastUpdated)}
                </p>
              ) : null}
            </>
          ) : (
            <PublicStateShell
              headingLevel={2}
              title="尚未有公開資料"
              description={`管治名單會連同生效日期一併公開，核實前不會在此刊載。如需查詢協會管治安排，可電郵 ${brand.org.email}。`}
            />
          )}
        </div>
      </section>
    </PublicPageFrame>
  );
}

export function TeamLoadError() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div role="alert" className="border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6">
        <h1 className="text-lg font-bold">暫時未能載入團隊與管治資料</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          請稍後再試，或電郵至{" "}
          <a className="underline" href="mailto:info@hkscda.com">
            info@hkscda.com
          </a>
          。
        </p>
        <a href="/about/team" className="btn-secondary mt-5 min-h-11">
          重新載入 / Retry
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/routes/about/team.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Check `publicTruth.test.ts` for stale assertions, same as BP-1's Task 5 lesson**

Read `src/routes/publicTruth.test.ts` in full. It contains a test named `"the team page does not assert board members from page source"` (asserting the source doesn't contain the two old hardcoded names, and `toContain("暫未發佈")`). The two `not.toContain` name checks are still valid and will still pass (the new file never hardcodes those names). The `toContain("暫未發佈")` assertion is now stale — the real page's copy uses `"尚未有公開資料"` for the genuinely-empty state instead. If this test fails after your change, update ONLY that one assertion to `expect(source).toContain("尚未有公開資料");`, keeping the two `not.toContain` name assertions and the `"contact details on these pages come from the brand constants"` test untouched. This is a legitimate correction (same principle as BP-1: the old placeholder text is retired, the underlying governance-verification intent is preserved), not a weakening.

Run: `bun test src/routes/publicTruth.test.ts` — fix if needed, following the instruction above, then re-run to confirm all 4 tests in that file pass.

- [ ] **Step 7: Run the full test suite**

Run: `bun test --isolate`
Expected: PASS, no regressions.

- [ ] **Step 8: Typecheck and lint**

```bash
bunx tsc --noEmit
bunx eslint src/lib/governance/publicPage.server.ts src/lib/governance/publicPage.functions.ts src/routes/about/team.tsx src/routes/about/team.test.tsx
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/governance/publicPage.server.ts src/lib/governance/publicPage.functions.ts src/routes/about/team.tsx src/routes/about/team.test.tsx src/routes/publicTruth.test.ts
git commit -m "feat: publish the real board roster on /about/team"
```

(Only include `src/routes/publicTruth.test.ts` in the `git add` if Step 6 actually required a change to it.)

---

### Task 8: Group gate — migration application, full verification, parity doc, manual check

**Files:**
- Modify: `docs/public-route-parity.md`

- [ ] **Step 1: Get explicit confirmation, then apply the migration**

Before running anything against the live database, stop and confirm with the user: "Ready to apply `supabase/migrations/20260829120000_governance_board_members.sql` to the live Supabase project (ref `iihqjzilgawhfdhdevam`). This creates the `board_member` table — no existing data is touched. Proceed?" Only after explicit confirmation, run the project's actual migration-apply command (check `package.json` / `supabase/config.toml` for the exact command this project uses, e.g. `supabase db push` or a project-specific script — do not guess a command that might not exist in this repo).

- [ ] **Step 2: Update the parity table's `/about/team` row**

The current row reads:

```
| `/about/team` | WP-6 | yes | static | yes | yes |
```

Change the "Data" column from `static` to `loader`:

```
| `/about/team` | WP-6 | yes | loader | yes | yes |
```

- [ ] **Step 3: Update the Known gaps section**

Remove this bullet (BP-3 is now done):

```
- `/about/team` shows an unpublished state rather than a board list. BP-3 owns the
  governance records.
```

- [ ] **Step 4: Run the full verification gate**

```bash
bunx tsc --noEmit
bun test --isolate
bun run lint
bun run build
```

Fix nothing yourself beyond a scoped, single-file `bunx prettier --write <file>` for a pure formatting issue. Anything else that fails: STOP and report.

- [ ] **Step 5: Manual browser check against the live database**

Copy `.env.local` from the main repo checkout into this worktree if it isn't already there, start the dev server, and verify in a real browser (or via HTTP fetch of the rendered HTML, same approach as BP-1's Task 6):

- `/about/team` shows the genuinely-empty state ("尚未有公開資料") right after the migration is applied, since `board_member` starts with zero rows — this is the correct, honest initial state, not a bug.
- Using the new admin UI at `/admin/governance` (log in as an `admin`-role account), add one test board member, confirm it appears on `/about/team` with the correct name/role/sort order and a real "資料最後更新" date.
- Confirm a `staff`-role account (not `admin`) is denied access to `/admin/governance` (should redirect/deny per `requireAdminPageAccess`), proving the admin-only gate actually works — not just that the code compiles.
- Deactivate the test member through the admin UI and confirm `/about/team` returns to the genuinely-empty state (not the error state).
- Check the `audit_log` table (via Supabase dashboard or a query) to confirm the create/deactivate actions each wrote a row with the correct actor/action/entity_id.
- No console errors on either page.

Report the actual observed results, including whatever the live board list looks like at the end of this check (leave the test member deactivated, not deleted, when done, so the audit trail stays intact and the public page ends in its honest empty state).

- [ ] **Step 6: Commit**

```bash
git add docs/public-route-parity.md
git commit -m "docs: mark /about/team's real governance loader in the parity record"
```
