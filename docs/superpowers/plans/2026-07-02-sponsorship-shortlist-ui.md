# 助養 Sponsorship Shortlist UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let visitors add multiple sponsor (助養) animals to the existing public shortlist and act on them via the floating tray, without building any pledge/payment backend.

**Architecture:** The shortlist reducer (`src/lib/publicAdoption/shortlist.ts`) already models a `sponsorship` intent with a 10-item limit; the UI just never feeds sponsor animals into it. We add two small pure helpers, expose sponsor animals through the existing `ShortlistActionButton`, surface 助養 chips + a `開始助養` CTA in the tray, and stop the adoption wizard from wiping sponsorship selections on submit.

**Tech Stack:** TypeScript, React 19, TanStack Start/Router, Tailwind v4, Bun test runner. Spec: `docs/superpowers/specs/2026-07-02-sponsorship-shortlist-ui-design.md`.

---

## File Structure

- `src/lib/publicAdoption/shortlist.ts` — **Modify.** Add pure helpers `intentForAnimalType` and `removeIntentItems`.
- `src/lib/publicAdoption/shortlist.test.ts` — **Modify.** Unit tests for the two helpers.
- `src/components/site/ShortlistContext.tsx` — **Modify.** Add `clearIntent` to the context value type.
- `src/components/site/ShortlistProvider.tsx` — **Modify.** Implement `clearIntent`.
- `src/components/site/ShortlistActionButton.tsx` — **Modify.** Make intent-aware; accept sponsor animals.
- `src/components/site/AnimalCard.tsx` — **Modify.** Sponsor cards use the shortlist button.
- `src/components/site/AnimalDetail.tsx` — **Modify.** Sponsor detail uses the shortlist button.
- `src/components/site/ShortlistTray.tsx` — **Modify.** 助養 chips + `開始助養` CTA.
- `src/components/site/adoption/ApplicationWizard.tsx` — **Modify.** `clear()` → `clearIntent("adoption")`.

Only the reducer helpers are unit-tested (the rest is thin presentational wiring verified by typecheck/build + manual preview).

---

## Task 1: Pure reducer helpers (`intentForAnimalType`, `removeIntentItems`)

**Files:**
- Modify: `src/lib/publicAdoption/shortlist.ts`
- Test: `src/lib/publicAdoption/shortlist.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/publicAdoption/shortlist.test.ts`, replace the import block at the top (currently lines 3–9) with this expanded version that also imports the two new helpers:

```ts
import {
  addShortlistItem,
  intentForAnimalType,
  parseShortlist,
  removeIntentItems,
  removeShortlistItem,
  reorderAdoptionItems,
} from "./shortlist";
import type { ShortlistItem } from "./shortlist";
```

Then add a `sponsor` factory next to the existing `item` factory (immediately after the `item` function, around line 27):

```ts
function sponsor(id: string, rank: number): ShortlistItem {
  return {
    id,
    name: `Sponsor ${rank}`,
    animalType: "sponsor",
    imageUrl: null,
    intent: "sponsorship",
    rank,
  };
}
```

Then add these two `describe` blocks at the end of the file (after the closing `});` of the existing `describe`):

```ts
describe("intentForAnimalType", () => {
  test("maps sponsor to sponsorship", () => {
    expect(intentForAnimalType("sponsor")).toBe("sponsorship");
  });

  test("maps cat and dog to adoption", () => {
    expect(intentForAnimalType("cat")).toBe("adoption");
    expect(intentForAnimalType("dog")).toBe("adoption");
  });
});

describe("removeIntentItems", () => {
  test("removes only the target intent, keeping the other intent", () => {
    const items = [item("a", 1), item("b", 2), sponsor("s1", 1), sponsor("s2", 2)];
    expect(removeIntentItems(items, "adoption")).toEqual([sponsor("s1", 1), sponsor("s2", 2)]);
  });

  test("recompacts remaining adoption ranks after removing sponsorship", () => {
    const items = [item("a", 2), item("b", 3), sponsor("s1", 1)];
    expect(removeIntentItems(items, "sponsorship")).toEqual([
      { ...item("a", 2), rank: 1 },
      { ...item("b", 3), rank: 2 },
    ]);
  });

  test("is a no-op when the intent is absent", () => {
    const items = [item("a", 1), item("b", 2)];
    expect(removeIntentItems(items, "sponsorship")).toEqual([item("a", 1), item("b", 2)]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/publicAdoption/shortlist.test.ts`
Expected: FAIL — `intentForAnimalType`/`removeIntentItems` are `undefined` (not exported yet).

- [ ] **Step 3: Implement the helpers**

In `src/lib/publicAdoption/shortlist.ts`, add these two exported functions immediately after `removeShortlistItem` (which ends at line 101). `compactRanks` is already defined at the top of the file and is in scope:

```ts
export function intentForAnimalType(animalType: ShortlistAnimalType): ShortlistIntent {
  return animalType === "sponsor" ? "sponsorship" : "adoption";
}

export function removeIntentItems(
  items: ShortlistItem[],
  intent: ShortlistIntent,
): ShortlistItem[] {
  return compactRanks(items.filter((item) => item.intent !== intent));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/publicAdoption/shortlist.test.ts`
Expected: PASS — all tests in the file green (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publicAdoption/shortlist.ts src/lib/publicAdoption/shortlist.test.ts
git commit -m "feat: add intentForAnimalType and removeIntentItems shortlist helpers"
```

---

## Task 2: Expose `clearIntent` through the shortlist context

**Files:**
- Modify: `src/components/site/ShortlistContext.tsx`
- Modify: `src/components/site/ShortlistProvider.tsx`

No unit test — this is React context plumbing, verified by the build in Task 7.

- [ ] **Step 1: Add `clearIntent` to the context type**

In `src/components/site/ShortlistContext.tsx`, change the type import (currently line 3) to include `ShortlistIntent`:

```ts
import type {
  AddShortlistInput,
  ShortlistIntent,
  ShortlistItem,
} from "../../lib/publicAdoption/shortlist";
```

Then, in the `ShortlistContextValue` type, add `clearIntent` directly after the `clear: () => void;` line:

```ts
  clear: () => void;
  clearIntent: (intent: ShortlistIntent) => void;
```

- [ ] **Step 2: Implement `clearIntent` in the provider**

In `src/components/site/ShortlistProvider.tsx`, add `removeIntentItems` to the existing import from `../../lib/publicAdoption/shortlist` (keep the other named imports; insert `removeIntentItems` alphabetically after `removeShortlistItem`):

```ts
  parseShortlist,
  removeIntentItems,
  removeShortlistItem,
  reorderAdoptionItems,
```

Then, in the `useMemo` value object, add a `clearIntent` method immediately after the existing `clear()` method:

```ts
      clear() {
        setItems([]);
      },
      clearIntent(intent) {
        setItems((current) => removeIntentItems(current, intent));
      },
```

- [ ] **Step 3: Lint the changed files**

Run: `bunx eslint src/components/site/ShortlistContext.tsx src/components/site/ShortlistProvider.tsx`
Expected: clean. (Full typechecking runs once at the end in Task 7 Step 3.)

- [ ] **Step 4: Commit**

```bash
git add src/components/site/ShortlistContext.tsx src/components/site/ShortlistProvider.tsx
git commit -m "feat: add clearIntent to shortlist context"
```

---

## Task 3: Make `ShortlistActionButton` intent-aware

**Files:**
- Modify: `src/components/site/ShortlistActionButton.tsx`

- [ ] **Step 1: Replace the component with the intent-aware version**

Replace the entire contents of `src/components/site/ShortlistActionButton.tsx` with:

```tsx
import { Check, Plus } from "lucide-react";

import type { Animal } from "../../types/animal";
import { intentForAnimalType } from "../../lib/publicAdoption/shortlist";
import { useShortlist } from "./ShortlistContext";

const ADD_LABEL: Record<"adoption" | "sponsorship", string> = {
  adoption: "加入領養清單",
  sponsorship: "加入助養清單",
};

export function ShortlistActionButton({
  animal,
  compact = false,
}: {
  animal: Animal;
  compact?: boolean;
}) {
  const { addItem, findItem, removeItem } = useShortlist();
  const selected = findItem(animal.id);
  const animalType = animal.type;

  if (animalType !== "cat" && animalType !== "dog" && animalType !== "sponsor") {
    return null;
  }

  const intent = intentForAnimalType(animalType);

  if (selected) {
    return (
      <button
        type="button"
        onClick={() => removeItem(animal.id)}
        className={compact ? "btn-outline mt-auto text-xs! py-1.5! px-3!" : "btn-outline py-3!"}
      >
        <Check className="h-4 w-4" />
        已加入，按此移除
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() =>
        addItem({
          id: animal.id,
          name: animal.name,
          animalType,
          imageUrl: animal.image_url,
          intent,
        })
      }
      className={compact ? "btn-cta mt-auto text-xs! py-1.5! px-3!" : "btn-cta py-3!"}
    >
      <Plus className="h-4 w-4" />
      {ADD_LABEL[intent]}
    </button>
  );
}
```

- [ ] **Step 2: Lint the changed file**

Run: `bunx eslint src/components/site/ShortlistActionButton.tsx`
Expected: clean (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/site/ShortlistActionButton.tsx
git commit -m "feat: make ShortlistActionButton support sponsorship intent"
```

---

## Task 4: Route sponsor cards + detail through the shortlist button

**Files:**
- Modify: `src/components/site/AnimalCard.tsx`
- Modify: `src/components/site/AnimalDetail.tsx`

- [ ] **Step 1: Update `AnimalCard.tsx`**

In `src/components/site/AnimalCard.tsx`, find the sponsor/adoption branch (currently lines 56–62):

```tsx
        {animal.type === "sponsor" ? (
          <Link to={detailHref} className="btn-cta mt-auto text-xs! py-1.5! px-3!">
            立即助養 <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <ShortlistActionButton animal={animal} compact />
        )}
```

Replace it with (all animal types now use the shortlist button):

```tsx
        <ShortlistActionButton animal={animal} compact />
```

Leave the rest of the file unchanged — `Link` and `detailHref` are still used by the card image wrapper near the top of the component, so their imports/usages stay.

- [ ] **Step 2: Update `AnimalDetail.tsx`**

In `src/components/site/AnimalDetail.tsx`, find the action block (currently lines 70–78):

```tsx
          <div className="flex flex-col gap-2 pt-2">
            {animal.type === "sponsor" ? (
              <Link to="/sponsors" className="btn-cta py-3!">
                查看助養付款方式
              </Link>
            ) : (
              <ShortlistActionButton animal={animal} />
            )}
          </div>
```

Replace it with:

```tsx
          <div className="flex flex-col gap-2 pt-2">
            <ShortlistActionButton animal={animal} />
          </div>
```

Leave the rest unchanged — `Link` is still used by the back link at the top of the component.

- [ ] **Step 3: Lint the changed files**

Run: `bunx eslint src/components/site/AnimalCard.tsx src/components/site/AnimalDetail.tsx`
Expected: clean. (If ESLint flags `Link` as unused in either file, that means a usage was removed unexpectedly — re-check you only replaced the sponsor branch.)

- [ ] **Step 4: Commit**

```bash
git add src/components/site/AnimalCard.tsx src/components/site/AnimalDetail.tsx
git commit -m "feat: add sponsor animals to shortlist from cards and detail"
```

---

## Task 5: Surface 助養 chips + `開始助養` CTA in the tray

**Files:**
- Modify: `src/components/site/ShortlistTray.tsx`

- [ ] **Step 1: Replace the tray with the two-intent version**

Replace the entire contents of `src/components/site/ShortlistTray.tsx` with (adds sponsorship chips capped at 4 with a distinct coral treatment, plus a `開始助養` CTA shown independently of the adoption CTA):

```tsx
import { Link } from "@tanstack/react-router";
import { Heart, X } from "lucide-react";

import { useShortlist } from "./ShortlistContext";

export function ShortlistTray() {
  const { items, message, persistenceWarning, clearMessage, removeItem } = useShortlist();
  const adoptionItems = items.filter((item) => item.intent === "adoption");
  const sponsorshipItems = items.filter((item) => item.intent === "sponsorship");
  const firstRankedAdoptionItem = [...adoptionItems].sort(
    (left, right) => left.rank - right.rank,
  )[0];

  if (items.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-4xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-panel"
    >
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Heart className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-panel)]">
              已選 {items.length} 隻：領養 {adoptionItems.length}，助養 {sponsorshipItems.length}
            </p>
            {(message || persistenceWarning) && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {message ?? persistenceWarning}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {adoptionItems.slice(0, 3).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => removeItem(item.id)}
              className="inline-flex max-w-32 items-center gap-1 rounded-full bg-[var(--color-surface-offset)] px-3 py-1 text-xs font-medium text-[var(--color-panel)]"
              aria-label={`移除 ${item.name}`}
              title={`移除 ${item.name}`}
            >
              <span className="truncate">
                {item.rank}. {item.name}
              </span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          {sponsorshipItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => removeItem(item.id)}
              className="inline-flex max-w-32 items-center gap-1 rounded-full bg-[var(--color-cta)] px-3 py-1 text-xs font-medium text-white"
              aria-label={`移除 ${item.name}`}
              title={`移除 ${item.name}`}
            >
              <Heart className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.name}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          {message && (
            <button
              type="button"
              onClick={clearMessage}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)]"
            >
              關閉提示
            </button>
          )}
          {firstRankedAdoptionItem && (
            <Link
              to="/adoption/apply"
              search={{
                animalId: firstRankedAdoptionItem.id,
                animalName: firstRankedAdoptionItem.name,
                type: firstRankedAdoptionItem.animalType,
              }}
              className="btn-cta py-2! px-4! text-xs!"
            >
              申請領養
            </Link>
          )}
          {sponsorshipItems.length > 0 && (
            <Link to="/sponsors" className="btn-cta py-2! px-4! text-xs!">
              開始助養
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Lint the changed file**

Run: `bunx eslint src/components/site/ShortlistTray.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/site/ShortlistTray.tsx
git commit -m "feat: show 助養 chips and 開始助養 CTA in shortlist tray"
```

---

## Task 6: Preserve sponsorship selections on adoption submit

**Files:**
- Modify: `src/components/site/adoption/ApplicationWizard.tsx`

- [ ] **Step 1: Destructure `clearIntent` instead of `clear`**

In `src/components/site/adoption/ApplicationWizard.tsx`, find (currently line 225):

```tsx
  const { items, clear, reorderAdoptions } = useShortlist();
```

Replace with:

```tsx
  const { items, clearIntent, reorderAdoptions } = useShortlist();
```

- [ ] **Step 2: Clear only the adoption intent after a successful submit**

In the same file, find (currently line 423, after the draft cleanup):

```tsx
    clear();
    setSubmission(result);
```

Replace with:

```tsx
    clearIntent("adoption");
    setSubmission(result);
```

- [ ] **Step 3: Confirm `clear` is no longer referenced**

Run: `grep -n "clear\b" src/components/site/adoption/ApplicationWizard.tsx`
Expected: only `clearIntent` matches; no bare `clear(` or `clear,` remain. (If a stray `clear` reference remains, update it to `clearIntent` or remove it.)

- [ ] **Step 4: Lint the changed file**

Run: `bunx eslint src/components/site/adoption/ApplicationWizard.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/adoption/ApplicationWizard.tsx
git commit -m "fix: keep 助養 selections when submitting an adoption application"
```

---

## Task 7: Full verification (tests, build, manual preview)

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: all tests pass (the ~317 existing tests plus the new shortlist tests).

- [ ] **Step 2: Lint all changed files together**

Run:

```bash
bunx eslint \
  src/lib/publicAdoption/shortlist.ts \
  src/components/site/ShortlistContext.tsx \
  src/components/site/ShortlistProvider.tsx \
  src/components/site/ShortlistActionButton.tsx \
  src/components/site/AnimalCard.tsx \
  src/components/site/AnimalDetail.tsx \
  src/components/site/ShortlistTray.tsx \
  src/components/site/adoption/ApplicationWizard.tsx
```

Expected: clean. (Avoid `bun run lint` — it lints the whole tree and is very slow.)

- [ ] **Step 3: Typecheck, then production build**

Run: `bunx tsc --noEmit`
Expected: no type errors. (`bun run build` is `vite build` / esbuild, which strips types without full typechecking, so `tsc --noEmit` is the authoritative type gate.)

Then run: `bun run build`
Expected: the app bundles successfully (surfaces any import/route-tree errors).

- [ ] **Step 4: Manual preview checklist**

Start the dev server (via the preview tooling / `bun run dev`) and verify:

- On `/sponsors`, a sponsor card shows `加入助養清單`; clicking adds it — the tray appears showing `助養 1` with a coral chip and an `開始助養` button.
- Clicking the chip (or the button's `已加入，按此移除`) removes the sponsor animal.
- Adding an 11th sponsor animal shows `最多可選擇 10 隻助養動物。` in the tray.
- A sponsor detail page (`/sponsors/<id>`) shows the add/remove button and no longer shows a `查看助養付款方式` link.
- `開始助養` navigates to `/sponsors` (the payment-methods block is still there).
- Add at least one cat/dog (領養) and one sponsor (助養): the tray shows both `申請領養` and `開始助養`.
- Submit an adoption application: after success, the 助養 items remain in the tray (they are not wiped).

- [ ] **Step 5: Final commit (if the preview surfaced any fixes)**

If manual verification required changes, commit them:

```bash
git add -A
git commit -m "fix: address 助養 shortlist preview findings"
```

If no changes were needed, skip this step.

---

## Self-Review Notes

- **Spec coverage:** shortlist helpers (Task 1) ✓; `clearIntent` context (Task 2) ✓; intent-aware button (Task 3) ✓; add-to-list-only card/detail (Task 4) ✓; tray chips + CTA (Task 5) ✓; clear-on-submit fix (Task 6) ✓; tests/build/manual (Task 7) ✓.
- **Type consistency:** `intentForAnimalType(animalType: ShortlistAnimalType): ShortlistIntent` and `removeIntentItems(items, intent): ShortlistItem[]` are referenced with identical signatures in the button, provider, and wizard. `clearIntent(intent: ShortlistIntent)` matches between context type and provider implementation.
- **Out of scope (unchanged):** `donate.tsx`, sponsorship pledge/payment-proof backend, admin surfaces.
