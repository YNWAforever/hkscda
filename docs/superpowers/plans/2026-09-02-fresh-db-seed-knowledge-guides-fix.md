# Self-Healing Fallback for `seed_knowledge_guides` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `supabase/migrations/20260718121000_seed_knowledge_guides.sql` self-healing on a genuinely fresh database, instead of unconditionally raising an exception and aborting migration replay.

**Architecture:** Edit the migration's single `do $$` block: when the published `post_adoption_guide` slot lookup returns null for a language, insert a placeholder `document_assets` row and a `site_document_slots` row for that language (marked `is_published = true`) before proceeding, instead of raising. Already-migrated environments (staging/production) never re-run this migration, so this only changes behavior for a fresh apply.

**Tech Stack:** PostgreSQL (Supabase migration SQL), Bun test.

---

## File Structure

**Modify:**
- `supabase/migrations/20260718121000_seed_knowledge_guides.sql` — add the self-healing branches.
- `src/lib/supabaseMigrations.test.ts` — add a test asserting the self-healing SQL is present.

---

### Task 1: Make the migration self-healing, with a content test

**Files:**
- Modify: `supabase/migrations/20260718121000_seed_knowledge_guides.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `src/lib/supabaseMigrations.test.ts`, inside the existing `describe("supabase migration safety", ...)` block (after any existing test — exact position doesn't matter, this repo's tests in this file aren't order-dependent):

```ts
  test("seeds a placeholder post-adoption-guide document on a fresh database instead of raising", () => {
    const sql = readMigration("20260718121000_seed_knowledge_guides.sql");

    // The unconditional raise is gone -- both languages now get a
    // self-healing branch instead.
    expect(sql).not.toContain("raise exception 'Missing published zh-HK");
    expect(sql).not.toContain("raise exception 'Missing published en");

    expect(sql).toContain("if zh_asset_id is null then");
    expect(sql).toContain("if en_asset_id is null then");
    expect(sql).toContain("insert into public.document_assets (");
    expect(sql).toContain("insert into public.site_document_slots (");
    expect(sql).toContain("'placeholder/post-adoption-guide-zh-hk.pdf'");
    expect(sql).toContain("'placeholder/post-adoption-guide-en.pdf'");
    expect(sql).toContain("returning id into zh_asset_id");
    expect(sql).toContain("returning id into en_asset_id");

    // The final knowledge_posts insert/upsert is unchanged.
    expect(sql).toContain("insert into public.knowledge_posts (");
    expect(sql).toContain("on conflict (document_asset_id) where document_asset_id is not null do update set");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: FAIL on the new test — the current migration file still contains `raise exception 'Missing published zh-HK post_adoption_guide document slot';` and has no `document_assets`/`site_document_slots` insert branches.

- [ ] **Step 3: Rewrite the migration**

The current full content of `supabase/migrations/20260718121000_seed_knowledge_guides.sql` is:

```sql
do $$
declare
  zh_asset_id uuid;
  en_asset_id uuid;
begin
  select document_asset_id
    into zh_asset_id
  from public.site_document_slots
  where slot_key = 'post_adoption_guide'
    and language = 'zh-HK'
    and is_published = true;

  select document_asset_id
    into en_asset_id
  from public.site_document_slots
  where slot_key = 'post_adoption_guide'
    and language = 'en'
    and is_published = true;

  if zh_asset_id is null then
    raise exception 'Missing published zh-HK post_adoption_guide document slot';
  end if;
  if en_asset_id is null then
    raise exception 'Missing published en post_adoption_guide document slot';
  end if;

  insert into public.knowledge_posts (
    title,
    topic,
    short_intro,
    document_asset_id,
    source_name,
    is_published,
    sort_order
  )
  values
    (
      '領養後須知',
      'adoption',
      '領養後照顧及適應期的重要資訊。',
      zh_asset_id,
      'HKSCDA',
      true,
      10
    ),
    (
      'What you need to know after adopting a cat',
      'adoption',
      'A practical guide for settling in and caring for a newly adopted cat.',
      en_asset_id,
      'HKSCDA',
      true,
      11
    )
  on conflict (document_asset_id) where document_asset_id is not null do update set
    title = excluded.title,
    topic = excluded.topic,
    short_intro = excluded.short_intro,
    source_name = excluded.source_name,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order,
    updated_at = now();
end $$;
```

Replace it with (the two `select ... into` queries and the final `knowledge_posts` insert are byte-identical to before; only the two `if ... is null then` blocks change from a bare `raise exception` to a self-healing insert):

```sql
do $$
declare
  zh_asset_id uuid;
  en_asset_id uuid;
begin
  select document_asset_id
    into zh_asset_id
  from public.site_document_slots
  where slot_key = 'post_adoption_guide'
    and language = 'zh-HK'
    and is_published = true;

  select document_asset_id
    into en_asset_id
  from public.site_document_slots
  where slot_key = 'post_adoption_guide'
    and language = 'en'
    and is_published = true;

  -- On a genuinely fresh database (local dev, CI, a disaster-recovery
  -- restore drill) no document has ever been published into this slot --
  -- that only happens through the admin CMS release workflow added later
  -- (20260731120000_adoption_guide_release_cms.sql). Rather than aborting
  -- migration replay entirely, create a placeholder document + slot so a
  -- fresh database ends up with a real (if placeholder) published guide,
  -- matching the schema's own invariants. Staging/production already have
  -- this migration recorded as applied against a real published document,
  -- so this branch never runs there -- Supabase never re-applies a
  -- migration that has already succeeded.
  if zh_asset_id is null then
    insert into public.document_assets (
      kind, title, language, object_path, byte_size, is_published
    )
    values (
      'adoption_guide',
      '領養後須知（預設佔位文件）',
      'zh-HK',
      'placeholder/post-adoption-guide-zh-hk.pdf',
      1,
      true
    )
    returning id into zh_asset_id;

    insert into public.site_document_slots (
      slot_key, language, document_asset_id, is_published
    )
    values (
      'post_adoption_guide', 'zh-HK', zh_asset_id, true
    );
  end if;

  if en_asset_id is null then
    insert into public.document_assets (
      kind, title, language, object_path, byte_size, is_published
    )
    values (
      'adoption_guide',
      'Post-adoption guide (placeholder)',
      'en',
      'placeholder/post-adoption-guide-en.pdf',
      1,
      true
    )
    returning id into en_asset_id;

    insert into public.site_document_slots (
      slot_key, language, document_asset_id, is_published
    )
    values (
      'post_adoption_guide', 'en', en_asset_id, true
    );
  end if;

  insert into public.knowledge_posts (
    title,
    topic,
    short_intro,
    document_asset_id,
    source_name,
    is_published,
    sort_order
  )
  values
    (
      '領養後須知',
      'adoption',
      '領養後照顧及適應期的重要資訊。',
      zh_asset_id,
      'HKSCDA',
      true,
      10
    ),
    (
      'What you need to know after adopting a cat',
      'adoption',
      'A practical guide for settling in and caring for a newly adopted cat.',
      en_asset_id,
      'HKSCDA',
      true,
      11
    )
  on conflict (document_asset_id) where document_asset_id is not null do update set
    title = excluded.title,
    topic = excluded.topic,
    short_intro = excluded.short_intro,
    source_name = excluded.source_name,
    is_published = excluded.is_published,
    sort_order = excluded.sort_order,
    updated_at = now();
end $$;
```

**Outcome (2026-09-02):** Code quality review of the initial implementation (commit `33be212`) found that inserting the placeholder rows with `is_published = true` (as shown in the code block above) was genuinely servable to a real visitor if a fresh database were ever hit by real traffic, and that `false` closes that exposure with zero functional cost (the real publish RPC finds the slot unconditionally regardless of `is_published`, and the public listing already filters on it). Fixed in commit `e1807d3` — the shipped migration uses `is_published = false` in all 4 places (both `document_assets` and `site_document_slots` inserts, both languages), not `true` as shown above.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: PASS, including the new test.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 6: Manually verify against a real fresh Supabase CLI local stack**

This is the step that actually proves the fix — the unit test only checks the SQL text's shape, not that it's valid, executable SQL. A Supabase CLI project is already initialized in this worktree (`supabase/config.toml` exists, with ports remapped to the 55320-55329 range to avoid colliding with other unrelated local Supabase stacks already running on this machine — check `supabase/config.toml` for the exact ports before running these commands, and confirm with `docker ps` that ports in that range aren't already bound by something else if this environment has changed since the plan was written).

```bash
bunx supabase start
```

Expected: this now completes successfully all the way through migration `20260831160000_content_media_storage_bucket.sql` (the last migration in this repo's history at plan-writing time — if newer migrations have landed since, expect it to complete through those too), with no `LegacyMigrationApplyError`. Previously this failed with `Missing published zh-HK post_adoption_guide document slot` partway through.

If it fails with a *different* migration error further along in the sequence, that's a separate, new problem outside this task's scope (this task only fixes the one specific `20260718121000` failure) — report it rather than trying to fix it as part of this task.

- [ ] **Step 7: Tear down the local stack**

```bash
bunx supabase stop
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260718121000_seed_knowledge_guides.sql src/lib/supabaseMigrations.test.ts
git commit -m "fix: make seed_knowledge_guides self-healing on a fresh database

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
