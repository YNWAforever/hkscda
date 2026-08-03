# Write-Path Trace Findings

Nine write sites traced across `ContentEditor.tsx` and `AnimalPipeline.tsx`.

**Outcome: 8 OK · 1 P2 · 0 P0 · 0 P1.**

No wrong-record writes and no silent failures were found. The `adminNotes` bug
shape — payload state outliving the selection it was seeded from — does not
occur in either file. The one finding is an unguarded destructive-adjacent
action.

Classification: P0 wrong record/data · P1 silent failure · P2 unguarded
destructive · P3 cosmetic · OK no defect.

## Summary

| Site | File:line | Class | One-line |
| --- | --- | --- | --- |
| 1 publishContent | ContentEditor:316 | OK | Identifier and payload both derive from the `contentId` prop; empty body; both error branches surface. |
| 2 archiveContent | ContentEditor:325 | **P2** | Archive fires on one unconfirmed click directly beside publish, with no status gate. |
| 3 generateNotificationDrafts | ContentEditor:364 | OK | `updateId` read off the rendered row of the same query `contentId` keys; server re-derives content and recipients from it. |
| 4 generateSocialCopy | ContentEditor:370 | OK | Route-param prop re-captured each render; empty payload; additive-only write. |
| 5 updateCopyStatus | ContentEditor:371 | OK | Id from the mapped row, status a literal; no optimistic UI, so a failure leaves the pill unchanged. |
| 6 updateDraftStatus | ContentEditor:379 | OK | Same shape as site 5; `sent_manually` writes the row actually clicked. |
| 7 saveProfileMutation | AnimalPipeline:465 | OK | All three writers assign `profileForm` and `selectedAnimalId` from one `row` in the same batched update; server rejects mismatches. |
| 8 lifecycleMutation (desktop) | AnimalPipeline:553 | OK | Payload built from the rendered row plus the event value; no optimistic state. |
| 9 lifecycleMutation (mobile) | AnimalPipeline:678 | OK | Same logic as site 8; only divergence is trigger sizing. |

## ContentEditor

### Site 1 — `publishContent.mutate()` (ContentEditor.tsx:316)

1. **Target identity:** the `contentId` prop (`ContentEditor.tsx:34`), captured in the mutationFn closure at `:131`. Supplied by the route param at `routes/admin/content/$id.tsx:15-19`; the rendered header reads from `contentQuery` keyed on the same value (`:109`), so identifier and rendering share one source.
2. **Freshness:** not stale. Options are re-pushed to the mutation observer after every commit, and when `contentId` changes the query key changes and the component early-returns the loading branch (`:261-263`) until the new record resolves.
3. **Payload provenance:** body is `JSON.stringify({})` (`:1412`). No component state, no form fields. Everything is derived server-side from the URL id, so there is no cross-record seeding surface.
4. **Reset discipline:** no payload state exists. `validationIssues` (`:103`) is cleared on publish/update success but not on a `contentId` change; display-only and unreachable through in-app navigation, which always unmounts.
5. **Failure handling:** both branches surface. `onError` (`:137-139`) stores validation issues for `PublishValidationPanel`; other failures reach `ActionErrors` (`:335-338`). No optimistic state and no success toast — the status pill only flips after the invalidated refetch.
6. **Guard:** not confirmed and not status-gated, so publish can fire on an already-published item. The write is constructive and validation-gated server-side.

**Class:** OK — identifier and payload both derive solely from the current `contentId`; no component state feeds the write.

### Site 2 — `archiveContent.mutate()` (ContentEditor.tsx:325)

1. **Target identity:** the same `contentId` prop, closure-captured at `:144`. Identical provenance to site 1.
2. **Freshness:** not stale, for the same reasons as site 1.
3. **Payload provenance:** body is `JSON.stringify({})` (`:146`). The server sets `status: "archived"` by id (`content/repository.server.ts:751-757`) and writes its own audit row (`content/service.ts:347-357`).
4. **Reset discipline:** nothing to reset — the write carries no state.
5. **Failure handling:** no `onError`, but `archiveContent.error` reaches `ActionErrors` (`:339`) and `fetchAdminJson` throws real `Error` subclasses. No optimistic update, so a failed archive leaves the old status visible plus an error banner.
6. **Guard:** **none.** No `confirm(` anywhere in the file, no `content.status` check, no destructive styling. The 封存 button sits immediately beside 發布 (`:313-330`), enabled whenever no other mutation is pending. One misclick flips a published item to archived, removing it from public surfaces.

**Class:** P2 — destructive-adjacent write on a single unconfirmed click beside the publish button. Mitigating: the flip is soft and reversible from the status select at `:589-596`.

### Site 3 — `generateNotificationDrafts.mutate(updateId)` (ContentEditor.tsx:364)

1. **Target identity:** a row-passed id. `ContentTimeline` maps `content.updates` and calls `onGenerateDrafts(update.id)` from the row's own closure (`ContentTimeline.tsx:74`).
2. **Freshness:** no. `contentId` is part of the query key, there is no `keepPreviousData`, so on an id change the loading branch renders (`:261-263`). Server-side, `content/repository.server.ts:472-475` scopes `story_update` by `content_item_id`, so ids in `content.updates` provably belong to the open item.
3. **Payload provenance:** body is `JSON.stringify({})` (`:227`); the only variable is `updateId` in the URL. The server re-derives everything from it — `content/service.ts:424-441` loads the update, then its content item, then resolves adopter recipients from that item. A mismatched id could not cross-contaminate; it would produce a self-consistent draft set.
4. **Reset discipline:** not applicable — no state feeds the payload. `generatingUpdateId` is spinner-only, set in `onMutate` and cleared in `onSettled`.
5. **Failure handling:** `generateNotificationDrafts.error` reaches `ActionErrors` (`:346`). No success banner, so a failure does not paint as saved.
6. **Guard:** not destructive — a pure insert (`content/repository.server.ts:877-893`), manual-send only. Double-gated: the button renders only when `update.shouldGenerateAdopterDrafts` (`ContentTimeline.tsx:70`), and the server enforces `assertPublicOutboundStoryUpdate` (`content/service.ts:426`).

**Class:** OK — the id is read off the rendered row of the same query `contentId` keys, and the server re-derives recipients from the update itself.

### Site 4 — `generateSocialCopy.mutate()` (ContentEditor.tsx:370)

1. **Target identity:** the `contentId` prop captured in the mutationFn closure (`:201`).
2. **Freshness:** no. The closure is rebuilt each render and `contentId` only changes with the route param — the same value the visible content was fetched with.
3. **Payload provenance:** body is `JSON.stringify({})` (`:203`). The server generates variants from the row it loads by id, and rejects a `storyUpdateId` belonging to a different content item (`content/service.ts:369-371`).
4. **Reset discipline:** not applicable — no component state is read into the payload.
5. **Failure handling:** `generateSocialCopy.error` reaches `ActionErrors` (`:344`); the pending label is driven by `isPending`, so a failure reverts the button and shows the error.
6. **Guard:** not destructive — a plain insert; existing copies are not replaced. Double-submit blocked by `disabled` (`SocialCopyPanel.tsx:43`).

**Class:** OK — identity is the route-param prop re-captured each render, payload is empty, write is additive-only.

### Site 5 — `updateCopyStatus.mutate({ copyId, status })` (ContentEditor.tsx:371)

1. **Target identity:** the row being rendered. `SocialCopyPanel.tsx:65` maps `copies` and each button calls `onUpdateStatus(copy.id, ...)` inline (`:94`, `:107`). The panel's only state is `clipboardError`, which never feeds the write.
2. **Freshness:** not stale. `copy` is recreated each render from the query cache; the id in the closure is always the card the operator clicked. `pendingCopyId` is used only to disable that row's buttons.
3. **Payload provenance:** `copyId` from the mapped row; `status` a hardcoded literal at the call site. The clipboard text is built from the same `copy` object, so the text copied and the row marked match.
4. **Reset discipline:** no component state contributes to the payload.
5. **Failure handling:** `updateCopyStatus.error` reaches `ActionErrors` (`:345`). No optimistic update — the pill renders `copy.status` from server data, so a failed write leaves it visibly unchanged.
6. **Guard:** not destructive — a status flip on an advisory record, reversible. Buttons disabled per-row while pending.

**Class:** OK — id and status originate in the mapped row and the call site; errors surface; no optimistic UI.

### Site 6 — `updateDraftStatus.mutate({ draftId, status })` (ContentEditor.tsx:379)

1. **Target identity:** the row being rendered. `NotificationDraftPanel.tsx:53` maps `drafts` and all three buttons call `onUpdateStatus(draft.id, ...)` inline (`:86`, `:99`, `:108`). No panel-level "selected draft" state exists.
2. **Freshness:** not stale. `draft` is the map parameter, recomputed each render. `pendingDraftId` is used only for the per-row disabled check. This is the case that matters most given `sent_manually`, and it is clean.
3. **Payload provenance:** `draftId` from the mapped row; `status` a literal per button. On the copy path the status write runs only in `.then()` after the clipboard write resolves, so a clipboard failure does not mark the draft copied.
4. **Reset discipline:** no payload field draws on component state.
5. **Failure handling:** `updateDraftStatus.error` reaches `ActionErrors` (`:347`). No optimistic update — a failed `sent_manually` leaves the draft visibly 草稿 plus an error banner, so the dangerous "looks sent but wasn't" state does not occur.
6. **Guard:** consequential but not destructive — mutates a status column, does not delete the draft, does not trigger an outbound send. Not behind a confirm.

**Class:** OK — the id is the row clicked, status is a literal, and the pill reflects server state rather than an optimistic guess.

## AnimalPipeline

### Site 7 — `saveProfileMutation.mutate(profileForm)` (AnimalPipeline.tsx:465)

Flagged in the plan as the highest-risk site and the closest structural match to
the `adminNotes` bug. It is safe, and the reason is worth recording.

1. **Target identity:** `profileForm.animal_id`, interpolated into the PUT path at `:370` — not `selectedAnimalId`. The server guarantees `row.profile.animal_id === row.id` (`adoptions/repository.server.ts:1789-1799`, `:879`).
2. **Freshness:** no. There are exactly three writers of `profileForm`, and **every one assigns `selectedAnimalId` from the same `row` in the same batched update** — `openProfileDialog` (`:445-446`), `closeProfileDialog` (`:450-451`), and the `initialAnimalId` effect (`:391-392`). No path sets one without the other. A rows refetch while the dialog is open re-seeds neither, so the pair stays internally consistent. The server adds a belt-and-braces check, rejecting body/path mismatches with "Animal id mismatch" (`-internalProfile.ts:80-82`).
3. **Payload provenance:** every field is seeded by `cloneProfile(row.profile)` (`:141-143`) from one row, then mutated only through `updateProfileField` (`:455-460`), which spreads the current form. All 16 fields are bound to inputs reading from `profileForm`.
4. **Reset discipline:** explicit reset on all three transitions, covering identifier and payload together. `openProfileDialog` also calls `saveProfileMutation.reset()`.
5. **Failure handling:** `saveProfileMutation.error` renders in the form with `role="alert"` (`:1299-1301`), and `closeProfileDialog()` runs only in `onSuccess` — so on failure the dialog stays open with the operator's edits intact.
6. **Guard:** a full-object PUT with last-write-wins and no `updated_at` precondition, fired from an explicit Save that is double-fire-guarded. Server validates and audits every write.

**Class:** OK — identifier and payload are always assigned from a single `row` object in the same batched update, so the dialog cannot display animal B while `profileForm` holds animal A.

### Site 8 — `lifecycleMutation.mutate({ animalId: row.id, status })` (AnimalPipeline.tsx:553, desktop)

1. **Target identity:** `row.id`, the `cell(row)` argument of the lifecycle column (`:541`), passed per-invocation by `DataTable` (`DataTable.tsx:94, 112`). Not a captured outer variable.
2. **Freshness:** no. `<Select value={row.status}>` (`:550`) reads from the same object that supplies `row.id`. Rows are keyed by `row.id` (`:979`), so React never reuses a cell across animals.
3. **Payload provenance:** `animalId` from the rendered row; `status` the Radix `onValueChange` argument, one of three literals from `STATUS_ACTIONS` (`:99-103`), re-validated server-side by `z.enum` (`-status.ts:5`).
4. **Reset discipline:** not applicable — the payload is constructed inline from the rendered row plus the event argument.
5. **Failure handling:** no `onError`, but **no optimistic update either**: the Select is controlled by server data, so on failure the value never moved — it stays on the true status, disabled, until the refetch. `lifecycleMutation.error.message` renders in a `role="alert"` banner (`:917-924`). The "silently snaps back" P1 does not occur.
6. **Guard:** not destructive — a reversible enum column, undone through the same dropdown, with a server-side audit row.

**Class:** OK — payload built entirely from the rendered row plus the event value; absence of optimistic state means a failed write leaves the true value visible with an error.

### Site 9 — `lifecycleMutation.mutate({ animalId: row.id, status })` (AnimalPipeline.tsx:678, mobile)

1. **Target identity:** `row.id`, the parameter of `renderAnimalCard(row)` (`:645`), passed per-invocation by `DataTable` (`DataTable.tsx:142, 151`).
2. **Freshness:** no — identical to site 8. `<Select value={row.status}>` (`:675`) reads the same object; the list is keyed by `getRowKey(row)`.
3. **Payload provenance:** identical to site 8.
4. **Reset discipline:** not applicable, same as site 8.
5. **Failure handling:** same as site 8. The error banner lives in the always-rendered filters section (`:774-925`), not a desktop-only branch, so mobile operators do see it.
6. **Guard:** same as site 8 — reversible, audited, disabled in flight.

**Class:** OK — the same write logic as site 8 with the correct per-render `row`.

## Observations below the classification threshold

Recorded so they are not rediscovered. None is a data-correctness defect.

- **Mobile status trigger is under the touch-target minimum.** `AnimalPipeline.tsx:681` sizes the mobile Select trigger `h-10` (40px), while its sibling Edit button in the same card uses `min-h-[44px]` (`:747`). The only sub-44px control in that card, and inconsistent with its neighbour.
- **No dedupe on repeated generation.** Sites 3 and 4 append on every click; the in-flight `disabled` prevents double-submission but not a second deliberate press. For site 3 that means an operator could manually send the same message twice to a real adopter.
- **Dirty forms discard without confirmation.** Site 7's dialog closes via Radix `onOpenChange` (`:1035`) with no unsaved-changes check.
- **Deep-link race can discard typed edits.** With `?animalId=A` still in flight, opening animal B and typing lets the `initialAnimalId` effect (`:382-394`) swap the dialog to A. Both states are replaced together, so the write stays consistent — this loses input rather than misdirecting it.
- **Shared in-flight flag across rows.** `isUpdatingStatus` keys off the single `lifecycleMutation.variables` (`:543`), so changing a second row's status mid-request re-enables the first row's Select.
- **Stale display state across a param change.** `validationIssues` and `clipboardError` are not cleared when the underlying record changes. Display-only; unreachable through in-app navigation, which unmounts.

## Production corroboration

Not performed. The spec gates it on a P0 or P1 in `AnimalPipeline`; there were
none, so there is nothing to corroborate. Note also the correction recorded in
the spec: `AnimalPipeline` writes through the API layer, so
`log_animal_mutation` skips it and no `{from, to}` diffs exist for that screen
regardless.
