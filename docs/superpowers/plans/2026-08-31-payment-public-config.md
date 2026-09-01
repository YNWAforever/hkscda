# Payment Public Config (BP-2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/donate`'s hardcoded payment-method list with a database-backed `payment_public_config` table, editable only through a two-different-person (treasurer/admin) approval workflow, with zero visible change on ship day.

**Architecture:** A new `src/lib/paymentPublicConfig/` domain (types → schemas → repository → service → http, mirroring `src/lib/adoptionGuideReleases/`'s proven draft→in_review→published→archived shape) backs both an admin CRUD API under `/api/admin/payment-methods/**` and a public read path (`src/lib/paymentPublicConfig/public.functions.ts`) that `/donate`'s loader reads instead of its hardcoded array. A migration seeds the five currently-live methods as already-published rows so nothing visible changes when this ships.

**Tech Stack:** TanStack Start (SSR React 19 + TanStack Router), Supabase Postgres (RLS + `security invoker` RPCs), Zod, Bun test runner, shadcn/ui.

---

## Reference: source spec

Full rationale in `docs/superpowers/specs/2026-08-31-payment-public-config-design.md`. Read it if anything below is unclear.

**Two deliberate refinements from the spec, made while writing this plan, noted here for transparency:**

1. **Nullable actor columns.** The spec's data model table lists `created_by`/`updated_by` following `adoption_guide_releases`'s `not null` pattern. Task 1's actual migration makes `created_by`, `updated_by`, `submitted_by`, `published_by`, `archived_by` all **nullable** (`references admin_user(id) on delete set null`), matching the more recent `faq_entry` migration's pattern instead. Reason: the seed step (Task 1, Step 4) inserts five already-`published` rows directly via SQL with no real actor in context — `adoption_guide_releases`'s `not null` columns would make that seed impossible without inventing a fake admin user. The RPC always supplies a real `actor.id` for every app-driven mutation, so this is strictly an accommodation for the one-time seed, not a loosening of normal accountability.
2. **No `details` UI in this phase.** Checked `/donate` directly: none of the five current methods render any account number, phone, or handle today — the whole `details jsonb` field's real-world content for every seeded row is `{}`. The public read path returns `details` (for future use), but `/donate`'s method buttons render only `method`/`displayLabelZh`/`displayLabelEn`/`sortOrder` in this phase. Deciding how to surface `details` content is a follow-up once an admin actually has something to put there.
3. **Admin UI split into a presentational `*View` plus an untested data-fetching container** (Task 10). Checked how this repo's existing `AdoptionGuideReleaseManagement.tsx` is actually tested — it never mocks `fetch` or Supabase auth; only a pure `AdoptionGuideReleaseManagementView` (data via props) is unit-tested via `renderToStaticMarkup`. This matters here specifically because `fetchAdminJson` (used by both the identity query and every payment-method mutation) calls `getAdminAccessToken()`, which calls the real `supabase.auth.getSession()` — there's no session in a `bun:test` environment, so a component wired directly to `useQuery`/`fetchAdminJson` cannot be tested by mocking `globalThis.fetch` alone. Task 10 follows the same container/view split for this reason, not by choice of style.

---

### Task 1: Migration — table, RLS, RPCs, seed

**Files:**
- Create: `supabase/migrations/20260831120000_payment_public_config.sql`

- [ ] **Step 1: Write the migration**

```sql
create table if not exists public.payment_public_config (
  id uuid primary key default gen_random_uuid(),
  method text not null check (method in ('stripe', 'payme', 'fps', 'paypal', 'alipayhk')),
  is_publicly_visible boolean not null default false,
  display_label_zh text not null check (char_length(display_label_zh) between 1 and 80),
  display_label_en text not null check (char_length(display_label_en) between 1 and 80),
  sort_order integer not null default 0 check (sort_order >= 0),
  details jsonb not null default '{}'::jsonb,
  state text not null default 'draft'
    check (state in ('draft', 'in_review', 'published', 'archived')),
  version integer not null default 1 check (version > 0),
  created_by uuid references public.admin_user(id) on delete set null,
  updated_by uuid references public.admin_user(id) on delete set null,
  submitted_by uuid references public.admin_user(id) on delete set null,
  submitted_at timestamptz,
  published_by uuid references public.admin_user(id) on delete set null,
  published_at timestamptz,
  archived_by uuid references public.admin_user(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_public_config_one_published_idx
  on public.payment_public_config (method)
  where state = 'published';

create index if not exists payment_public_config_admin_list_idx
  on public.payment_public_config (updated_at desc, id);

create table if not exists public.payment_public_config_publish_requests (
  idempotency_key text primary key check (char_length(idempotency_key) between 16 and 200),
  config_id uuid not null references public.payment_public_config(id) on delete restrict,
  config_version integer not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.payment_public_config enable row level security;
alter table public.payment_public_config_publish_requests enable row level security;

grant select, insert, update, delete on public.payment_public_config to service_role;
grant select, insert, update, delete on public.payment_public_config_publish_requests to service_role;
revoke all on public.payment_public_config from anon, authenticated;
revoke all on public.payment_public_config_publish_requests from anon, authenticated;

drop policy if exists "staff can read payment public config" on public.payment_public_config;
create policy "staff can read payment public config"
  on public.payment_public_config for select
  to authenticated
  using (private.has_admin_role(array['staff', 'treasurer', 'admin']));

drop policy if exists "staff can create draft payment public config" on public.payment_public_config;
create policy "staff can create draft payment public config"
  on public.payment_public_config for insert
  to authenticated
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'treasurer', 'admin'])
    and exists (
      select 1
      from public.admin_user actor
      where actor.id = created_by
        and actor.id = updated_by
        and actor.auth_user_id = auth.uid()
        and actor.status = 'active'
        and actor.role in ('staff', 'treasurer', 'admin')
    )
  );

drop policy if exists "staff can update draft payment public config" on public.payment_public_config;
create policy "staff can update draft payment public config"
  on public.payment_public_config for update
  to authenticated
  using (state = 'draft' and private.has_admin_role(array['staff', 'treasurer', 'admin']))
  with check (
    state = 'draft'
    and private.has_admin_role(array['staff', 'treasurer', 'admin'])
    and exists (
      select 1
      from public.admin_user actor
      where actor.id = updated_by
        and actor.auth_user_id = auth.uid()
        and actor.status = 'active'
        and actor.role in ('staff', 'treasurer', 'admin')
    )
  );

drop policy if exists "staff can delete draft payment public config" on public.payment_public_config;
create policy "staff can delete draft payment public config"
  on public.payment_public_config for delete
  to authenticated
  using (state = 'draft' and private.has_admin_role(array['staff', 'treasurer', 'admin']));

drop trigger if exists set_updated_at on public.payment_public_config;
create trigger set_updated_at
before update on public.payment_public_config
for each row execute function public.set_updated_at();

create or replace function public.mutate_payment_public_config_with_audit(
  p_actor_user_id uuid,
  p_operation text,
  p_config_id uuid default null,
  p_expected_version integer default null,
  p_values jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  current_config public.payment_public_config%rowtype;
  result_config public.payment_public_config%rowtype;
  result jsonb;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('staff', 'treasurer', 'admin');

  if not found then
    raise exception 'Active staff, treasurer, or admin actor required' using errcode = '42501';
  end if;

  if p_operation = 'create' then
    insert into public.payment_public_config (
      method,
      is_publicly_visible,
      display_label_zh,
      display_label_en,
      sort_order,
      details,
      created_by,
      updated_by
    ) values (
      p_values->>'method',
      coalesce((p_values->>'is_publicly_visible')::boolean, false),
      p_values->>'display_label_zh',
      p_values->>'display_label_en',
      coalesce((p_values->>'sort_order')::integer, 0),
      coalesce(p_values->'details', '{}'::jsonb),
      actor.id,
      actor.id
    )
    returning * into result_config;
  else
    if p_config_id is null or p_expected_version is null then
      raise exception 'Config id and expected version are required' using errcode = '22023';
    end if;

    select * into current_config
    from public.payment_public_config
    where id = p_config_id
    for update;

    if not found then
      raise exception 'Payment public config not found' using errcode = 'P0002';
    end if;
    if current_config.version <> p_expected_version then
      raise exception 'Stale payment public config version' using errcode = '40001';
    end if;

    if p_operation = 'update' then
      if current_config.state <> 'draft' then
        raise exception 'Only draft payment public config rows can be edited' using errcode = '23514';
      end if;

      update public.payment_public_config set
        method = case when p_values ? 'method' then p_values->>'method' else method end,
        is_publicly_visible = case
          when p_values ? 'is_publicly_visible' then (p_values->>'is_publicly_visible')::boolean
          else is_publicly_visible
        end,
        display_label_zh = case
          when p_values ? 'display_label_zh' then p_values->>'display_label_zh'
          else display_label_zh
        end,
        display_label_en = case
          when p_values ? 'display_label_en' then p_values->>'display_label_en'
          else display_label_en
        end,
        sort_order = case when p_values ? 'sort_order' then (p_values->>'sort_order')::integer else sort_order end,
        details = case when p_values ? 'details' then p_values->'details' else details end,
        updated_by = actor.id,
        version = version + 1
      where id = p_config_id
      returning * into result_config;
    elsif p_operation = 'submit' then
      if current_config.state <> 'draft' then
        raise exception 'Only draft payment public config rows can be submitted' using errcode = '23514';
      end if;
      if nullif(btrim(current_config.display_label_zh), '') is null
        or nullif(btrim(current_config.display_label_en), '') is null
      then
        raise exception 'Payment public config labels are incomplete' using errcode = '23514';
      end if;

      update public.payment_public_config set
        state = 'in_review',
        submitted_by = actor.id,
        submitted_at = now(),
        updated_by = actor.id,
        version = version + 1
      where id = p_config_id
      returning * into result_config;
    elsif p_operation = 'withdraw' then
      if current_config.state <> 'in_review' then
        raise exception 'Only in-review payment public config rows can be withdrawn' using errcode = '23514';
      end if;
      if actor.role not in ('treasurer', 'admin')
        and current_config.submitted_by is distinct from actor.id
      then
        raise exception 'Staff can only withdraw config rows they submitted' using errcode = '42501';
      end if;

      update public.payment_public_config set
        state = 'draft',
        submitted_by = null,
        submitted_at = null,
        updated_by = actor.id,
        version = version + 1
      where id = p_config_id
      returning * into result_config;
    elsif p_operation = 'return_to_draft' then
      if actor.role not in ('treasurer', 'admin') then
        raise exception 'Treasurer or admin actor required to return a config row' using errcode = '42501';
      end if;
      if current_config.state <> 'in_review' then
        raise exception 'Only in-review payment public config rows can be returned' using errcode = '23514';
      end if;

      update public.payment_public_config set
        state = 'draft',
        submitted_by = null,
        submitted_at = null,
        updated_by = actor.id,
        version = version + 1
      where id = p_config_id
      returning * into result_config;
    elsif p_operation = 'delete' then
      if current_config.state <> 'draft' then
        raise exception 'Only draft payment public config rows can be deleted' using errcode = '23514';
      end if;

      delete from public.payment_public_config
      where id = p_config_id;
      result := jsonb_build_object(
        'id', current_config.id,
        'version', current_config.version,
        'deleted', true
      );
    else
      raise exception 'Unsupported payment public config operation' using errcode = '22023';
    end if;
  end if;

  if result is null then
    result := to_jsonb(result_config);
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'payment_public_config.' || p_operation,
    'payment_public_config',
    coalesce(result_config.id, current_config.id)::text,
    jsonb_build_object(
      'expected_version', p_expected_version,
      'result_version', coalesce(result_config.version, current_config.version),
      'values', coalesce(p_values, '{}'::jsonb)
    )
  );

  return result;
end;
$$;

create or replace function public.publish_payment_public_config(
  p_config_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor public.admin_user%rowtype;
  config_to_publish public.payment_public_config%rowtype;
  previous_config public.payment_public_config%rowtype;
  cached_request public.payment_public_config_publish_requests%rowtype;
  result jsonb;
begin
  select * into actor
  from public.admin_user
  where auth_user_id = p_actor_user_id
    and status = 'active'
    and role in ('treasurer', 'admin');

  if not found then
    raise exception 'Treasurer or admin approval is required' using errcode = '42501';
  end if;

  if p_idempotency_key is null
    or char_length(p_idempotency_key) not between 16 and 200
  then
    raise exception 'Invalid publish idempotency key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select * into cached_request
  from public.payment_public_config_publish_requests
  where idempotency_key = p_idempotency_key
  for update;

  if found then
    if cached_request.config_id <> p_config_id
      or cached_request.config_version <> p_expected_version
    then
      raise exception 'Publish idempotency key was already used for another config version'
        using errcode = '23505';
    end if;
    return cached_request.result;
  end if;

  select * into config_to_publish
  from public.payment_public_config
  where id = p_config_id
  for update;

  if not found then
    raise exception 'Payment public config not found' using errcode = 'P0002';
  end if;
  if config_to_publish.version <> p_expected_version then
    raise exception 'Stale payment public config version' using errcode = '40001';
  end if;
  if config_to_publish.state <> 'in_review' then
    raise exception 'Only in-review payment public config rows can be published' using errcode = '23514';
  end if;
  if nullif(btrim(config_to_publish.display_label_zh), '') is null
    or nullif(btrim(config_to_publish.display_label_en), '') is null
  then
    raise exception 'Payment public config labels are incomplete' using errcode = '23514';
  end if;
  if config_to_publish.submitted_by is not null
    and config_to_publish.submitted_by = actor.id
  then
    raise exception 'A different admin must publish this change' using errcode = '42501';
  end if;

  select * into previous_config
  from public.payment_public_config
  where method = config_to_publish.method
    and state = 'published'
    and id <> config_to_publish.id
  for update;

  if previous_config.id is not null then
    update public.payment_public_config set
      state = 'archived',
      archived_by = actor.id,
      archived_at = now(),
      updated_by = actor.id,
      version = version + 1
    where id = previous_config.id;

    insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
    values (
      p_actor_user_id,
      'payment_public_config.archive',
      'payment_public_config',
      previous_config.id::text,
      jsonb_build_object('replaced_by_config_id', config_to_publish.id)
    );
  end if;

  update public.payment_public_config set
    state = 'published',
    published_by = actor.id,
    published_at = now(),
    archived_by = null,
    archived_at = null,
    updated_by = actor.id,
    version = version + 1
  where id = config_to_publish.id
  returning * into config_to_publish;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    'payment_public_config.publish',
    'payment_public_config',
    config_to_publish.id::text,
    jsonb_build_object(
      'previous_config_id', previous_config.id,
      'method', config_to_publish.method,
      'version', config_to_publish.version
    )
  );

  result := jsonb_build_object(
    'config_id', config_to_publish.id,
    'config_version', config_to_publish.version,
    'method', config_to_publish.method
  );

  insert into public.payment_public_config_publish_requests (
    idempotency_key,
    config_id,
    config_version,
    result
  ) values (
    p_idempotency_key,
    config_to_publish.id,
    p_expected_version,
    result
  );

  return result;
end;
$$;

revoke all on function public.mutate_payment_public_config_with_audit(uuid, text, uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.publish_payment_public_config(uuid, integer, uuid, text)
  from public, anon, authenticated;

grant execute on function public.mutate_payment_public_config_with_audit(uuid, text, uuid, integer, jsonb)
  to service_role;
grant execute on function public.publish_payment_public_config(uuid, integer, uuid, text)
  to service_role;

insert into public.payment_public_config (
  method, is_publicly_visible, display_label_zh, display_label_en, sort_order, details, state, published_at
) values
  ('stripe', true, '信用卡', 'Card', 0, '{}'::jsonb, 'published', now()),
  ('alipayhk', true, 'AlipayHK', 'AlipayHK', 1, '{}'::jsonb, 'published', now()),
  ('fps', true, '轉數快 FPS', 'FPS', 2, '{}'::jsonb, 'published', now()),
  ('payme', true, 'PayMe', 'PayMe', 3, '{}'::jsonb, 'published', now()),
  ('paypal', true, 'PayPal', 'PayPal', 4, '{}'::jsonb, 'published', now());
```

- [ ] **Step 2: Verify against a real Postgres container (not a committed test — this repo's established manual verification standard for new migrations)**

Run (adjust the container name/port if one is already running):

```bash
docker run --rm -d --name payment-public-config-verify -e POSTGRES_PASSWORD=postgres -p 55433:5432 postgres:16-alpine
```

Wait for it to be ready, then apply every migration in order up through the new one:

```bash
for f in supabase/migrations/*.sql; do
  MSYS_NO_PATHCONV=1 docker exec -i payment-public-config-verify psql -U postgres -v ON_ERROR_STOP=1 < "$f" || break
done
```

Then verify the specific behaviors this migration must guarantee, via `psql`:
1. Insert a `staff`-role `admin_user` row, call `mutate_payment_public_config_with_audit` as that actor with `p_operation = 'create'` for a new method — succeeds, row is `draft`.
2. Submit it (`p_operation = 'submit'`) — succeeds, state becomes `in_review`.
3. Call `publish_payment_public_config` as **the same staff actor who submitted it** — must fail with `errcode 42501` (wrong role: staff cannot publish at all).
4. Insert a `treasurer`-role actor who is a **different person** from the submitter, call `publish_payment_public_config` as them — succeeds, row becomes `published`.
5. Insert a second `treasurer` actor, create+submit a second draft for the **same method**, then have the **first** treasurer (who did NOT submit this one) publish it — succeeds, and confirm via `select` that the row from step 4 is now `archived`.
6. Confirm `select count(*) from audit_log where entity = 'payment_public_config'` shows one row per mutation above, plus one `payment_public_config.archive` row from step 5.
7. Confirm the seed data: `select method, state, is_publicly_visible, sort_order from payment_public_config where state = 'published' order by sort_order` returns exactly the five rows in the exact order/labels listed in Step 1.

Stop the container when done: `docker stop payment-public-config-verify`.

- [ ] **Step 3: Run the repo's static migration check**

Run: `bun test src/lib/supabaseMigrations.test.ts` — expect PASS (this test globs every migration file and enforces `search_path` pinning; no changes needed on your part if Step 1's functions include `set search_path = public, pg_temp` as written above).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260831120000_payment_public_config.sql
git commit -m "feat: add payment_public_config table with treasurer-gated four-eyes approval"
```

---

### Task 2: Domain types and Zod schemas

**Files:**
- Create: `src/lib/paymentPublicConfig/types.ts`
- Create: `src/lib/paymentPublicConfig/schemas.ts`
- Create: `src/lib/paymentPublicConfig/schemas.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
export type PaymentPublicConfigMethod = "stripe" | "payme" | "fps" | "paypal" | "alipayhk";
export type PaymentPublicConfigState = "draft" | "in_review" | "published" | "archived";

export type PaymentPublicConfig = {
  id: string;
  method: PaymentPublicConfigMethod;
  isPubliclyVisible: boolean;
  displayLabelZh: string;
  displayLabelEn: string;
  sortOrder: number;
  details: Record<string, string>;
  state: PaymentPublicConfigState;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  archivedBy: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicPaymentMethod = {
  method: PaymentPublicConfigMethod;
  displayLabelZh: string;
  displayLabelEn: string;
  details: Record<string, string>;
};
```

- [ ] **Step 2: Write `schemas.ts`**

```ts
import { z } from "zod";

export const paymentPublicConfigIdSchema = z.string().uuid();
export const paymentPublicConfigVersionSchema = z.coerce.number().int().positive();
export const paymentPublicConfigMethodSchema = z.enum([
  "stripe",
  "payme",
  "fps",
  "paypal",
  "alipayhk",
]);
export const paymentPublicConfigStateSchema = z.enum([
  "draft",
  "in_review",
  "published",
  "archived",
]);
export const paymentPublicConfigDetailsSchema = z.record(z.string(), z.string()).default({});

export const paymentPublicConfigDraftInputSchema = z.object({
  method: paymentPublicConfigMethodSchema,
  isPubliclyVisible: z.boolean().default(false),
  displayLabelZh: z.string().trim().min(1).max(80),
  displayLabelEn: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).default(0),
  details: paymentPublicConfigDetailsSchema,
});

export const paymentPublicConfigMutationSchema = paymentPublicConfigDraftInputSchema.extend({
  expectedVersion: paymentPublicConfigVersionSchema,
});

export const paymentPublicConfigTransitionSchema = z.object({
  expectedVersion: paymentPublicConfigVersionSchema,
});

export const paymentPublicConfigPublishSchema = paymentPublicConfigTransitionSchema.extend({
  idempotencyKey: z.string().trim().min(16).max(200),
});
```

- [ ] **Step 3: Write `schemas.test.ts`**

```ts
import { describe, expect, test } from "bun:test";

import {
  paymentPublicConfigDraftInputSchema,
  paymentPublicConfigMutationSchema,
  paymentPublicConfigPublishSchema,
} from "./schemas";

describe("paymentPublicConfigDraftInputSchema", () => {
  test("accepts a complete valid draft", () => {
    const result = paymentPublicConfigDraftInputSchema.parse({
      method: "fps",
      isPubliclyVisible: true,
      displayLabelZh: "轉數快 FPS",
      displayLabelEn: "FPS",
      sortOrder: 2,
      details: { note: "測試" },
    });
    expect(result.method).toBe("fps");
    expect(result.details).toEqual({ note: "測試" });
  });

  test("defaults isPubliclyVisible to false and details to an empty object", () => {
    const result = paymentPublicConfigDraftInputSchema.parse({
      method: "stripe",
      displayLabelZh: "信用卡",
      displayLabelEn: "Card",
    });
    expect(result.isPubliclyVisible).toBe(false);
    expect(result.details).toEqual({});
    expect(result.sortOrder).toBe(0);
  });

  test("rejects an unknown method", () => {
    expect(() =>
      paymentPublicConfigDraftInputSchema.parse({
        method: "bank_transfer",
        displayLabelZh: "銀行轉帳",
        displayLabelEn: "Bank transfer",
      }),
    ).toThrow();
  });

  test("rejects an empty display label", () => {
    expect(() =>
      paymentPublicConfigDraftInputSchema.parse({
        method: "stripe",
        displayLabelZh: "",
        displayLabelEn: "Card",
      }),
    ).toThrow();
  });
});

describe("paymentPublicConfigMutationSchema", () => {
  test("requires expectedVersion in addition to the draft fields", () => {
    expect(() =>
      paymentPublicConfigMutationSchema.parse({
        method: "stripe",
        displayLabelZh: "信用卡",
        displayLabelEn: "Card",
      }),
    ).toThrow();

    const result = paymentPublicConfigMutationSchema.parse({
      method: "stripe",
      displayLabelZh: "信用卡",
      displayLabelEn: "Card",
      expectedVersion: 3,
    });
    expect(result.expectedVersion).toBe(3);
  });
});

describe("paymentPublicConfigPublishSchema", () => {
  test("rejects an idempotency key shorter than 16 characters", () => {
    expect(() =>
      paymentPublicConfigPublishSchema.parse({ expectedVersion: 1, idempotencyKey: "short" }),
    ).toThrow();
  });

  test("accepts a valid publish payload", () => {
    const result = paymentPublicConfigPublishSchema.parse({
      expectedVersion: 1,
      idempotencyKey: "a".repeat(32),
    });
    expect(result.expectedVersion).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests, typecheck**

Run: `bun test src/lib/paymentPublicConfig/schemas.test.ts` — expect PASS, 7 tests.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paymentPublicConfig/types.ts src/lib/paymentPublicConfig/schemas.ts src/lib/paymentPublicConfig/schemas.test.ts
git commit -m "feat: add payment public config types and schemas"
```

---

### Task 3: Repository layer

**Files:**
- Create: `src/lib/paymentPublicConfig/repository.server.ts`
- Create: `src/lib/paymentPublicConfig/repository.server.test.ts`

- [ ] **Step 1: Write `repository.server.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  paymentPublicConfigDraftInputSchema,
  paymentPublicConfigIdSchema,
  paymentPublicConfigMethodSchema,
  paymentPublicConfigMutationSchema,
  paymentPublicConfigStateSchema,
  paymentPublicConfigVersionSchema,
} from "./schemas";
import type {
  PaymentPublicConfig,
  PaymentPublicConfigMethod,
  PaymentPublicConfigState,
} from "./types";

const CONFIG_COLUMNS =
  "id,method,is_publicly_visible,display_label_zh,display_label_en,sort_order,details,state,version,created_by,updated_by,submitted_by,submitted_at,published_by,published_at,archived_by,archived_at,created_at,updated_at";

export type PaymentPublicConfigDraftInput = z.infer<typeof paymentPublicConfigDraftInputSchema>;
export type PaymentPublicConfigMutationInput = z.infer<typeof paymentPublicConfigMutationSchema>;

export type PaymentPublicConfigAdminQuery = {
  page: number;
  pageSize: number;
  method?: PaymentPublicConfigMethod;
  state?: PaymentPublicConfigState;
};

export type PaginatedPaymentPublicConfig = {
  items: PaymentPublicConfig[];
  total: number;
  page: number;
  pageSize: number;
};

export type PaymentPublicConfigPublishResult = {
  configId: string;
  configVersion: number;
  method: PaymentPublicConfigMethod;
};

export type PaymentPublicConfigErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "internal";

const defaultErrorMessages: Record<PaymentPublicConfigErrorCode, string> = {
  unauthorized: "Authentication is required.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "Payment method configuration not found.",
  conflict: "This configuration changed or cannot make that transition.",
  invalid: "The configuration is not ready for this action.",
  internal: "The payment configuration request could not be completed.",
};

export class PaymentPublicConfigError extends Error {
  name = "PaymentPublicConfigError";

  constructor(
    public readonly code: PaymentPublicConfigErrorCode,
    public readonly status: number,
    message = defaultErrorMessages[code],
  ) {
    super(message);
  }
}

export type PaymentPublicConfigRepository = {
  list(query: PaymentPublicConfigAdminQuery): Promise<PaginatedPaymentPublicConfig>;
  getById(id: string): Promise<PaymentPublicConfig | null>;
  create(input: PaymentPublicConfigDraftInput, actorUserId: string): Promise<PaymentPublicConfig>;
  update(
    id: string,
    input: PaymentPublicConfigMutationInput,
    actorUserId: string,
  ): Promise<PaymentPublicConfig>;
  transition(input: {
    id: string;
    expectedVersion: number;
    operation: "submit" | "withdraw" | "return_to_draft";
    actorUserId: string;
  }): Promise<PaymentPublicConfig>;
  publish(input: {
    id: string;
    expectedVersion: number;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<PaymentPublicConfigPublishResult>;
};

type ProviderError = {
  code?: unknown;
  message?: unknown;
};

const nullableUuid = z.string().uuid().nullable();
const nullableTimestamp = z.string().datetime({ offset: true }).nullable();
const configRowSchema = z.object({
  id: paymentPublicConfigIdSchema,
  method: paymentPublicConfigMethodSchema,
  is_publicly_visible: z.boolean(),
  display_label_zh: z.string(),
  display_label_en: z.string(),
  sort_order: z.number().int().nonnegative(),
  details: z.record(z.string(), z.string()),
  state: paymentPublicConfigStateSchema,
  version: paymentPublicConfigVersionSchema,
  created_by: nullableUuid,
  updated_by: nullableUuid,
  submitted_by: nullableUuid,
  submitted_at: nullableTimestamp,
  published_by: nullableUuid,
  published_at: nullableTimestamp,
  archived_by: nullableUuid,
  archived_at: nullableTimestamp,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});
const publishResultSchema = z.object({
  config_id: paymentPublicConfigIdSchema,
  config_version: paymentPublicConfigVersionSchema,
  method: paymentPublicConfigMethodSchema,
});

function providerError(error: unknown): ProviderError {
  return error && typeof error === "object" ? (error as ProviderError) : {};
}

function throwRepositoryError(error: unknown): never {
  const source = providerError(error);
  const code = String(source.code ?? "");
  const message = String(source.message ?? "");
  const normalized = message.toLowerCase();
  const illegalTransition =
    normalized.includes("only draft payment public config rows can be") ||
    normalized.includes("only in-review payment public config rows can be");

  if (
    code === "23505" ||
    code === "40001" ||
    normalized.includes("stale payment public config version") ||
    normalized.includes("idempotency key was already used") ||
    illegalTransition
  ) {
    throw new PaymentPublicConfigError("conflict", 409);
  }
  if (code === "PGRST116" || code === "P0002" || normalized.includes("config not found")) {
    throw new PaymentPublicConfigError("not_found", 404);
  }
  if (code === "42501") {
    throw new PaymentPublicConfigError("forbidden", 403);
  }
  if (
    code === "23514" ||
    code === "22023" ||
    normalized.includes("labels are incomplete")
  ) {
    throw new PaymentPublicConfigError("invalid", 422);
  }
  throw new PaymentPublicConfigError("internal", 500);
}

function mapConfig(value: unknown): PaymentPublicConfig | null {
  const result = configRowSchema.safeParse(value);
  if (!result.success) return null;
  const row = result.data;
  return {
    id: row.id,
    method: row.method,
    isPubliclyVisible: row.is_publicly_visible,
    displayLabelZh: row.display_label_zh,
    displayLabelEn: row.display_label_en,
    sortOrder: row.sort_order,
    details: row.details,
    state: row.state,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    publishedBy: row.published_by,
    publishedAt: row.published_at,
    archivedBy: row.archived_by,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireConfig(value: unknown) {
  const config = mapConfig(value);
  if (!config) throw new PaymentPublicConfigError("internal", 500);
  return config;
}

function configValues(input: PaymentPublicConfigDraftInput | PaymentPublicConfigMutationInput) {
  return {
    method: input.method,
    is_publicly_visible: input.isPubliclyVisible,
    display_label_zh: input.displayLabelZh,
    display_label_en: input.displayLabelEn,
    sort_order: input.sortOrder,
    details: input.details,
  };
}

export function createSupabasePaymentPublicConfigRepository(
  client: SupabaseClient,
): PaymentPublicConfigRepository {
  async function runMutation(input: {
    operation: "create" | "update" | "submit" | "withdraw" | "return_to_draft";
    id: string | null;
    expectedVersion: number | null;
    values: Record<string, unknown>;
    actorUserId: string;
  }) {
    const { data, error } = await client.rpc("mutate_payment_public_config_with_audit", {
      p_actor_user_id: input.actorUserId,
      p_operation: input.operation,
      p_config_id: input.id,
      p_expected_version: input.expectedVersion,
      p_values: input.values,
    });
    if (error) throwRepositoryError(error);
    return requireConfig(data);
  }

  return {
    async list(query) {
      const page = Math.max(1, Math.trunc(query.page));
      const pageSize = Math.min(50, Math.max(1, Math.trunc(query.pageSize)));
      const from = (page - 1) * pageSize;
      let request = client
        .from("payment_public_config")
        .select(CONFIG_COLUMNS, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);

      if (query.method) request = request.eq("method", query.method);
      if (query.state) request = request.eq("state", query.state);

      const { data, error, count } = await request;
      if (error) throwRepositoryError(error);
      return {
        items: ((data ?? []) as unknown[]).map(mapConfig).filter((item) => item !== null),
        total: count ?? 0,
        page,
        pageSize,
      };
    },

    async getById(id) {
      const { data, error } = await client
        .from("payment_public_config")
        .select(CONFIG_COLUMNS)
        .eq("id", id)
        .maybeSingle();
      if (error) throwRepositoryError(error);
      if (!data) return null;
      return requireConfig(data);
    },

    create(input, actorUserId) {
      return runMutation({
        operation: "create",
        id: null,
        expectedVersion: null,
        values: configValues(input),
        actorUserId,
      });
    },

    update(id, input, actorUserId) {
      return runMutation({
        operation: "update",
        id,
        expectedVersion: input.expectedVersion,
        values: configValues(input),
        actorUserId,
      });
    },

    transition(input) {
      return runMutation({
        operation: input.operation,
        id: input.id,
        expectedVersion: input.expectedVersion,
        values: {},
        actorUserId: input.actorUserId,
      });
    },

    async publish(input) {
      const { data, error } = await client.rpc("publish_payment_public_config", {
        p_config_id: input.id,
        p_expected_version: input.expectedVersion,
        p_actor_user_id: input.actorUserId,
        p_idempotency_key: input.idempotencyKey,
      });
      if (error) throwRepositoryError(error);
      const parsed = publishResultSchema.safeParse(data);
      if (!parsed.success) throw new PaymentPublicConfigError("internal", 500);
      return {
        configId: parsed.data.config_id,
        configVersion: parsed.data.config_version,
        method: parsed.data.method,
      };
    },
  };
}
```

- [ ] **Step 2: Write `repository.server.test.ts`**

```ts
import { describe, expect, mock, test } from "bun:test";

import {
  createSupabasePaymentPublicConfigRepository,
  PaymentPublicConfigError,
} from "./repository.server";

const BASE_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  method: "fps",
  is_publicly_visible: true,
  display_label_zh: "轉數快 FPS",
  display_label_en: "FPS",
  sort_order: 2,
  details: {},
  state: "draft",
  version: 1,
  created_by: "22222222-2222-2222-2222-222222222222",
  updated_by: "22222222-2222-2222-2222-222222222222",
  submitted_by: null,
  submitted_at: null,
  published_by: null,
  published_at: null,
  archived_by: null,
  archived_at: null,
  created_at: "2026-08-31T00:00:00+00:00",
  updated_at: "2026-08-31T00:00:00+00:00",
};

function fakeClient({
  rpcData,
  rpcError,
  listData,
  listCount,
  listError,
  getData,
  getError,
}: {
  rpcData?: unknown;
  rpcError?: unknown;
  listData?: unknown[];
  listCount?: number;
  listError?: unknown;
  getData?: unknown;
  getError?: unknown;
} = {}) {
  const rpc = mock(async () => ({ data: rpcData ?? null, error: rpcError ?? null }));
  const listBuilder: Record<string, unknown> = {
    order: () => listBuilder,
    range: () => Promise.resolve({ data: listData ?? [], count: listCount ?? 0, error: listError ?? null }),
    eq: () => listBuilder,
  };
  const getBuilder = {
    eq: () => getBuilder,
    maybeSingle: () => Promise.resolve({ data: getData ?? null, error: getError ?? null }),
  };
  return {
    rpc,
    from: () => ({
      select: (_columns: string, options?: { count?: string }) =>
        options?.count ? listBuilder : getBuilder,
    }),
  } as never;
}

describe("createSupabasePaymentPublicConfigRepository", () => {
  test("create() calls the mutation RPC and maps the returned row", async () => {
    const client = fakeClient({ rpcData: BASE_ROW });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    const result = await repository.create(
      {
        method: "fps",
        isPubliclyVisible: true,
        displayLabelZh: "轉數快 FPS",
        displayLabelEn: "FPS",
        sortOrder: 2,
        details: {},
      },
      "22222222-2222-2222-2222-222222222222",
    );
    expect(result.method).toBe("fps");
    expect(client.rpc).toHaveBeenCalledWith(
      "mutate_payment_public_config_with_audit",
      expect.objectContaining({ p_operation: "create" }),
    );
  });

  test("publish() maps a same-actor rejection (42501) to a conflict-shaped forbidden error", async () => {
    const client = fakeClient({ rpcError: { code: "42501", message: "A different admin must publish this change" } });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    await expect(
      repository.publish({
        id: BASE_ROW.id,
        expectedVersion: 1,
        actorUserId: "same-actor",
        idempotencyKey: "a".repeat(32),
      }),
    ).rejects.toThrow(PaymentPublicConfigError);
  });

  test("publish() maps a stale-version error (40001) to a conflict", async () => {
    const client = fakeClient({ rpcError: { code: "40001", message: "Stale payment public config version" } });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    try {
      await repository.publish({
        id: BASE_ROW.id,
        expectedVersion: 1,
        actorUserId: "actor",
        idempotencyKey: "a".repeat(32),
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentPublicConfigError);
      expect((error as PaymentPublicConfigError).code).toBe("conflict");
    }
  });

  test("getById() returns null when no row matches", async () => {
    const client = fakeClient({ getData: null });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    expect(await repository.getById(BASE_ROW.id)).toBeNull();
  });

  test("list() returns mapped items with pagination metadata", async () => {
    const client = fakeClient({ listData: [BASE_ROW], listCount: 1 });
    const repository = createSupabasePaymentPublicConfigRepository(client);
    const result = await repository.list({ page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.items[0]?.method).toBe("fps");
  });
});
```

- [ ] **Step 3: Run tests, typecheck**

Run: `bun test src/lib/paymentPublicConfig/repository.server.test.ts` — expect PASS, 5 tests.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/paymentPublicConfig/repository.server.ts src/lib/paymentPublicConfig/repository.server.test.ts
git commit -m "feat: add payment public config repository"
```

---

### Task 4: Service layer

**Files:**
- Create: `src/lib/paymentPublicConfig/service.ts`
- Create: `src/lib/paymentPublicConfig/service.test.ts`

- [ ] **Step 1: Write `service.ts`**

```ts
import {
  paymentPublicConfigDraftInputSchema,
  paymentPublicConfigIdSchema,
  paymentPublicConfigMutationSchema,
  paymentPublicConfigPublishSchema,
  paymentPublicConfigTransitionSchema,
} from "./schemas";
import {
  PaymentPublicConfigError,
  type PaymentPublicConfigAdminQuery,
  type PaymentPublicConfigDraftInput,
  type PaymentPublicConfigRepository,
} from "./repository.server";
import type { PaymentPublicConfig } from "./types";

export { PaymentPublicConfigError };
export type {
  PaginatedPaymentPublicConfig,
  PaymentPublicConfigAdminQuery,
  PaymentPublicConfigDraftInput,
  PaymentPublicConfigMutationInput,
  PaymentPublicConfigPublishResult,
} from "./repository.server";

export type PaymentPublicConfigActor = {
  adminUserId: string;
  authUserId: string;
  role: "staff" | "treasurer" | "admin";
};

function requireActor(actor: PaymentPublicConfigActor) {
  if (
    !actor ||
    typeof actor.adminUserId !== "string" ||
    !actor.adminUserId.trim() ||
    typeof actor.authUserId !== "string" ||
    !actor.authUserId.trim() ||
    (actor.role !== "staff" && actor.role !== "treasurer" && actor.role !== "admin")
  ) {
    throw new PaymentPublicConfigError("unauthorized", 401);
  }
  return actor;
}

function requirePublisher(actor: PaymentPublicConfigActor) {
  requireActor(actor);
  if (actor.role !== "treasurer" && actor.role !== "admin") {
    throw new PaymentPublicConfigError("forbidden", 403, "Treasurer or admin approval is required.");
  }
}

function assertVersion(config: PaymentPublicConfig, expectedVersion: number) {
  if (config.version !== expectedVersion) {
    throw new PaymentPublicConfigError("conflict", 409);
  }
}

function assertState(config: PaymentPublicConfig, expected: "draft" | "in_review", message: string) {
  if (config.state !== expected) {
    throw new PaymentPublicConfigError("conflict", 409, message);
  }
}

export function createPaymentPublicConfigService(repository: PaymentPublicConfigRepository) {
  async function getConfig(actor: PaymentPublicConfigActor, rawId: string) {
    requireActor(actor);
    const id = paymentPublicConfigIdSchema.parse(rawId);
    const config = await repository.getById(id);
    if (!config) throw new PaymentPublicConfigError("not_found", 404);
    return config;
  }

  return {
    async list({
      actor,
      query,
    }: {
      actor: PaymentPublicConfigActor;
      query: PaymentPublicConfigAdminQuery;
    }) {
      requireActor(actor);
      return repository.list(query);
    },

    async get({ actor, id }: { actor: PaymentPublicConfigActor; id: string }) {
      return getConfig(actor, id);
    },

    async createDraft({
      actor,
      input,
    }: {
      actor: PaymentPublicConfigActor;
      input: PaymentPublicConfigDraftInput;
    }) {
      requireActor(actor);
      const parsed = paymentPublicConfigDraftInputSchema.parse(input);
      return repository.create(parsed, actor.authUserId);
    },

    async updateDraft({
      actor,
      id: rawId,
      input,
    }: {
      actor: PaymentPublicConfigActor;
      id: string;
      input: unknown;
    }) {
      requireActor(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const parsed = paymentPublicConfigMutationSchema.parse(input);
      const config = await getConfig(actor, id);
      assertVersion(config, parsed.expectedVersion);
      assertState(config, "draft", "Only draft config rows can be edited.");
      return repository.update(id, parsed, actor.authUserId);
    },

    async submit({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
    }: {
      actor: PaymentPublicConfigActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requireActor(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const { expectedVersion } = paymentPublicConfigTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const config = await getConfig(actor, id);
      assertVersion(config, expectedVersion);
      assertState(config, "draft", "Only draft config rows can be submitted.");
      return repository.transition({
        id,
        expectedVersion,
        operation: "submit",
        actorUserId: actor.authUserId,
      });
    },

    async withdraw({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
    }: {
      actor: PaymentPublicConfigActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requireActor(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const { expectedVersion } = paymentPublicConfigTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const config = await getConfig(actor, id);
      assertVersion(config, expectedVersion);
      assertState(config, "in_review", "Only in-review config rows can be withdrawn.");
      return repository.transition({
        id,
        expectedVersion,
        operation: "withdraw",
        actorUserId: actor.authUserId,
      });
    },

    async returnToDraft({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
    }: {
      actor: PaymentPublicConfigActor;
      id: string;
      expectedVersion: unknown;
    }) {
      requirePublisher(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const { expectedVersion } = paymentPublicConfigTransitionSchema.parse({
        expectedVersion: rawExpectedVersion,
      });
      const config = await getConfig(actor, id);
      assertVersion(config, expectedVersion);
      assertState(config, "in_review", "Only in-review config rows can be returned.");
      return repository.transition({
        id,
        expectedVersion,
        operation: "return_to_draft",
        actorUserId: actor.authUserId,
      });
    },

    async publish({
      actor,
      id: rawId,
      expectedVersion: rawExpectedVersion,
      idempotencyKey: rawIdempotencyKey,
    }: {
      actor: PaymentPublicConfigActor;
      id: string;
      expectedVersion: unknown;
      idempotencyKey: unknown;
    }) {
      requirePublisher(actor);
      const id = paymentPublicConfigIdSchema.parse(rawId);
      const { expectedVersion, idempotencyKey } = paymentPublicConfigPublishSchema.parse({
        expectedVersion: rawExpectedVersion,
        idempotencyKey: rawIdempotencyKey,
      });
      return repository.publish({
        id,
        expectedVersion,
        actorUserId: actor.authUserId,
        idempotencyKey,
      });
    },
  };
}
```

- [ ] **Step 2: Write `service.test.ts`**

```ts
import { describe, expect, mock, test } from "bun:test";

import { createPaymentPublicConfigService, PaymentPublicConfigError } from "./service";
import type { PaymentPublicConfigRepository } from "./repository.server";
import type { PaymentPublicConfig } from "./types";

const STAFF_ACTOR = { adminUserId: "admin-1", authUserId: "auth-1", role: "staff" as const };
const TREASURER_ACTOR = { adminUserId: "admin-2", authUserId: "auth-2", role: "treasurer" as const };

const DRAFT_CONFIG: PaymentPublicConfig = {
  id: "11111111-1111-1111-1111-111111111111",
  method: "fps",
  isPubliclyVisible: true,
  displayLabelZh: "轉數快 FPS",
  displayLabelEn: "FPS",
  sortOrder: 2,
  details: {},
  state: "draft",
  version: 1,
  createdBy: "auth-1",
  updatedBy: "auth-1",
  submittedBy: null,
  submittedAt: null,
  publishedBy: null,
  publishedAt: null,
  archivedBy: null,
  archivedAt: null,
  createdAt: "2026-08-31T00:00:00Z",
  updatedAt: "2026-08-31T00:00:00Z",
};

function fakeRepository(overrides: Partial<PaymentPublicConfigRepository> = {}): PaymentPublicConfigRepository {
  return {
    list: mock(async () => ({ items: [], total: 0, page: 1, pageSize: 20 })),
    getById: mock(async () => DRAFT_CONFIG),
    create: mock(async () => DRAFT_CONFIG),
    update: mock(async () => DRAFT_CONFIG),
    transition: mock(async () => DRAFT_CONFIG),
    publish: mock(async () => ({ configId: DRAFT_CONFIG.id, configVersion: 2, method: "fps" as const })),
    ...overrides,
  };
}

describe("createPaymentPublicConfigService", () => {
  test("a staff actor can submit a draft", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    await service.submit({ actor: STAFF_ACTOR, id: DRAFT_CONFIG.id, expectedVersion: 1 });
    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "submit", actorUserId: "auth-1" }),
    );
  });

  test("a staff actor cannot publish", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    await expect(
      service.publish({
        actor: STAFF_ACTOR,
        id: DRAFT_CONFIG.id,
        expectedVersion: 1,
        idempotencyKey: "a".repeat(32),
      }),
    ).rejects.toThrow(PaymentPublicConfigError);
  });

  test("a treasurer actor can publish", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    const result = await service.publish({
      actor: TREASURER_ACTOR,
      id: DRAFT_CONFIG.id,
      expectedVersion: 1,
      idempotencyKey: "a".repeat(32),
    });
    expect(result.method).toBe("fps");
  });

  test("a staff actor cannot return a submission to draft", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    await expect(
      service.returnToDraft({ actor: STAFF_ACTOR, id: DRAFT_CONFIG.id, expectedVersion: 1 }),
    ).rejects.toThrow(PaymentPublicConfigError);
  });

  test("submit rejects a version mismatch before calling the repository transition", async () => {
    const repository = fakeRepository();
    const service = createPaymentPublicConfigService(repository);
    await expect(
      service.submit({ actor: STAFF_ACTOR, id: DRAFT_CONFIG.id, expectedVersion: 99 }),
    ).rejects.toThrow(PaymentPublicConfigError);
    expect(repository.transition).not.toHaveBeenCalled();
  });

  test("submit rejects a config that is not in draft state", async () => {
    const repository = fakeRepository({
      getById: mock(async () => ({ ...DRAFT_CONFIG, state: "in_review" as const })),
    });
    const service = createPaymentPublicConfigService(repository);
    await expect(
      service.submit({ actor: STAFF_ACTOR, id: DRAFT_CONFIG.id, expectedVersion: 1 }),
    ).rejects.toThrow(PaymentPublicConfigError);
  });
});
```

- [ ] **Step 3: Run tests, typecheck**

Run: `bun test src/lib/paymentPublicConfig/service.test.ts` — expect PASS, 6 tests.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/paymentPublicConfig/service.ts src/lib/paymentPublicConfig/service.test.ts
git commit -m "feat: add payment public config service with treasurer-gated publish"
```

---

### Task 5: HTTP layer

**Files:**
- Create: `src/lib/paymentPublicConfig/http.server.ts`
- Create: `src/lib/paymentPublicConfig/http.server.test.ts`

- [ ] **Step 1: Write `http.server.ts`**

```ts
import { z } from "zod";

import {
  paymentPublicConfigDraftInputSchema,
  paymentPublicConfigIdSchema,
  paymentPublicConfigMethodSchema,
  paymentPublicConfigMutationSchema,
  paymentPublicConfigPublishSchema,
  paymentPublicConfigStateSchema,
  paymentPublicConfigTransitionSchema,
} from "./schemas";
import {
  PaymentPublicConfigError,
  createPaymentPublicConfigService,
  type PaymentPublicConfigActor,
} from "./service";

type PaymentPublicConfigService = ReturnType<typeof createPaymentPublicConfigService>;

type ConfigParams = {
  id?: string;
};

const adminQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  method: paymentPublicConfigMethodSchema.optional(),
  state: paymentPublicConfigStateSchema.optional(),
});

const configParamsSchema = z.object({
  id: paymentPublicConfigIdSchema,
});

const defaultMessages = {
  unauthorized: "Authentication is required.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "Payment method configuration not found.",
  conflict: "This configuration changed or cannot make that transition.",
  invalid: "The configuration is not ready for this action.",
  internal: "The payment configuration request could not be completed.",
} as const;

function jsonNoStore(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function fieldErrors(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>) {
  const fields: Record<string, string[]> = {};
  for (const issue of issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "request";
    (fields[path] ??= []).push(issue.message);
  }
  return fields;
}

function validationResponse(fields: Record<string, string[]>) {
  return jsonNoStore(
    {
      error: {
        code: "validation_error",
        message: "Review the highlighted fields.",
        fields,
      },
    },
    400,
  );
}

function paymentPublicConfigErrorResponse(error: PaymentPublicConfigError) {
  const status = error.code === "invalid" ? 400 : error.status;
  return jsonNoStore({ error: { code: error.code, message: defaultMessages[error.code] } }, status);
}

export function paymentPublicConfigInternalErrorResponse() {
  return jsonNoStore(
    {
      error: {
        code: "internal",
        message: defaultMessages.internal,
      },
    },
    500,
  );
}

function authResponse(status: 401 | 403) {
  const code = status === 401 ? "unauthorized" : "forbidden";
  return jsonNoStore({ error: { code, message: defaultMessages[code] } }, status);
}

async function withHttpErrors(operation: () => Promise<Response>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return validationResponse(fieldErrors(error.issues));
    }
    if (error instanceof PaymentPublicConfigError) {
      return paymentPublicConfigErrorResponse(error);
    }
    if (error instanceof Response) {
      if (error.status === 401 || error.status === 403) {
        return authResponse(error.status);
      }
    }
    return paymentPublicConfigInternalErrorResponse();
  }
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["body"],
        message: "Request body must be valid JSON.",
      },
    ]);
  }
}

function configId(params: ConfigParams) {
  return configParamsSchema.parse(params).id;
}

function requirePublishingRole(actor: PaymentPublicConfigActor) {
  if (actor.role !== "treasurer" && actor.role !== "admin") {
    throw new PaymentPublicConfigError("forbidden", 403);
  }
}

export function createPaymentPublicConfigHandlers({
  requireActor,
  service,
}: {
  requireActor: (request: Request) => Promise<PaymentPublicConfigActor>;
  service: PaymentPublicConfigService;
}) {
  return {
    list(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const query = adminQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        return jsonNoStore(await service.list({ actor, query }));
      });
    },

    create(request: Request) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = paymentPublicConfigDraftInputSchema.parse(await jsonBody(request));
        return jsonNoStore(await service.createDraft({ actor, input }), 201);
      });
    },

    get(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        return jsonNoStore(await service.get({ actor, id: configId(params) }));
      });
    },

    update(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = paymentPublicConfigMutationSchema.parse(await jsonBody(request));
        return jsonNoStore(await service.updateDraft({ actor, id: configId(params), input }));
      });
    },

    submit(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = paymentPublicConfigTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.submit({ actor, id: configId(params), expectedVersion: input.expectedVersion }),
        );
      });
    },

    withdraw(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        const input = paymentPublicConfigTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.withdraw({ actor, id: configId(params), expectedVersion: input.expectedVersion }),
        );
      });
    },

    returnToDraft(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingRole(actor);
        const input = paymentPublicConfigTransitionSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.returnToDraft({ actor, id: configId(params), expectedVersion: input.expectedVersion }),
        );
      });
    },

    publish(request: Request, params: ConfigParams) {
      return withHttpErrors(async () => {
        const actor = await requireActor(request);
        requirePublishingRole(actor);
        const input = paymentPublicConfigPublishSchema.parse(await jsonBody(request));
        return jsonNoStore(
          await service.publish({
            actor,
            id: configId(params),
            expectedVersion: input.expectedVersion,
            idempotencyKey: input.idempotencyKey,
          }),
        );
      });
    },
  };
}
```

- [ ] **Step 2: Write `http.server.test.ts`**

```ts
import { describe, expect, test } from "bun:test";

import { createPaymentPublicConfigHandlers } from "./http.server";
import { createPaymentPublicConfigService, type PaymentPublicConfigActor } from "./service";
import type { PaymentPublicConfigRepository } from "./repository.server";

const TREASURER: PaymentPublicConfigActor = {
  adminUserId: "admin-1",
  authUserId: "auth-1",
  role: "treasurer",
};
const STAFF: PaymentPublicConfigActor = {
  adminUserId: "admin-2",
  authUserId: "auth-2",
  role: "staff",
};

function fakeRepository(): PaymentPublicConfigRepository {
  return {
    list: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
    getById: async () => null,
    create: async () => {
      throw new Error("not used");
    },
    update: async () => {
      throw new Error("not used");
    },
    transition: async () => {
      throw new Error("not used");
    },
    publish: async () => ({ configId: "id", configVersion: 2, method: "fps" as const }),
  };
}

function buildHandlers(actor: PaymentPublicConfigActor) {
  const service = createPaymentPublicConfigService(fakeRepository());
  return createPaymentPublicConfigHandlers({ requireActor: async () => actor, service });
}

describe("createPaymentPublicConfigHandlers", () => {
  test("publish returns 403 for a staff actor", async () => {
    const handlers = buildHandlers(STAFF);
    const response = await handlers.publish(
      new Request("http://x/publish", {
        method: "POST",
        body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "a".repeat(32) }),
      }),
      { id: "11111111-1111-1111-1111-111111111111" },
    );
    expect(response.status).toBe(403);
  });

  test("publish succeeds for a treasurer actor", async () => {
    const handlers = buildHandlers(TREASURER);
    const response = await handlers.publish(
      new Request("http://x/publish", {
        method: "POST",
        body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "a".repeat(32) }),
      }),
      { id: "11111111-1111-1111-1111-111111111111" },
    );
    expect(response.status).toBe(200);
  });

  test("get returns 404 for a missing row", async () => {
    const handlers = buildHandlers(TREASURER);
    const response = await handlers.get(new Request("http://x"), {
      id: "11111111-1111-1111-1111-111111111111",
    });
    expect(response.status).toBe(404);
  });

  test("create returns a 400 validation error for an invalid body", async () => {
    const handlers = buildHandlers(STAFF);
    const response = await handlers.create(
      new Request("http://x", { method: "POST", body: JSON.stringify({ method: "bank_transfer" }) }),
    );
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run tests, typecheck**

Run: `bun test src/lib/paymentPublicConfig/http.server.test.ts` — expect PASS, 4 tests.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/paymentPublicConfig/http.server.ts src/lib/paymentPublicConfig/http.server.test.ts
git commit -m "feat: add payment public config HTTP handlers"
```

---

### Task 6: Admin API routes

**Files:**
- Create: `src/routes/api/admin/payment-methods/-handlers.ts`
- Create: `src/routes/api/admin/payment-methods.ts`
- Create: `src/routes/api/admin/payment-methods/$id.ts`
- Create: `src/routes/api/admin/payment-methods/$id/submit.ts`
- Create: `src/routes/api/admin/payment-methods/$id/withdraw.ts`
- Create: `src/routes/api/admin/payment-methods/$id/return-to-draft.ts`
- Create: `src/routes/api/admin/payment-methods/$id/publish.ts`
- Create: `src/routes/api/admin/payment-methods/-handlers.test.ts`

- [ ] **Step 1: Write `-handlers.ts`**

```ts
import { requireAdmin, type AdminUser } from "../../../../lib/admin/session.server";
import {
  createPaymentPublicConfigHandlers,
  paymentPublicConfigInternalErrorResponse,
} from "../../../../lib/paymentPublicConfig/http.server";
import { createSupabasePaymentPublicConfigRepository } from "../../../../lib/paymentPublicConfig/repository.server";
import {
  createPaymentPublicConfigService,
  type PaymentPublicConfigActor,
} from "../../../../lib/paymentPublicConfig/service";
import { createSupabaseServiceClient } from "../../../../lib/supabase.server";

type PaymentPublicConfigHandlers = ReturnType<typeof createPaymentPublicConfigHandlers>;
type HandlerFactory = () => PaymentPublicConfigHandlers;
type ConfigParams = { id?: string };

export function toPaymentPublicConfigActor(user: AdminUser): PaymentPublicConfigActor {
  if (user.role !== "staff" && user.role !== "treasurer" && user.role !== "admin") {
    throw new Response("Forbidden", { status: 403 });
  }
  return {
    adminUserId: user.id,
    authUserId: user.authUserId,
    role: user.role,
  };
}

export function createHandlers() {
  const client = createSupabaseServiceClient();
  const repository = createSupabasePaymentPublicConfigRepository(client);
  const service = createPaymentPublicConfigService(repository);

  return createPaymentPublicConfigHandlers({
    requireActor: async (request) => {
      const user = await requireAdmin(request, ["staff", "treasurer", "admin"], client);
      return toPaymentPublicConfigActor(user);
    },
    service,
  });
}

async function withComposition(
  factory: HandlerFactory,
  invoke: (handlers: PaymentPublicConfigHandlers) => Promise<Response>,
) {
  try {
    return await invoke(factory());
  } catch {
    return paymentPublicConfigInternalErrorResponse();
  }
}

export function createPaymentPublicConfigRouteDelegates(factory: HandlerFactory = createHandlers) {
  return {
    list: (request: Request) => withComposition(factory, (handlers) => handlers.list(request)),
    create: (request: Request) => withComposition(factory, (handlers) => handlers.create(request)),
    get: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.get(request, params)),
    update: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.update(request, params)),
    submit: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.submit(request, params)),
    withdraw: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.withdraw(request, params)),
    returnToDraft: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.returnToDraft(request, params)),
    publish: (request: Request, params: ConfigParams) =>
      withComposition(factory, (handlers) => handlers.publish(request, params)),
  };
}

export const paymentMethodRouteHandlers = createPaymentPublicConfigRouteDelegates();
```

- [ ] **Step 2: Write the six route files**

`src/routes/api/admin/payment-methods.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "./payment-methods/-handlers";

export const Route = createFileRoute("/api/admin/payment-methods")({
  server: {
    handlers: {
      GET: ({ request }) => paymentMethodRouteHandlers.list(request),
      POST: ({ request }) => paymentMethodRouteHandlers.create(request),
    },
  },
});
```

`src/routes/api/admin/payment-methods/$id.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "./-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => paymentMethodRouteHandlers.get(request, params),
      PATCH: ({ request, params }) => paymentMethodRouteHandlers.update(request, params),
    },
  },
});
```

`src/routes/api/admin/payment-methods/$id/submit.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id/submit")({
  server: {
    handlers: {
      POST: ({ request, params }) => paymentMethodRouteHandlers.submit(request, params),
    },
  },
});
```

`src/routes/api/admin/payment-methods/$id/withdraw.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id/withdraw")({
  server: {
    handlers: {
      POST: ({ request, params }) => paymentMethodRouteHandlers.withdraw(request, params),
    },
  },
});
```

`src/routes/api/admin/payment-methods/$id/return-to-draft.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id/return-to-draft")({
  server: {
    handlers: {
      POST: ({ request, params }) => paymentMethodRouteHandlers.returnToDraft(request, params),
    },
  },
});
```

`src/routes/api/admin/payment-methods/$id/publish.ts`:

```ts
import { createFileRoute } from "@tanstack/react-router";

import { paymentMethodRouteHandlers } from "../-handlers";

export const Route = createFileRoute("/api/admin/payment-methods/$id/publish")({
  server: {
    handlers: {
      POST: ({ request, params }) => paymentMethodRouteHandlers.publish(request, params),
    },
  },
});
```

- [ ] **Step 3: Write `-handlers.test.ts`**

```ts
import { describe, expect, test } from "bun:test";

import { createPaymentPublicConfigRouteDelegates, toPaymentPublicConfigActor } from "./-handlers";

describe("toPaymentPublicConfigActor", () => {
  test("maps an admin_user row to an actor", () => {
    const actor = toPaymentPublicConfigActor({
      id: "admin-1",
      authUserId: "auth-1",
      email: "a@example.com",
      role: "treasurer",
      status: "active",
    });
    expect(actor).toEqual({ adminUserId: "admin-1", authUserId: "auth-1", role: "treasurer" });
  });
});

describe("createPaymentPublicConfigRouteDelegates", () => {
  test("returns a 500 JSON response when the handler factory throws", async () => {
    const delegates = createPaymentPublicConfigRouteDelegates(() => {
      throw new Error("boom");
    });
    const response = await delegates.list(new Request("http://x"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("internal");
  });
});
```

- [ ] **Step 4: Run tests, typecheck**

Run: `bun test src/routes/api/admin/payment-methods/-handlers.test.ts` — expect PASS, 2 tests.
Run: `bunx tsc --noEmit` — if it complains the new routes aren't in `routeTree.gen.ts`, run `bun run dev` briefly to regenerate it, then stop it and re-check.

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/admin/payment-methods.ts src/routes/api/admin/payment-methods/ src/routeTree.gen.ts
git commit -m "feat: add admin payment-methods API routes"
```

---

### Task 7: Public read path

**Files:**
- Create: `src/lib/paymentPublicConfig/public.server.ts`
- Create: `src/lib/paymentPublicConfig/public.functions.ts`
- Create: `src/lib/paymentPublicConfig/public.server.test.ts`

- [ ] **Step 1: Write `public.server.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { paymentPublicConfigMethodSchema } from "./schemas";
import type { PublicPaymentMethod } from "./types";

const publicRowSchema = z.object({
  method: paymentPublicConfigMethodSchema,
  display_label_zh: z.string(),
  display_label_en: z.string(),
  details: z.record(z.string(), z.string()),
});

export async function loadPublicPaymentMethods(client: SupabaseClient): Promise<PublicPaymentMethod[]> {
  const { data, error } = await client
    .from("payment_public_config")
    .select("method,display_label_zh,display_label_en,details")
    .eq("state", "published")
    .eq("is_publicly_visible", true)
    .order("sort_order", { ascending: true });

  if (error) return [];

  const rows: PublicPaymentMethod[] = [];
  for (const raw of data ?? []) {
    const parsed = publicRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    rows.push({
      method: parsed.data.method,
      displayLabelZh: parsed.data.display_label_zh,
      displayLabelEn: parsed.data.display_label_en,
      details: parsed.data.details,
    });
  }
  return rows;
}
```

- [ ] **Step 2: Write `public.functions.ts`**

```ts
import { createServerFn } from "@tanstack/react-start";

export const getPublicPaymentMethods = createServerFn({ method: "GET" }).handler(async () => {
  const { createSupabaseServiceClient } = await import("../supabase.server");
  const { loadPublicPaymentMethods } = await import("./public.server");
  return loadPublicPaymentMethods(createSupabaseServiceClient());
});
```

- [ ] **Step 3: Write `public.server.test.ts`**

```ts
import { describe, expect, test } from "bun:test";

import { loadPublicPaymentMethods } from "./public.server";

function fakeClient(data: unknown[], error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data, error }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("loadPublicPaymentMethods", () => {
  test("maps published, publicly-visible rows in sort order", async () => {
    const client = fakeClient([
      { method: "stripe", display_label_zh: "信用卡", display_label_en: "Card", details: {} },
      { method: "fps", display_label_zh: "轉數快 FPS", display_label_en: "FPS", details: {} },
    ]);
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual([
      { method: "stripe", displayLabelZh: "信用卡", displayLabelEn: "Card", details: {} },
      { method: "fps", displayLabelZh: "轉數快 FPS", displayLabelEn: "FPS", details: {} },
    ]);
  });

  test("returns an empty array when the query errors, instead of throwing", async () => {
    const client = fakeClient([], { message: "connection refused" });
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual([]);
  });

  test("skips a row that fails to parse instead of throwing", async () => {
    const client = fakeClient([{ method: "not_a_real_method", display_label_zh: "x", display_label_en: "y", details: {} }]);
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 4: Run tests, typecheck**

Run: `bun test src/lib/paymentPublicConfig/public.server.test.ts` — expect PASS, 3 tests.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/paymentPublicConfig/public.server.ts src/lib/paymentPublicConfig/public.functions.ts src/lib/paymentPublicConfig/public.server.test.ts
git commit -m "feat: add public payment-methods read path"
```

---

### Task 8: `/donate` integration

**Files:**
- Modify: `src/routes/donate.tsx`
- Modify: `src/routes/donate.test.tsx`

- [ ] **Step 1: Read the current file in full**, focusing on the `Route` definition (`loader:` around line 47), the `methods` constant (line 190-196), the `DonatePage` component signature (`initialSlots` prop, around line 254-260), and the method-selection `fieldset` (around line 629-655).

- [ ] **Step 2: Combine the two loader reads with matching, established resilience**

`loadDonationDocumentSlots` already catches its own errors and falls back to `[]` (see its definition in `src/lib/documents/donation.server.ts`) rather than using the `resilientPublicLoader` discriminated-union helper used elsewhere in this repo. Match that same established style for payment methods — a Supabase failure here already can't crash this page today, and a payment-methods failure shouldn't behave differently. Replace the loader line:

```ts
loader: asContextFreeRouteLoader(loadDonationDocumentSlots),
```

with a combined loader that fetches both concurrently:

```ts
loader: asContextFreeRouteLoader(async () => {
  const [slots, paymentMethods] = await Promise.all([
    loadDonationDocumentSlots(),
    getPublicPaymentMethods().catch(() => []),
  ]);
  return { slots, paymentMethods };
}),
```

Add the import:

```ts
import { getPublicPaymentMethods } from "../lib/paymentPublicConfig/public.functions";
```

- [ ] **Step 3: Update the component to consume the combined loader shape**

Find:

```ts
  return <DonatePage initialSlots={Route.useLoaderData()} initialSearch={Route.useSearch()} />;
```

Replace with:

```ts
  const loaderData = Route.useLoaderData();
  return (
    <DonatePage
      initialSlots={loaderData.slots}
      initialMethods={loaderData.paymentMethods}
      initialSearch={Route.useSearch()}
    />
  );
```

Find the `DonatePage` function signature (around line 254-260):

```ts
export function DonatePage({
  initialSlots,
  ...
}: {
  initialSlots: DocumentSlot[];
  ...
}) {
```

Add `initialMethods` to both the destructure and the type:

```ts
export function DonatePage({
  initialSlots,
  initialMethods,
  ...
}: {
  initialSlots: DocumentSlot[];
  initialMethods: PublicPaymentMethod[];
  ...
}) {
```

Add the import:

```ts
import type { PublicPaymentMethod } from "../lib/paymentPublicConfig/types";
```

- [ ] **Step 4: Replace the hardcoded `methods` array with a config-driven list**

Icons stay in code (a database jsonb column cannot hold a React component reference). Replace:

```ts
const methods: { value: DonationMethod; zh: string; en: string; Icon: typeof CreditCard }[] = [
  { value: "stripe", zh: "信用卡", en: "Card", Icon: CreditCard },
  { value: "alipayhk", zh: "AlipayHK", en: "AlipayHK", Icon: Smartphone },
  { value: "fps", zh: "轉數快 FPS", en: "FPS", Icon: Zap },
  { value: "payme", zh: "PayMe", en: "PayMe", Icon: Smartphone },
  { value: "paypal", zh: "PayPal", en: "PayPal", Icon: Globe },
];
```

with:

```ts
const METHOD_ICONS: Record<DonationMethod, typeof CreditCard> = {
  stripe: CreditCard,
  alipayhk: Smartphone,
  fps: Zap,
  payme: Smartphone,
  paypal: Globe,
};

function methodsFromConfig(configured: PublicPaymentMethod[]) {
  return configured.map((entry) => ({
    value: entry.method,
    zh: entry.displayLabelZh,
    en: entry.displayLabelEn,
    Icon: METHOD_ICONS[entry.method],
  }));
}
```

Inside `DonatePage`, add near the top of the component body (after the existing `useState` declarations):

```ts
  const methods = useMemo(() => methodsFromConfig(initialMethods), [initialMethods]);
```

`useMemo` is already imported (line 16). Find the render block (around line 629-655) and change the empty-list case: currently it's `checkoutEnabled ? (...) : (...)`. Add a third branch for a configured-but-empty list — replace:

```tsx
                {checkoutEnabled ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {methods.map(({ value, zh, en, Icon }) => (
```

with:

```tsx
                {checkoutEnabled && methods.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {methods.map(({ value, zh, en, Icon }) => (
```

(The existing `else` branch already renders `t.methodNotice`, which reads naturally for both "checkout not yet enabled" and "no methods currently published.")

- [ ] **Step 5: Update `donate.test.tsx`**

Read the current test file first. Any test that calls `Route.useLoaderData` mocks or constructs `DonatePage` directly needs `initialMethods` added. Add a shared fixture near the top of the test file:

```ts
const ALL_METHODS: PublicPaymentMethod[] = [
  { method: "stripe", displayLabelZh: "信用卡", displayLabelEn: "Card", details: {} },
  { method: "alipayhk", displayLabelZh: "AlipayHK", displayLabelEn: "AlipayHK", details: {} },
  { method: "fps", displayLabelZh: "轉數快 FPS", displayLabelEn: "FPS", details: {} },
  { method: "payme", displayLabelZh: "PayMe", displayLabelEn: "PayMe", details: {} },
  { method: "paypal", displayLabelZh: "PayPal", displayLabelEn: "PayPal", details: {} },
];
```

with the matching import:

```ts
import type { PublicPaymentMethod } from "../lib/paymentPublicConfig/types";
```

Everywhere the test file renders `<DonatePage initialSlots={...} .../>` directly, add `initialMethods={ALL_METHODS}`. Add two new tests:

```ts
test("renders no method buttons when the config-driven list is empty", () => {
  render(
    <DonatePage initialSlots={[]} initialMethods={[]} initialSearch={{}} />,
  );
  expect(screen.queryByRole("button", { name: /Card|信用卡/ })).toBeNull();
});

test("renders a method button per configured method, in the given order", () => {
  render(
    <DonatePage
      initialSlots={[]}
      initialMethods={[
        { method: "fps", displayLabelZh: "轉數快 FPS", displayLabelEn: "FPS", details: {} },
        { method: "stripe", displayLabelZh: "信用卡", displayLabelEn: "Card", details: {} },
      ]}
      initialSearch={{}}
    />,
  );
  const buttons = screen.getAllByRole("button", { pressed: false });
  const methodButtonTexts = buttons.map((button) => button.textContent).filter(Boolean);
  expect(methodButtonTexts.some((text) => text?.includes("FPS"))).toBe(true);
  expect(methodButtonTexts.some((text) => text?.includes("信用卡"))).toBe(true);
});
```

Adjust the exact query/matcher used above to whatever this file's existing tests already use for finding method buttons (check an existing test that clicks a method button and copy its selector style) — the two tests above illustrate intent; match the file's established query conventions exactly.

- [ ] **Step 6: Run tests, typecheck**

Run: `bun test src/routes/donate.test.tsx` — expect PASS.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 7: Commit**

```bash
git add src/routes/donate.tsx src/routes/donate.test.tsx
git commit -m "feat: read /donate payment methods from payment_public_config"
```

---

### Task 9: Admin UI logic module

**Files:**
- Create: `src/components/admin/content/paymentMethodsLogic.ts`
- Create: `src/components/admin/content/paymentMethodsLogic.test.ts`

- [ ] **Step 1: Write `paymentMethodsLogic.ts`**

```ts
import { fetchAdminJson } from "../../../lib/admin/http";
import { AdminApiError } from "../../../lib/admin/session";
import type {
  PaginatedPaymentPublicConfig,
  PaymentPublicConfigPublishResult,
} from "../../../lib/paymentPublicConfig/repository.server";
import type {
  PaymentPublicConfig,
  PaymentPublicConfigMethod,
  PaymentPublicConfigState,
} from "../../../lib/paymentPublicConfig/types";

export type PaymentMethodFilters = {
  method?: PaymentPublicConfigMethod | "all";
  state?: PaymentPublicConfigState | "all";
  page?: number;
  pageSize?: number;
};

export type PaymentMethodMutationOperation = "save" | "submit" | "withdraw" | "return-to-draft" | "publish";
export type AdminJsonRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export type PaymentMethodPublishAttempt = {
  idempotencyKey: string;
  payload: { expectedVersion: number; idempotencyKey: string };
};

export type PaymentMethodMutationError<T> =
  | { kind: "conflict"; message: string; preservedDraft: T }
  | { kind: "error"; message: string };

export function buildPaymentMethodSearchParams(input: PaymentMethodFilters = {}) {
  const params = new URLSearchParams();
  if (input.method && input.method !== "all") params.set("method", input.method);
  if (input.state && input.state !== "all") params.set("state", input.state);
  params.set("page", String(boundInteger(input.page ?? 1, 1, Number.MAX_SAFE_INTEGER)));
  params.set("pageSize", String(boundInteger(input.pageSize ?? 25, 1, 50)));
  return params;
}

export async function fetchPaymentMethodConfigs(
  filters: PaymentMethodFilters = {},
  request: AdminJsonRequest = fetchAdminJson,
) {
  return request<PaginatedPaymentPublicConfig>(
    `/api/admin/payment-methods?${buildPaymentMethodSearchParams(filters)}`,
  );
}

export async function mutatePaymentMethodConfig(
  id: string,
  operation: PaymentMethodMutationOperation,
  payload: unknown,
  request: AdminJsonRequest = fetchAdminJson,
) {
  const encodedId = encodeURIComponent(id);
  const route =
    operation === "save"
      ? `/api/admin/payment-methods/${encodedId}`
      : `/api/admin/payment-methods/${encodedId}/${operation}`;

  return request<PaymentPublicConfig | PaymentPublicConfigPublishResult>(route, {
    method: operation === "save" ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function createPaymentMethodConfig(
  input: {
    method: PaymentPublicConfigMethod;
    isPubliclyVisible: boolean;
    displayLabelZh: string;
    displayLabelEn: string;
    sortOrder: number;
    details: Record<string, string>;
  },
  request: AdminJsonRequest = fetchAdminJson,
) {
  return request<PaymentPublicConfig>("/api/admin/payment-methods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function resolveMutationError<T>(error: unknown, localDraft: T): PaymentMethodMutationError<T> {
  const isConflict =
    error instanceof AdminApiError
      ? error.status === 409 && error.code === "conflict"
      : hasStructuredConflict(error);

  if (isConflict) {
    return {
      kind: "conflict",
      message: "This configuration changed elsewhere. Reload before saving again.",
      preservedDraft: localDraft,
    };
  }

  return {
    kind: "error",
    message: error instanceof Error && error.message ? error.message : "Unable to save this configuration.",
  };
}

export function createPaymentMethodPublishAttempt(
  expectedVersion: number,
  createIdempotencyKey: () => string = () => crypto.randomUUID(),
): PaymentMethodPublishAttempt {
  const idempotencyKey = createIdempotencyKey();
  return { idempotencyKey, payload: { expectedVersion, idempotencyKey } };
}

export function canPublish(input: {
  config: Pick<PaymentPublicConfig, "state" | "submittedBy">;
  currentActorAdminUserId: string;
  currentActorRole: "staff" | "treasurer" | "admin";
}) {
  if (input.config.state !== "in_review") return false;
  if (input.currentActorRole !== "treasurer" && input.currentActorRole !== "admin") return false;
  if (input.config.submittedBy && input.config.submittedBy === input.currentActorAdminUserId) return false;
  return true;
}

function boundInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function hasStructuredConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; error?: { code?: unknown } };
  return candidate.status === 409 && candidate.error?.code === "conflict";
}
```

- [ ] **Step 2: Write `paymentMethodsLogic.test.ts`**

```ts
import { describe, expect, mock, test } from "bun:test";

import {
  buildPaymentMethodSearchParams,
  canPublish,
  createPaymentMethodPublishAttempt,
  fetchPaymentMethodConfigs,
  mutatePaymentMethodConfig,
  resolveMutationError,
} from "./paymentMethodsLogic";

describe("buildPaymentMethodSearchParams", () => {
  test("omits method/state when 'all', defaults page/pageSize", () => {
    const params = buildPaymentMethodSearchParams({ method: "all", state: "all" });
    expect(params.get("method")).toBeNull();
    expect(params.get("state")).toBeNull();
    expect(params.get("page")).toBe("1");
    expect(params.get("pageSize")).toBe("25");
  });

  test("includes an explicit method and state", () => {
    const params = buildPaymentMethodSearchParams({ method: "fps", state: "in_review" });
    expect(params.get("method")).toBe("fps");
    expect(params.get("state")).toBe("in_review");
  });
});

describe("fetchPaymentMethodConfigs", () => {
  test("requests the payment-methods list endpoint with the built query string", async () => {
    const request = mock(async () => ({ items: [], total: 0, page: 1, pageSize: 25 }));
    await fetchPaymentMethodConfigs({ method: "fps" }, request);
    expect(request).toHaveBeenCalledWith(expect.stringContaining("/api/admin/payment-methods?"));
    expect(request).toHaveBeenCalledWith(expect.stringContaining("method=fps"));
  });
});

describe("mutatePaymentMethodConfig", () => {
  test("uses PATCH against the base id route for 'save'", async () => {
    const request = mock(async () => ({}));
    await mutatePaymentMethodConfig("abc", "save", { expectedVersion: 1 }, request);
    expect(request).toHaveBeenCalledWith(
      "/api/admin/payment-methods/abc",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  test("uses POST against the operation sub-route for 'publish'", async () => {
    const request = mock(async () => ({}));
    await mutatePaymentMethodConfig("abc", "publish", { expectedVersion: 1, idempotencyKey: "x" }, request);
    expect(request).toHaveBeenCalledWith(
      "/api/admin/payment-methods/abc/publish",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("canPublish", () => {
  test("is false for a staff actor even on an in_review row", () => {
    expect(
      canPublish({
        config: { state: "in_review", submittedBy: "other" },
        currentActorAdminUserId: "me",
        currentActorRole: "staff",
      }),
    ).toBe(false);
  });

  test("is false when the treasurer is the same person who submitted", () => {
    expect(
      canPublish({
        config: { state: "in_review", submittedBy: "me" },
        currentActorAdminUserId: "me",
        currentActorRole: "treasurer",
      }),
    ).toBe(false);
  });

  test("is true for a different treasurer on an in_review row", () => {
    expect(
      canPublish({
        config: { state: "in_review", submittedBy: "other" },
        currentActorAdminUserId: "me",
        currentActorRole: "treasurer",
      }),
    ).toBe(true);
  });

  test("is false when the row is not in_review", () => {
    expect(
      canPublish({
        config: { state: "draft", submittedBy: null },
        currentActorAdminUserId: "me",
        currentActorRole: "admin",
      }),
    ).toBe(false);
  });
});

describe("createPaymentMethodPublishAttempt", () => {
  test("builds a payload carrying the given expectedVersion and a generated idempotency key", () => {
    const attempt = createPaymentMethodPublishAttempt(3, () => "fixed-key");
    expect(attempt.idempotencyKey).toBe("fixed-key");
    expect(attempt.payload).toEqual({ expectedVersion: 3, idempotencyKey: "fixed-key" });
  });
});

describe("resolveMutationError", () => {
  test("maps a structured 409 conflict response to a conflict result preserving the draft", () => {
    const result = resolveMutationError({ status: 409, error: { code: "conflict" } }, { draft: true });
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") expect(result.preservedDraft).toEqual({ draft: true });
  });

  test("maps any other error to a generic error result", () => {
    const result = resolveMutationError(new Error("network down"), { draft: true });
    expect(result).toEqual({ kind: "error", message: "network down" });
  });
});
```

- [ ] **Step 3: Run tests, typecheck**

Run: `bun test src/components/admin/content/paymentMethodsLogic.test.ts` — expect PASS, 10 tests.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/content/paymentMethodsLogic.ts src/components/admin/content/paymentMethodsLogic.test.ts
git commit -m "feat: add payment methods admin UI logic module"
```

---

### Task 10: Admin UI component

**Files:**
- Create: `src/components/admin/content/PaymentMethodsManagement.tsx`
- Create: `src/components/admin/content/PaymentMethodsManagement.test.tsx`

- [ ] **Step 1: Note the identity hook's response shape and this repo's container/view test split**

Two things established elsewhere in this codebase that this task must follow, not reinvent:

1. The signed-in admin comes from `useQuery(adminIdentityQueryOptions())` (`src/lib/admin/identity.ts`), fetching `GET /api/admin/me`, resolving to `AdminMeResponse = { admin: AdminIdentity }` — **nested under an `admin` key**. `AdminIdentity = { id: string; authUserId: string; email: string; role: AdminRole; status: AdminStatus }` (`src/lib/admin/access.ts`).
2. `fetchAdminJson` (used by both `adminIdentityQueryOptions` and `paymentMethodsLogic.ts`'s fetch helpers) calls `getAdminAccessToken()` first, which calls the real `supabase.auth.getSession()` — this means a component that fetches through `useQuery` directly **cannot** be safely tested by mocking `globalThis.fetch` alone; there is no signed-in session in the test environment, so `getAdminAccessToken()` throws before any mocked `fetch` is ever reached. Confirmed by reading `src/components/admin/content/AdoptionGuideReleaseManagement.test.tsx`: it never touches `fetch` or auth at all. Instead, that file's component is split into a **pure presentational `AdoptionGuideReleaseManagementView`** (exported from the same file, takes all data as props, zero hooks that fetch anything) and a **data-fetching container** (the default export, wires `useQuery`/`fetchAdminJson` and renders the View) — only the View is unit-tested, via `renderToStaticMarkup` with fixture props, exactly matching this plan's earlier `PaymentMethodsManagement.tsx` draft's mistake of trying to test the fetching container directly.

Follow that exact split here.

- [ ] **Step 2: Write `PaymentMethodsManagement.tsx`**

```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../../ui/button";
import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import type { AdminIdentity } from "../../../lib/admin/access";
import type { PaymentPublicConfig } from "../../../lib/paymentPublicConfig/types";
import {
  canPublish,
  createPaymentMethodPublishAttempt,
  fetchPaymentMethodConfigs,
  mutatePaymentMethodConfig,
  resolveMutationError,
} from "./paymentMethodsLogic";

const QUERY_KEY = ["payment-methods"] as const;

export function PaymentMethodsManagementView({
  identity,
  configs,
  errorMessage,
  onSubmit,
  onWithdraw,
  onPublish,
}: {
  identity: AdminIdentity | undefined;
  configs: PaymentPublicConfig[];
  errorMessage?: string;
  onSubmit: (config: PaymentPublicConfig) => void;
  onWithdraw: (config: PaymentPublicConfig) => void;
  onPublish: (config: PaymentPublicConfig) => void;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">付款方式設定</h1>
      {errorMessage ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
        {configs.map((config) => (
          <li key={config.id} className="flex items-center justify-between gap-4 p-3">
            <div>
              <span className="font-bold">{config.displayLabelZh}</span>{" "}
              <span className="text-[var(--color-text-muted)]">({config.method})</span>{" "}
              <span className="text-xs uppercase text-[var(--color-text-muted)]">{config.state}</span>
              {config.isPubliclyVisible ? null : (
                <span className="ml-2 text-xs text-[var(--color-text-muted)]">未公開</span>
              )}
            </div>
            <div className="flex gap-2">
              {config.state === "draft" ? (
                <Button type="button" onClick={() => onSubmit(config)}>
                  提交審批
                </Button>
              ) : null}
              {config.state === "in_review" && identity ? (
                <>
                  <Button type="button" onClick={() => onWithdraw(config)} variant="outline">
                    撤回
                  </Button>
                  <Button
                    type="button"
                    onClick={() => onPublish(config)}
                    disabled={
                      !canPublish({
                        config,
                        currentActorAdminUserId: identity.id,
                        currentActorRole: identity.role,
                      })
                    }
                    title={
                      config.submittedBy === identity.id ? "需要由另一位財務或管理員核准" : undefined
                    }
                  >
                    核准並發佈
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaymentMethodsManagement() {
  const queryClient = useQueryClient();
  const identityQuery = useQuery(adminIdentityQueryOptions());
  const listQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchPaymentMethodConfigs({ pageSize: 50 }),
  });
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const configs = listQuery.data?.items ?? [];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function handleSubmit(config: PaymentPublicConfig) {
    try {
      await mutatePaymentMethodConfig(config.id, "submit", { expectedVersion: config.version });
      setErrorMessage(undefined);
      await refresh();
    } catch (error) {
      setErrorMessage(resolveMutationError(error, config).message);
    }
  }

  async function handlePublish(config: PaymentPublicConfig) {
    try {
      const attempt = createPaymentMethodPublishAttempt(config.version);
      await mutatePaymentMethodConfig(config.id, "publish", attempt.payload);
      setErrorMessage(undefined);
      await refresh();
    } catch (error) {
      setErrorMessage(resolveMutationError(error, config).message);
    }
  }

  async function handleWithdraw(config: PaymentPublicConfig) {
    try {
      await mutatePaymentMethodConfig(config.id, "withdraw", { expectedVersion: config.version });
      setErrorMessage(undefined);
      await refresh();
    } catch (error) {
      setErrorMessage(resolveMutationError(error, config).message);
    }
  }

  if (listQuery.isLoading || identityQuery.isLoading) {
    return <p>載入付款方式設定中...</p>;
  }

  return (
    <PaymentMethodsManagementView
      identity={identityQuery.data?.admin}
      configs={configs}
      errorMessage={errorMessage}
      onSubmit={handleSubmit}
      onWithdraw={handleWithdraw}
      onPublish={handlePublish}
    />
  );
}
```

- [ ] **Step 3: Write `PaymentMethodsManagement.test.tsx`**

Tests the pure `PaymentMethodsManagementView` only, via `renderToStaticMarkup` — no `fetch`, no auth, no `QueryClientProvider` needed, exactly matching `AdoptionGuideReleaseManagement.test.tsx`'s established pattern:

```tsx
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminIdentity } from "../../../lib/admin/access";
import type { PaymentPublicConfig } from "../../../lib/paymentPublicConfig/types";
import { PaymentMethodsManagementView } from "./PaymentMethodsManagement";

const BASE_CONFIG: PaymentPublicConfig = {
  id: "11111111-1111-1111-1111-111111111111",
  method: "fps",
  isPubliclyVisible: true,
  displayLabelZh: "轉數快 FPS",
  displayLabelEn: "FPS",
  sortOrder: 2,
  details: {},
  state: "in_review",
  version: 2,
  createdBy: "admin-1",
  updatedBy: "admin-1",
  submittedBy: "admin-1",
  submittedAt: "2026-08-31T00:00:00Z",
  publishedBy: null,
  publishedAt: null,
  archivedBy: null,
  archivedAt: null,
  createdAt: "2026-08-31T00:00:00Z",
  updatedAt: "2026-08-31T00:00:00Z",
};

const TREASURER_1: AdminIdentity = {
  id: "admin-1",
  authUserId: "auth-1",
  email: "treasurer1@example.com",
  role: "treasurer",
  status: "active",
};
const TREASURER_2: AdminIdentity = {
  id: "admin-2",
  authUserId: "auth-2",
  email: "treasurer2@example.com",
  role: "treasurer",
  status: "active",
};

function noop() {}

describe("PaymentMethodsManagementView", () => {
  test("disables Publish when the signed-in treasurer is the row's own submitter", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_1}
        configs={[BASE_CONFIG]}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("核准並發佈");
    expect(html).toContain("disabled=\"\"");
  });

  test("enables Publish for a different treasurer than the submitter", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_2}
        configs={[BASE_CONFIG]}
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("核准並發佈");
    expect(html).not.toContain("disabled=\"\"");
  });

  test("renders the error message when present", () => {
    const html = renderToStaticMarkup(
      <PaymentMethodsManagementView
        identity={TREASURER_1}
        configs={[]}
        errorMessage="This configuration changed elsewhere. Reload before saving again."
        onSubmit={noop}
        onWithdraw={noop}
        onPublish={noop}
      />,
    );
    expect(html).toContain("This configuration changed elsewhere");
  });
});
```

- [ ] **Step 4: Run tests, typecheck**

Run: `bun test src/components/admin/content/PaymentMethodsManagement.test.tsx` — expect PASS, 3 tests.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/content/PaymentMethodsManagement.tsx src/components/admin/content/PaymentMethodsManagement.test.tsx
git commit -m "feat: add payment methods admin management UI"
```

---

### Task 11: Admin route wiring

**Files:**
- Create: `src/routes/admin/payment-methods.tsx`
- Modify: `src/lib/admin/access.ts`

- [ ] **Step 1: Add a nav-item mapping**

`payment-methods` is a new admin nav item tied to the existing `"payments"` access area (not `"contentManagement"` — a `treasurer` does not have `contentManagement`, and this page must be reachable by treasurers). In `src/lib/admin/access.ts`, find `NAV_ITEM_AREAS` (around line 74-96) and add one line:

```ts
  "payment-methods": "payments",
```

- [ ] **Step 2: Write the route**

`src/routes/admin/payment-methods.tsx` — a flat top-level route (like `admin/faq.tsx`), **not** nested under `/admin/content/` (that layout's own `beforeLoad` hard-requires `contentManagement`, which would block treasurers before this route's own check ever runs):

```tsx
import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { PaymentMethodsManagement } from "../../components/admin/content/PaymentMethodsManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/payment-methods")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("payments", context.queryClient);
  },
  component: AdminPaymentMethodsPage,
});

export function AdminPaymentMethodsPage() {
  return (
    <AdminLayout activeSection="payments">
      <PaymentMethodsManagement />
    </AdminLayout>
  );
}
```

- [ ] **Step 3: Run typecheck, regenerate the route tree**

Run: `bun run dev`, wait for it to report ready, stop it (`Ctrl+C` or kill the process) — this regenerates `src/routeTree.gen.ts` to include the new route.
Run: `bunx tsc --noEmit` — expect no errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin/payment-methods.tsx src/lib/admin/access.ts src/routeTree.gen.ts
git commit -m "feat: wire the payment methods admin page under the payments access area"
```

---

### Task 12: Full verification gate, real Postgres re-check, and PR

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `bun test` — all tests pass, including everything from Tasks 1-11.

- [ ] **Step 2: Full lint**

Run: `bun run lint` — 0 errors.

- [ ] **Step 3: Full typecheck**

Run: `bunx tsc --noEmit` — no errors.

- [ ] **Step 4: Build**

Run: `bun run build` — succeeds.

- [ ] **Step 5: Full four-eyes workflow re-verification against a real Postgres container**

This repeats Task 1 Step 2's individual checks end-to-end through the actual application layers (repository → service → http), not just raw SQL, to prove the whole stack — not just the migration in isolation — enforces the treasurer-gated four-eyes rule. Using a fresh `postgres:16-alpine` container with every migration applied (same recipe as Task 1 Step 2):

1. Seed three `admin_user` rows directly via `psql`: one `staff`, two `treasurer` (call them treasurer-A and treasurer-B).
2. Using the actual `createSupabasePaymentPublicConfigRepository`/`createPaymentPublicConfigService` (pointed at this container via a real `SupabaseClient`, service-role key), as the `staff` actor: `createDraft` for a new method configuration, then `submit` it.
3. As `treasurer-A`: call `service.publish(...)`. This should succeed (treasurer-A never submitted this row — staff did).
4. Create and submit a second draft, this time submitted BY treasurer-A directly (skip the staff hop), then attempt `service.publish(...)` as treasurer-A again — must reject with a `PaymentPublicConfigError` whose `code` is `"forbidden"`.
5. Have treasurer-B publish that same row — must succeed.
6. Confirm via a direct `select` that exactly one row per `method` has `state = 'published'` at any time (the unique index holds) and that the previously-published row for that method is now `archived`.

Report the exact output of each step. If any step behaves differently than described, stop and fix the underlying code — this is the load-bearing security property of the whole feature.

- [ ] **Step 6: Manually verify `/donate` and the admin page in local dev**

Run `bun run dev` (with `.env.local` present), open `/donate` and confirm the five methods render identically to how they render on `main` today (same order, same labels) — this proves the seed migration achieved zero visible change. Then open `/admin/payment-methods` signed in as a `treasurer`-role admin user, and confirm the page loads (proving the `"payments"` access-area gating works for treasurer, unlike `contentManagement`-gated pages).

- [ ] **Step 7: Push and open a PR**

```bash
git push -u origin feat/payment-public-config
gh pr create --title "feat: add payment_public_config with treasurer-gated four-eyes approval" --body "$(cat <<'EOF'
## Summary
- Replaces `/donate`'s hardcoded payment-method list with a database-backed `payment_public_config` table — no code deploy needed to change what visitors see, and a real approval step over content that tells donors where their money goes.
- Uses this repo's existing `treasurer` admin role (already used throughout the payments/donations/supporters domain) as the actual four-eyes approval gate: staff/treasurer/admin can draft and submit a change, but only a treasurer or admin who is **not** the submitter can publish it — enforced server-side in the RPC, not just in the UI.
- Ships with zero visible change: a seed migration marks the five currently-live methods as already-published with today's exact labels and order.
- New admin page at `/admin/payment-methods`, gated on the existing `"payments"` access area specifically so treasurers (who lack `contentManagement`) can reach it.

Spec: docs/superpowers/specs/2026-08-31-payment-public-config-design.md
Plan: docs/superpowers/plans/2026-08-31-payment-public-config.md

## Test plan
- [x] `bun test` — full suite passes
- [x] `bun run lint` — 0 errors
- [x] `bunx tsc --noEmit` — clean
- [x] `bun run build` — succeeds
- [x] Real Postgres container verification of the full treasurer-gated four-eyes workflow (staff drafts → treasurer-A publishes; treasurer-A drafts → treasurer-A publish rejected; treasurer-B publishes successfully)
- [x] Manually verified `/donate` renders identically to `main` and `/admin/payment-methods` is reachable by a treasurer-role admin

Out of scope (explicitly, per the design spec): suggested donation amounts, the AlipayHK→COD provider mapping, `VITE_PUBLIC_DONATION_CHECKOUT_ENABLED`, and enabling any method beyond the five already live today.
EOF
)"
```

- [ ] **Step 8: Report the PR URL and stop**

Do not merge — wait for tech lead review, matching this repo's established release process (a merge to `main` is a production deploy).
