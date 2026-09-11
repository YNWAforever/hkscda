# Phase 2 §5.5 — Demonstration Content Inventory (CONFIRMED)

Recorded: 2026-09-11 · Project `iihqjzilgawhfdhdevam` · Read-only

## The finding is worse than the audit recorded

The audit reported "seven demonstration items had published status". A direct
read confirms that, and adds the part that matters:

```
content_item rows: 7   (published: 7)
```

**Those seven are the only content items that exist.** The entire public stories
section of the live site is demonstration content. There is no real content
behind it — fabricated rescue stories and a fabricated charity market published
under a real animal-rescue charity's name.

## Per-ID checklist

All seven, confirmed present and published. Each carries **two** independent
markers, so identification needs no guessing:

| Slug | Title | Type | Status |
|---|---|---|---|
| `demo-siu-bak-recovery` | 【示範】小白康復中 | rescue_story | published |
| `demo-lucky-ready-for-adoption` | 【示範】Lucky 準備尋家 | rescue_story | published |
| `demo-orange-sponsor-needed` | 【示範】阿橘需要助養 | rescue_story | published |
| `demo-dodo-adopter-update` | 【示範】豆豆新生活更新 | rescue_story | published |
| `demo-summer-adoption-day` | 【示範】夏日領養日 | event | published |
| `demo-charity-market-july` | 【示範】七月慈善市集 | charity_market | published |
| `demo-rescue-report-june` | 【示範】六月救援報告 | report | published |

Row ids are deliberately not committed; the slug identifies each uniquely and
the check reports ids at runtime.

This matches the audit's list exactly, including 「Lucky準備尋家」, which the
audit wrote without the space that production actually uses.

## What is delivered

`scripts/verify-no-demo-content.mjs`, wired as `bun run verify:no-demo-content`.
Nothing was checking for this, which is why it persisted.

Verified against all three outcomes:

| Target | Result |
|---|---|
| Production | **exit 1** — names all seven |
| Clean local stack | exit 0 — "No demonstration content is published" |
| Unreachable host | **exit 2** — an unreachable target never reads as clean |

The detection reads **both** markers, because the plan says removing the visible
label is not the fix: a row whose 【示範】 prefix was stripped is still caught by
its `demo-` slug. Slug matching is anchored to the start, so a genuine article
about a demonstration day is not swept up and quietly pulled from the site.

Only `published` rows are reported. Demonstration content in a draft state is
legitimate, and the plan requires preserving history rather than deleting
records.

## What is NOT done

**The seven rows are untouched.** Unpublishing them is a production data change
and needs approval. It is also not sufficient on its own: with all seven gone the
stories section is empty, so it needs either verified authentic content to
replace them or an accepted empty state.

`supabase/seed.sql` is the source of these fixtures and already carries a
`-v confirm=yes` gate from the earlier demo-seed-guard work, so unpublishing
would be durable rather than undone by the next seed run.

Recommended sequence: replace with verified content where it exists → unpublish
the remainder → run `verify:no-demo-content` against production to confirm exit 0.
