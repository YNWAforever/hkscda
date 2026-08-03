# Admin Write-Path Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trace all 9 write sites in `ContentEditor` and `AnimalPipeline` back to their sources, and fix any data-correctness bugs found.

**Architecture:** Read-only investigation first (Tasks 1–9), one write site per task, each answering the same six questions and appending to a findings file. Then a triage gate (Task 10), then contingent fix tasks whose content depends on what was found.

**Tech Stack:** TypeScript, React 19, TanStack Query/Router, `bun test`, `renderToStaticMarkup` for SSR assertions, `pg` over the Supabase session pooler for production corroboration.

---

## A note on this plan's shape

This plan cannot follow the usual "show the complete code in every step" rule for
its second half, and pretending otherwise would produce fiction. Tasks 1–9 are an
investigation: their output is knowledge, not code. The fix tasks that follow
depend on what that investigation finds, so they are specified as a **template**
— exact TDD structure, exact commands, exact file paths — with the defect-specific
content filled in at execution time from the findings file.

Tasks 1–9 are fully deterministic and can be executed exactly as written. Do not
skip them to get to the fixes; the findings file is the input to everything after
Task 10.

If Tasks 1–9 produce no P0 or P1 findings, **that is a valid completion.** Go
straight from Task 10 to Task 14. Do not manufacture work.

---

## File Structure

**Created:**

- `docs/superpowers/plans/2026-08-04-write-path-findings.md` — the findings
  ledger. One section per write site, 6 answers each. This is the deliverable of
  Tasks 1–9 and the input to Task 10.

**Modified (only if findings warrant):**

- `src/components/admin/content/ContentEditor.tsx`
- `src/components/admin/adoptions/AnimalPipeline.tsx`

**Test files (only if findings warrant):**

- `src/components/admin/content/ContentEditor.test.tsx` (exists — extend)
- `src/components/admin/adoptions/AnimalPipeline.test.tsx` (create if needed)

---

## The Six Questions

Every trace task answers exactly these, in this order. Copy them verbatim into
each findings section.

1. **Target identity** — what identifies the record being written? A row passed
   into the handler, state read at call time, or a value closed over?
2. **Freshness** — can that identifier be stale relative to what is rendered?
3. **Payload provenance** — for each payload field, where did it come from, and
   is it seeded from the same record the identifier points at?
4. **Reset discipline** — if the payload draws on component state, what resets
   that state when the target changes?
5. **Failure handling** — on error, is the operator told, or does the UI look as
   though it saved? Is optimistic state rolled back?
6. **Guard** — is the write destructive, and is it confirmed or status-gated?

**Classification:**

| Class | Meaning |
| --- | --- |
| P0 | Writes to the wrong record, or writes wrong data |
| P1 | Silent failure; operator believes the write succeeded |
| P2 | Unguarded destructive action |
| P3 | Raw enums, missing labels, absent detail |
| OK | No defect |

---

### Task 1: Create the findings ledger

**Files:**
- Create: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

- [ ] **Step 1: Create the file with all nine sections stubbed**

```markdown
# Write-Path Trace Findings

Sites traced against `ContentEditor.tsx` and `AnimalPipeline.tsx` as of commit
<FILL IN: output of `git rev-parse --short HEAD`>.

Classification: P0 wrong record/data · P1 silent failure · P2 unguarded
destructive · P3 cosmetic · OK no defect.

## ContentEditor

### Site 1 — `publishContent.mutate()` (ContentEditor.tsx:316)
### Site 2 — `archiveContent.mutate()` (ContentEditor.tsx:325)
### Site 3 — `generateNotificationDrafts.mutate(updateId)` (ContentEditor.tsx:364)
### Site 4 — `generateSocialCopy.mutate()` (ContentEditor.tsx:370)
### Site 5 — `updateCopyStatus.mutate({ copyId, status })` (ContentEditor.tsx:371)
### Site 6 — `updateDraftStatus.mutate({ draftId, status })` (ContentEditor.tsx:379)

## AnimalPipeline

### Site 7 — `saveProfileMutation.mutate(profileForm)` (AnimalPipeline.tsx:465)
### Site 8 — `lifecycleMutation.mutate(...)` desktop row (AnimalPipeline.tsx:553)
### Site 9 — `lifecycleMutation.mutate(...)` mobile card (AnimalPipeline.tsx:678)

## Summary

| Site | Class | One-line |
| --- | --- | --- |
```

- [ ] **Step 2: Fill in the commit hash**

Run: `git rev-parse --short HEAD`
Replace `<FILL IN: ...>` with the output. Line numbers drift; the hash makes
this ledger reproducible.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: open the write-path findings ledger"
```

---

### Task 2: Trace Site 1 — `publishContent`

**Files:**
- Read: `src/components/admin/content/ContentEditor.tsx:130-141` (mutation definition)
- Read: `src/components/admin/content/ContentEditor.tsx:316` (call site)
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

- [ ] **Step 1: Read the mutation definition and its call site**

Run: `sed -n '130,141p;310,320p' src/components/admin/content/ContentEditor.tsx`

- [ ] **Step 2: Follow the identifier to its origin**

The mutation body will reference a content id. Find where that value is
declared and whether it is a prop, state, or closure capture:

Run: `grep -n 'contentId' src/components/admin/content/ContentEditor.tsx | head -20`

- [ ] **Step 3: Answer the six questions in the ledger**

Append to the `### Site 1` section. Write the actual answer to each numbered
question, then a classification line:

```markdown
1. **Target identity:** <answer>
2. **Freshness:** <answer>
3. **Payload provenance:** <answer>
4. **Reset discipline:** <answer>
5. **Failure handling:** <answer>
6. **Guard:** <answer>

**Class:** OK | P0 | P1 | P2 | P3 — <one line>
```

Answer from what the code actually does. "OK" is an expected and common answer.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: trace write site 1 (publishContent)"
```

---

### Task 3: Trace Site 2 — `archiveContent`

**Files:**
- Read: `src/components/admin/content/ContentEditor.tsx:142-153`, `:325`
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

- [ ] **Step 1: Read the mutation definition and its call site**

Run: `sed -n '142,153p;320,330p' src/components/admin/content/ContentEditor.tsx`

- [ ] **Step 2: Check the guard specifically**

Archiving is destructive-adjacent. Determine whether it confirms:

Run: `grep -n 'confirm\|AlertDialog\|archiveContent' src/components/admin/content/ContentEditor.tsx`

- [ ] **Step 3: Answer the six questions in the ledger**

Append to `### Site 2` using the same format as Task 2 Step 3.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: trace write site 2 (archiveContent)"
```

---

### Task 4: Trace Site 3 — `generateNotificationDrafts`

**Files:**
- Read: `src/components/admin/content/ContentEditor.tsx:221-235`, `:364`
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

- [ ] **Step 1: Read the mutation definition and its call site**

Run: `sed -n '221,235p;360,368p' src/components/admin/content/ContentEditor.tsx`

- [ ] **Step 2: Trace `updateId` back to the component that supplies it**

This site takes an argument from a child component. Find which child, and
whether the id it passes is guaranteed to belong to the currently open content
item:

Run: `grep -n 'onGenerateDrafts' src/components/admin/content/*.tsx`

- [ ] **Step 3: Answer the six questions in the ledger**

Append to `### Site 3`. Pay particular attention to question 3 — this site
writes rows addressed to adopters, so a wrong `updateId` produces messages
about the wrong animal.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: trace write site 3 (generateNotificationDrafts)"
```

---

### Task 5: Trace Site 4 — `generateSocialCopy`

**Files:**
- Read: `src/components/admin/content/ContentEditor.tsx:199-208`, `:370`
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

- [ ] **Step 1: Read the mutation definition and its call site**

Run: `sed -n '199,208p;366,373p' src/components/admin/content/ContentEditor.tsx`

- [ ] **Step 2: Determine what selects the story update it generates against**

Run: `grep -n 'storyUpdateId\|selectedUpdate' src/components/admin/content/ContentEditor.tsx | head -20`

- [ ] **Step 3: Answer the six questions in the ledger**

Append to `### Site 4`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: trace write site 4 (generateSocialCopy)"
```

---

### Task 6: Trace Sites 5 and 6 — the two status updaters

**Files:**
- Read: `src/components/admin/content/ContentEditor.tsx:209-220` (copy status), `:236-250` (draft status), `:371`, `:379`
- Read: `src/components/admin/content/SocialCopyPanel.tsx`, `src/components/admin/content/NotificationDraftPanel.tsx`
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

These two share a shape — an id plus a status, both supplied by a child panel —
so trace them together and record them separately.

- [ ] **Step 1: Read both mutation definitions and both call sites**

Run: `sed -n '209,250p;368,381p' src/components/admin/content/ContentEditor.tsx`

- [ ] **Step 2: Check the child panels for where the id comes from**

Run: `grep -n 'onUpdateStatus' src/components/admin/content/SocialCopyPanel.tsx src/components/admin/content/NotificationDraftPanel.tsx`

The question that matters: is the id taken from the row being rendered (safe) or
from panel-level state (suspect)?

- [ ] **Step 3: Answer the six questions for each, in the ledger**

Append to `### Site 5` and `### Site 6` separately, even where the answers match.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: trace write sites 5 and 6 (status updaters)"
```

---

### Task 7: Trace Site 7 — `saveProfileMutation`

**Files:**
- Read: `src/components/admin/adoptions/AnimalPipeline.tsx:367-380`, `:440-470`
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

This is the highest-risk site in the sweep. It is the closest structural match to
the `adminNotes` bug: a form (`profileForm`) held in parent state, populated from
a selected row, and submitted with an identifier drawn from the form itself
(`profile.animal_id`) rather than from the current selection.

- [ ] **Step 1: Read the mutation, the open/close handlers, and the submit**

Run: `sed -n '367,380p;440,470p' src/components/admin/adoptions/AnimalPipeline.tsx`

- [ ] **Step 2: Establish every path that sets or clears `profileForm`**

Run: `grep -n 'setProfileForm\|profileForm' src/components/admin/adoptions/AnimalPipeline.tsx`

Answer specifically: can `profileForm` hold animal A's data while the dialog
displays animal B? Check whether every path that changes `selectedAnimalId` also
sets `profileForm`, including the effect at line 382.

- [ ] **Step 3: Answer the six questions in the ledger**

Append to `### Site 7`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: trace write site 7 (saveProfileMutation)"
```

---

### Task 8: Trace Sites 8 and 9 — the lifecycle status writes

**Files:**
- Read: `src/components/admin/adoptions/AnimalPipeline.tsx:353-365`, `:545-560`, `:670-685`
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

Sites 8 and 9 are the same mutation invoked from two renderers — the desktop
table row and the mobile card. Trace both; a divergence between them is itself a
finding.

- [ ] **Step 1: Read the mutation and both call sites**

Run: `sed -n '353,365p;545,560p;670,685p' src/components/admin/adoptions/AnimalPipeline.tsx`

- [ ] **Step 2: Confirm the identifier source at each**

Both pass `row.id`. Verify that `row` is the row being rendered in each case and
not a captured outer variable:

Run: `grep -n 'lifecycleMutation' src/components/admin/adoptions/AnimalPipeline.tsx`

- [ ] **Step 3: Check failure handling**

`lifecycleMutation` has an `onSuccess` but check for `onError`. A status dropdown
that silently reverts on failure is a P1:

Run: `grep -n 'onError\|isError' src/components/admin/adoptions/AnimalPipeline.tsx`

- [ ] **Step 4: Answer the six questions for each, in the ledger**

Append to `### Site 8` and `### Site 9`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: trace write sites 8 and 9 (lifecycle status)"
```

---

### Task 9: Complete the summary table

**Files:**
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

- [ ] **Step 1: Fill the summary table with all nine rows**

```markdown
| Site | Class | One-line |
| --- | --- | --- |
| 1 publishContent | OK | ... |
| 2 archiveContent | ... | ... |
| ... | ... | ... |
```

- [ ] **Step 2: Verify all 54 answers exist**

Run: `grep -c '^[1-6]\. \*\*' docs/superpowers/plans/2026-08-04-write-path-findings.md`
Expected: `54`

If fewer, a site was skipped. Go back and complete it. This is the stopping rule
from the spec — every question answered, including the ones answered "OK".

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: complete the write-path findings summary"
```

---

### Task 10: Triage gate

**Files:**
- Read: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

- [ ] **Step 1: Count findings by class**

Run: `grep -oE '\*\*Class:\*\* (P0|P1|P2|P3|OK)' docs/superpowers/plans/2026-08-04-write-path-findings.md | sort | uniq -c`

- [ ] **Step 2: Decide the route**

- **Any P0 or P1 in AnimalPipeline** → Task 11 (production corroboration), then Task 12 per finding.
- **Any P0 or P1 in ContentEditor only** → skip Task 11, go to Task 12 per finding.
- **Only P2/P3** → skip to Task 13.
- **All OK** → skip to Task 14. This is a valid outcome. Report it as a clean
  result; do not invent findings to justify the sweep.

- [ ] **Step 3: Report the counts to the user before proceeding**

State the counts plainly, including zeros. If the sweep found nothing, say so.

---

### Task 11: Corroborate an AnimalPipeline P0 against production (conditional)

**Only run if Task 10 found a P0 or P1 in AnimalPipeline.**

**Files:**
- Read: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

Read the spec's Verification section before starting. `AnimalPipeline` writes
through the API, so `log_animal_mutation` skips it — there are **no `{from, to}`
diffs** for this screen. Available evidence is the app-layer rows
(`animals.status_update`, `animal_profile_internal.upsert`) carrying
`actor_user_id`, `entity_id` and the resulting record.

- [ ] **Step 1: Query for temporal anomalies per actor**

The connection string is at
`/private/tmp/.../scratchpad/.pgurl` (see the `hkscda-supabase-access` memory;
the direct host is IPv6-only, use the `aws-1` pooler). The query helper is
`q.mjs` in the same directory.

```sql
select actor_user_id, entity_id, action, timestamp
  from public.audit_log
 where action in ('animals.status_update', 'animal_profile_internal.upsert')
 order by actor_user_id, timestamp;
```

- [ ] **Step 2: Look for the signature of a stale-identifier write**

Two writes by the same actor, seconds apart, against different `entity_id`s —
consistent with a form retaining one animal while the operator viewed another.

- [ ] **Step 3: Record the result in the ledger**

Append under the relevant site: either "corroborated: N occurrences since
<date>" or "no corroborating evidence in audit_log". **A negative result does not
disprove the bug** — these rows only start on 2026-08-04, when the app-layer
audit was added. Say so explicitly rather than implying the code is clean.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: corroborate write-path finding against production audit_log"
```

---

### Task 12: Fix one P0/P1 finding (repeat per finding)

**Only run for findings classified P0 or P1.**

**Files:**
- Modify: the component named in the finding
- Test: `src/components/admin/content/ContentEditor.test.tsx` or
  `src/components/admin/adoptions/AnimalPipeline.test.tsx`

The defect content comes from the ledger. The structure below is fixed.

- [ ] **Step 1: Write the failing test**

Use the established pattern. Copy this scaffold and fill in the assertion for the
specific defect:

```tsx
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const realReactQuery = await import("@tanstack/react-query");
const realReactRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: () => {} }),
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false, reset: () => {} }),
  useQuery: () => ({ data: undefined, error: null, isLoading: false, isFetching: false }),
}));

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const { ComponentUnderTest } = await import("./ComponentUnderTest");

describe("<defect name>", () => {
  test("<what must be true>", () => {
    const markup = renderToStaticMarkup(<ComponentUnderTest />);
    expect(markup).toContain("<the value that proves the fix>");
  });
});
```

If the defect is not observable through SSR rendering — for example it depends on
a `useEffect` — **restructure the component so it is**, as was done for
`GroupEnquiryManagement` by replacing an effect-based reset with
`key={record.id}`. Note that restructuring in the commit message; it changes
working code to satisfy a test and a reviewer should see that.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test <path to test file>`
Expected: FAIL, with the assertion showing the current (buggy) value.

A test that passes before the fix is testing the wrong thing. Fix the test, not
the expectation.

- [ ] **Step 3: Apply the minimal fix**

Change only what the finding identified. Do not refactor adjacent code.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test <path to test file>`
Expected: PASS

- [ ] **Step 5: Run the full suite and typecheck**

```bash
bun test
bunx tsc --noEmit
```
Expected: all tests pass, `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add <component> <test file>
git commit -m "fix: <what the defect was, in terms of what an operator would experience>"
```

---

### Task 13: Batch the P2/P3 findings (conditional)

**Only run if Task 10 found P2 or P3 items.**

**Files:**
- Modify: the components named in those findings

- [ ] **Step 1: Apply all P2 and P3 fixes**

P2 (unguarded destructive) gets a `window.confirm` naming the record, matching
the pattern already used in `KnowledgeManagement` and
`AdoptionInformationManagement`:

```tsx
const label = rows.find((row) => row.id === id)?.title ?? "此項目";
if (!window.confirm(`確定刪除「${label}」？此操作無法復原。`)) return;
```

P3 (raw enums, missing labels) gets a `Record<EnumType, string>` label map beside
the component, matching `volunteerAdminLogic.ts` and `groupEnquiryAdminLogic.ts`.

- [ ] **Step 2: Run the full suite, typecheck, and lint**

```bash
bun test
bunx tsc --noEmit
bun run lint
```
Expected: tests pass, `tsc` exits 0, lint exits 0.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix: label and guard the remaining write-path findings"
```

---

### Task 14: Close out

**Files:**
- Modify: `docs/superpowers/plans/2026-08-04-write-path-findings.md`

- [ ] **Step 1: Run every gate**

```bash
bunx tsc --noEmit
bun test
bun run lint
bun run build
```
Expected: `tsc` exits 0, all tests pass, lint exits 0, build succeeds.

- [ ] **Step 2: Record the outcome at the top of the ledger**

State the counts, what was fixed, and what was found clean. If the sweep found
nothing, write that plainly — a clean trace of nine sites is the result, not a
failure of the exercise.

- [ ] **Step 3: Open the pull request**

```bash
git push origin HEAD
gh pr create --base main --title "fix: admin write-path trace" --body-file -
```

The body must contain the full nine-row summary table from the ledger, including
the OK rows. A reader should be able to see what was checked and found clean, not
only what was changed.

- [ ] **Step 4: Commit any final ledger edits**

```bash
git add docs/superpowers/plans/2026-08-04-write-path-findings.md
git commit -m "docs: record write-path trace outcome"
git push origin HEAD
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Trace 9 write sites, 6 questions each | 2–8 |
| Stopping rule: all 54 answered | 9 Step 2 (asserts count is 54) |
| P0/P1 → fix + regression test | 12 |
| P2/P3 → fix inline, batched separately | 13 |
| Report zero findings honestly | 10 Step 3, 14 Step 2 |
| audit_log corroboration, weaker form | 11 |
| Restructure for testability, flagged | 12 Step 1 |
| Findings table in PR body incl. clean rows | 14 Step 3 |
| Branch off main after PR #53 merges | Prerequisite below |

**Placeholders:** The `<FILL IN>` in Task 1 and the `<...>` in Task 12 are
execution-time inputs from the findings file, not unwritten plan content. Every
command, path and scaffold is concrete.

**Type consistency:** No new types are introduced. The test scaffold in Task 12
matches the working pattern in `VolunteerManagement.test.tsx`.

---

## Prerequisite

PR #53 must merge before this branch is taken, so the sweep starts from a clean
`main`. Confirm with `gh pr view 53 --json state`.
