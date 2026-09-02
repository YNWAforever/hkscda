# Fix `adoption_rules_care_topics`'s Fresh-Database Blocker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `supabase/migrations/20260830130000_adoption_rules_care_topics.sql`'s fresh-database blocker by converting all 12 `E'...'` escape-string literals to standard `'...'` literals.

**Architecture:** Pure syntax normalization — replace each `E'...'` literal with a standard `'...'` literal, doubling any internal `\'` to `''`. No semantic change to any inserted value.

**Tech Stack:** PostgreSQL (Supabase migration SQL), Bun test.

---

## File Structure

**Modify:**
- `supabase/migrations/20260830130000_adoption_rules_care_topics.sql` — convert all 12 `E'...'` literals.
- `src/lib/supabaseMigrations.test.ts` — add a test asserting no `E'` literal remains in this file.

---

### Task 1: Convert all `E'...'` literals, with a content test

**Files:**
- Modify: `supabase/migrations/20260830130000_adoption_rules_care_topics.sql`
- Modify: `src/lib/supabaseMigrations.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `src/lib/supabaseMigrations.test.ts`, inside the existing `describe("supabase migration safety", ...)` block:

```ts
  test("uses standard-quoted string literals, not E-prefixed escape strings, in adoption rules and care topics", () => {
    const sql = readMigration("20260830130000_adoption_rules_care_topics.sql");

    // E'...' escape-string literals with a backslash-escaped apostrophe
    // confuse the Supabase CLI's migration statement splitter, merging
    // this file's two top-level insert statements into one chunk and
    // causing "cannot insert multiple commands into a prepared statement"
    // on a fresh database replay. Standard '...' literals with doubled
    // apostrophes ('') avoid the ambiguity entirely.
    expect(sql).not.toMatch(/E'/);

    // The actual English content must be unchanged (apostrophes now
    // doubled instead of backslash-escaped).
    expect(sql).toContain("this page''s latest adoption fee table");
    expect(sql).toContain("the association''s approval");
    expect(sql).toContain("the animal''s physical and behavioural traits");
    expect(sql).toContain("the cat''s anxiety");
    expect(sql).toContain("don''t rush introductions");
    expect(sql).toContain("your cat''s eating and toileting habits");
    expect(sql).toContain("your dog''s size and age");
    expect(sql).toContain("your dog''s eating and behaviour");
    expect(sql).toContain("where it''s permitted");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: FAIL — the migration file still contains 12 `E'` literals with backslash-escaped apostrophes, so `not.toMatch(/E'/)` fails, and none of the `''`-doubled substrings exist yet.

- [ ] **Step 3: Convert all 12 `E'...'` literals**

Apply these exact 12 substitutions to `supabase/migrations/20260830130000_adoption_rules_care_topics.sql`. Each is a single-line find-and-replace; nothing else on any of these lines or anywhere else in the file changes.

**1.** Current:
```
 E'Applicants must pay the relevant fees according to this page\'s latest adoption fee table before adoption.', 2),
```
Replace with:
```
 'Applicants must pay the relevant fees according to this page''s latest adoption fee table before adoption.', 2),
```

**2.** Current:
```
 E'If you rent your home, you must provide written proof that your landlord permits keeping pets.', 6),
```
Replace with:
```
 'If you rent your home, you must provide written proof that your landlord permits keeping pets.', 6),
```

**3.** Current:
```
 E'Applicants must agree to follow-up home visits by the association to confirm the animal is well cared for.', 7),
```
Replace with:
```
 'Applicants must agree to follow-up home visits by the association to confirm the animal is well cared for.', 7),
```

**4.** Current:
```
 E'Each household may adopt up to two animals (exceptions require the association\'s approval).', 8),
```
Replace with:
```
 'Each household may adopt up to two animals (exceptions require the association''s approval).', 8),
```

**5.** Current:
```
 E'Applicants must understand and accept the animal\'s physical and behavioural traits, and care for it with patience.', 9),
```
Replace with:
```
 'Applicants must understand and accept the animal''s physical and behavioural traits, and care for it with patience.', 9),
```

**6.** Current:
```
 E'The association reserves the right to decline unsuitable applications without giving a reason.', 11)
```
Replace with:
```
 'The association reserves the right to decline unsuitable applications without giving a reason.', 11)
```

**7.** Current:
```
 E'Provide a safe indoor environment for your cat. Install protective netting to prevent falls or escapes through windows. Remove toxic plants and hazardous items from your home. Provide enough hiding spots and elevated resting spaces.', 0),
```
Replace with:
```
 'Provide a safe indoor environment for your cat. Install protective netting to prevent falls or escapes through windows. Remove toxic plants and hazardous items from your home. Provide enough hiding spots and elevated resting spaces.', 0),
```

**8.** Current:
```
 E'Please bring your own carrier on collection day. A towel over the carrier can help reduce the cat\'s anxiety. Once home, let the cat settle into a quiet room at its own pace — don\'t rush introductions to other pets.', 1),
```
Replace with:
```
 'Please bring your own carrier on collection day. A towel over the carrier can help reduce the cat''s anxiety. Once home, let the cat settle into a quiet room at its own pace — don''t rush introductions to other pets.', 1),
```

**9.** Current:
```
 E'Cats six months or older are considered adults. Vaccinate and have a health check every year. Deworm regularly (internal and external parasites). Watch your cat\'s eating and toileting habits, and see a vet promptly if anything seems unusual.', 4),
```
Replace with:
```
 'Cats six months or older are considered adults. Vaccinate and have a health check every year. Deworm regularly (internal and external parasites). Watch your cat''s eating and toileting habits, and see a vet promptly if anything seems unusual.', 4),
```

**10.** Current:
```
 E'Provide quality dog food suited to your dog\'s size and age. Always have fresh water available. Avoid onion, garlic, chocolate, grapes, and overly salty food.', 2),
```
Replace with:
```
 'Provide quality dog food suited to your dog''s size and age. Always have fresh water available. Avoid onion, garlic, chocolate, grapes, and overly salty food.', 2),
```

**11.** Current:
```
 E'Vaccinate and deworm every year. Have regular veterinary checks. Watch for changes in your dog\'s eating and behaviour.', 5),
```
Replace with:
```
 'Vaccinate and deworm every year. Have regular veterinary checks. Watch for changes in your dog''s eating and behaviour.', 5),
```

**12.** Current:
```
 E'Walk your dog daily to provide adequate exercise. Always use a leash and dog tag outdoors. Only let your dog off-leash where it\'s permitted.', 6),
```
Replace with:
```
 'Walk your dog daily to provide adequate exercise. Always use a leash and dog tag outdoors. Only let your dog off-leash where it''s permitted.', 6),
```

After all 12 substitutions, run `grep -n "E'" supabase/migrations/20260830130000_adoption_rules_care_topics.sql` — expected: no matches (exit code 1).

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/supabaseMigrations.test.ts`
Expected: PASS, including the new test.

- [ ] **Step 5: Run the full test suite, typecheck, and lint**

Run: `bun test && bunx tsc --noEmit && bun run lint`
Expected: all pass, no errors.

- [ ] **Step 6: Manually verify against a real fresh Supabase CLI local stack**

A Supabase CLI project needs to be initialized in this worktree (it won't exist yet — this is a fresh worktree, separate from any other worktree's local setup):

```bash
bunx supabase init --workdir .
```

Before starting, check `docker ps --format "{{.Ports}}"` for currently-bound ports — this machine runs other, unrelated Supabase/Postgres stacks for unrelated projects. Do NOT touch or stop any container you didn't start yourself. Pick a free 10-port block (55320-55329 was free as of this plan's writing, but re-verify) and edit `supabase/config.toml`'s port fields (`[api] port`, `[db] port` + `shadow_port`, `[db.pooler] port`, `[studio] port`, `[inbucket] port`, the analytics `port` near the bottom of the file) to that block. Also set `project_id = "hkscda"`.

Then:

```bash
bunx supabase start
```

Expected: migration replay now proceeds past `20260830130000_adoption_rules_care_topics.sql` (previously the failure point, with `cannot insert multiple commands into a prepared statement`) and continues through the rest of this repo's migration history. If it completes fully with no errors, that's the ideal outcome. If a *different*, later migration fails, that's a separate, new problem outside this task's scope — report it as a concern in your final report rather than trying to fix it yourself, exactly as the previous fresh-DB fix task did when it found this migration's own blocker.

- [ ] **Step 7: Tear down the local stack**

```bash
bunx supabase stop
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260830130000_adoption_rules_care_topics.sql src/lib/supabaseMigrations.test.ts
git commit -m "fix: use standard-quoted string literals in adoption_rules_care_topics

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

**Important:** Do NOT `git add` `supabase/config.toml` or any other file created by `supabase init` (e.g. `supabase/.gitignore`, `.temp/`) — these are out of scope for this task. Run `git status --porcelain` before committing to confirm only the 2 files above are staged.
