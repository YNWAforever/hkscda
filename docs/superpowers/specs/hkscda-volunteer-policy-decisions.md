# HKSCDA Volunteer Policy Decisions (D01–D10)

Status: **open decision log** — created 2026-09-11
Source of requirements: `CLAUDE_HKSCDA_IMPLEMENTATION_MASTER_PLAN_v1_2026-09-11_EN.md` §10
Owner: implementation lead. Approver: HKSCDA — **not yet obtained for any item below.**

## How this document is used

This is the **single traceable definition** of the volunteer operating rules. It is
the authority that code reads from; no separate entry point may decide a rule
independently.

Three states are tracked separately and must never be conflated:

| State | Meaning |
|---|---|
| **Reviewable implementation complete** | Code exists, is tested, and is merged or in a reviewable PR |
| **Isolated acceptance passed** | Verified against isolated data/fixtures with recorded evidence |
| **Operationally activated** | Approved by HKSCDA and enabled for real registrations |

A recommendation in this file is **not** an approved client decision. Every
unresolved policy is implemented so that both options can be exercised under
**named fixtures in isolated tests**, while production activation of that specific
rule stays disabled.

### Activation guard contract

Policies carry `draft` / `approved` / `retired` states, immutable versions, scope,
approver and approval time. The rule the engine applies is:

- Operations that **add or move a seat** (new registration, approval, waitlist
  promotion, seat transfer) must reference an **approved** policy version.
- Operations that **release or correct** (cancellation, credential revocation,
  factual attendance correction) may reference a historical or `legacy` policy.
  Missing or retired policies on old data must **not** block authorised
  corrections or cancellations.
- Where a decision below is unresolved, the affected automated job reports
  `policy_unresolved` and performs **no** state change. It does not fail silently
  and it does not fall back to a guessed default.

Restricting an unresolved policy restricts only **new automated actions** that
depend on it. It never cancels existing valid registrations, never rewrites
commitments made under an earlier policy snapshot, and never stops unrelated
services.

---

## Confirmed requirements — not decisions

These are stated by the client in §10.1/§10.2 and are implemented as given.

### Tiers

| Tier (official title — use verbatim) | Rule |
|---|---|
| 新手義工 (New Volunteer) | Fewer than 10 cumulative **verified** attendances |
| 恆常義工 (Regular Volunteer) | ≥10 cumulative attendances; ≥1 attendance per month; a month with zero attendance triggers a friendly reminder the following month |
| 資深義工 (Senior Volunteer) | Joined ≥2 years ago with maintained regular service; ≥2 attendances per month; two consecutive zero-attendance months trigger a caring reminder **without demotion** |

Only these three titles exist. No fourth tier. No automatic reversion from
資深義工 to 恆常義工. Registration counts are **not** attendance counts. Automatic
assessment on the first day of each month is a **confirmed** requirement.

Two-year membership is evaluated on **actual anniversaries**, not a fixed 730
days, and must handle leap years and unknown joining dates.

### Session capacity matrix

| Session | Group visitors | Volunteer roles | Total and restrictions |
|---|---|---|---|
| Morning A (a confirmed group is attending) | 10–15 | 1 × 資深義工 leader; 4–6 × 恆常／資深義工 assistants; up to 2 × 新手義工 | Max 9 volunteers when role maxima are summed; **one person cannot hold two roles** |
| Morning B (no group) | none | ≥6 experienced (恆常／資深義工); up to 6 × 新手義工 | **Strict total 12**; 6 places reserved for experienced volunteers — see D06 |
| Afternoon 15:00–16:30 | up to 20 | 1 × 資深義工 leader; 1–2 × 恆常／資深義工 assistants | **Max 3 volunteers total**; no 新手義工 assistant places authorised |
| Evening Mon/Wed/Fri 19:00–21:00 | n/a | ≥1 trained 資深義工 on duty; up to 7 other trained volunteers of any tier | **Strict total 8**; *everyone* including 資深義工 must hold the training credential; an ineligible person cannot occupy the place reserved for the qualified duty role |

Visitors and volunteers are counted **separately**. Total seats, role caps,
protected core seats, and minimum staffing to run are four distinct quantities.
Falling below a minimum is a **staffing-shortfall warning** — it must not prevent
accepting the first eligible registration, and an understaffed activity must
never be presented as safely staffed.

### Required product wording — evening ineligibility

Both frontend and backend must return this exact, complete Chinese string:

> 本時段僅限已修畢社教化訓練班之義工報名

English, for implementation reference only and **not** product copy: "Only
volunteers who have completed the socialisation training course may register for
this session."

### Volunteer terms

The authoritative Chinese wording is in master plan §11 and is reproduced verbatim
in the implementation. It must not be rewritten or shortened. Acceptance is
**unchecked by default**; the applicable version is validated on both frontend and
backend; acceptance evidence (volunteer ID, terms version, content hash or
snapshot, acceptance time, source) is immutable. Existing volunteers are **not**
bulk-marked as having consented. Volunteer terms and marketing consent are
independent — declining marketing must not prevent accepting the terms.

---

## D01 — Evening session opening boundary

**Conflict.** Evening sessions are described as opening both *seven days in
advance* and *48 hours before* the activity.

| Option | Effect |
|---|---|
| **A — T−7 only** | Predictable; volunteers plan a week ahead; late shortfalls have no recovery mechanism |
| **B — T−48 only** | Late-filling; poor for planning; leaves roughly five days of an unfillable session |
| **C — two-stage: open at T−7, then a separate T−48 release step** | Matches both statements; the T−48 step is a *release*, not a second opening. Depends on D02 to define what is released |

**Recommendation:** C, with the T−48 behaviour gated on D02.

**Isolated test:** exercise T−7 and T−48 separately with a fixed clock; preview the
staffing outcome of each on representative sessions.

**Activation restriction:** do not pick a default evening opening policy without
approval. Sessions under the affected new policy are not opened automatically. The
boundary is evaluated **inside the registration transaction** from the approved
policy's time boundary; cron is supplementary only, and a delayed job must never
cause early opening or overbooking.

**Status: UNRESOLVED — not activated.**

---

## D02 — The 48-hour release rule

**Gap.** The rule refers to "fewer than five Senior Volunteers" but no corresponding
pool of five reserved places exists anywhere in the stated capacity matrix.

Before this can be implemented at all, four things must be defined:

1. which sessions it applies to;
2. which places are actually releasable;
3. who is eligible to receive a released place;
4. how essential roles — and Morning B's six experienced places — are preserved.

**Recommendation:** do not implement a release until (1)–(4) are answered. Build the
job with a dry-run mode that reports what *would* be released and why, so staff can
inspect affected counts and reasons before anything is enabled.

**Activation restriction:** until approved, the release job reports
`policy_unresolved` and releases **no** places. 新手義工 may never replace a core
role that requires training or 資深義工 status.

**Status: UNRESOLVED — dry-run / `policy_unresolved` only.**

---

## D03 — What the daily limit of 20 counts

**Ambiguity.** Whether the limit counts *distinct people* or *attendance instances*,
and whether visitors count toward it.

| Option | Effect |
|---|---|
| **A — distinct people per HK date, visitors counted separately** | A volunteer attending morning and evening consumes one daily place but a seat in each session. Matches the shelter's physical constraint — how many different people are on site that day |
| **B — attendance instances** | The same volunteer attending twice consumes two of the 20, roughly halving effective daily participation |

**Recommendation:** A. The deduplication contract is specified in master plan §10.4
and is reproduced in the data/API contracts spec as a **named isolated fixture**,
not as operational policy.

**Activation restriction:** the deduplicated model is **not** the operational daily
rule until approved. The overall limit of 20 itself is unchanged and remains
enforced. Option B is implemented and tested under its own fixture so a decision
either way needs no re-engineering.

**Status: UNRESOLVED — both interpretations testable; A is the fixture default for isolated tests only.**

---

## D04 — Multiple sessions in one day and cumulative attendance

**Ambiguity.** How two verified sessions on the same day contribute to the
cumulative attendance that drives tier promotion.

**Recommendation:** one attendance per verified session; daily headcount computed
separately. Daily headcount, session capacity, and attendance count are three
distinct measures and must not be derived from one another.

**Activation restriction:** do not bulk-recalculate historical tiers before
approval. A change here is applied forward; any resulting tier change is referred
to staff review rather than applied automatically.

**Status: UNRESOLVED — not applied to historical data.**

---

## D05 — "Maintaining regular service" for 資深義工 eligibility

**Ambiguity.** How far back service must be assessed.

**Recommendation:** do **not** invent a threshold. Produce a list of *eligibility
candidates* — joined ≥2 years ago, with their attendance evidence and joining date
retained — for staff verification. Promotion to 資深義工 stays a human decision.

**Activation restriction:** no automatic promotion to 資深義工.

**Status: UNRESOLVED — candidate list only.**

---

## D06 — Morning B: "no upper limit for experienced volunteers" vs strict total 12

**Conflict.** Both statements appear for the same session.

**Recommendation:** no separate experienced-volunteer sub-cap; the overall limit of
12 governs. Worked examples that must be encoded as tests:

| Composition | Allowed? | Why |
|---|---|---|
| 12 experienced, 0 new | **Yes** | No experienced sub-cap; total = 12 |
| 6 experienced + 6 new | **Yes** | Meets the six-experienced minimum; total = 12 |
| 7 experienced + 6 new | **No** | Total = 13 > 12 |
| 5 experienced + 7 new | **No** | Fewer than six experienced, and the 新手義工 cap is 6 |

**Activation restriction:** the confirmed total of 12 must never be exceeded under
any interpretation. The examples above are recorded in the approved policy.

**Status: recommendation stable; the total-12 invariant is CONFIRMED and enforced now.**

---

## D07 — Does "seven days" mean 168 hours or a Hong Kong calendar-day window?

**Recommendation:** calculate from the **session start time** — a 168-hour boundary
— because the A/B freeze and the group-to-individual booking switch must reference
the same boundary, and a calendar-day window makes that boundary depend on the
session's time of day.

**Isolated test:** compare both boundaries at the instant before, at, and after the
boundary, in Asia/Hong_Kong, including a UTC date change.

**Activation restriction:** freezing the A/B arrangement and switching between group
and individual booking must reference the **same** approved boundary.

**Status: UNRESOLVED — both boundaries implemented behind the policy version.**

---

## D08 — Morning start/end times, registration cutoff, and per-session 4–6 / 1–2

**Missing data.** Morning cleaning start and end times were never supplied.

**Recommendation:** represent "4–6" and "1–2" as a **minimum, a maximum, and a
per-session configuration** on a session template, with preview and validation.
Registration must close no later than the session start.

**Activation restriction:** a new session **cannot be published without its required
times**. This is a validation error, not a silently-applied default.

**Status: BLOCKED ON OPERATIONS INPUT — times must be configured by HKSCDA staff.**

---

## D09 — Promotion trigger at the tenth attendance

**Ambiguity.** Immediate promotion at the tenth verified attendance, or promotion in
the monthly batch; and how later corrections affect an applied promotion.

**Recommendation:** immediate promotion on the tenth **verified** attendance, plus a
monthly reconciliation check that detects divergence. Corrections that would reduce
the count below ten are **referred to staff**, never applied as a silent demotion.
A rerun must not recreate an existing promotion.

**Activation restriction:** the trigger is recorded in the policy version. No
separate entry point may decide promotion independently — list, detail, batch and
API all call the same evaluator.

**Status: UNRESOLVED — recommendation implemented behind the policy version; monthly reconciliation reports rather than acts.**

---

## D10 — Must every volunteer re-accept revised terms before their next registration?

**Recommendation:** acceptance of the new version is required before the **next
registration**, while all historical acceptances are retained as evidence.

**Activation restriction:** do **not** backfill acceptance and do **not** assume
existing accounts have accepted. The existence of a newer version must not
automatically invalidate every earlier acceptance — the approved policy decides
whether renewed acceptance is required. Changes to the terms create a new version
and never alter historical acceptance evidence.

**Status: UNRESOLVED — the registration endpoint reads the approved policy to decide.**

---

## Consolidated activation blockers

The items below are the only ones that actually gate an operational switch. They
are **not** ten questions to ask up front; they are consolidated here so a single
reviewable decision session can clear them.

| ID | Blocks | Consequence while unresolved |
|---|---|---|
| D01 | Evening session auto-opening | Evening sessions are not opened automatically under the new policy |
| D02 | 48-hour seat release | Release job runs dry-run only, reports `policy_unresolved`, releases nothing |
| D03 | Operational daily-20 counting method | The limit of 20 is still enforced; the deduplication model is used only in isolated fixtures |
| D08 | Publishing new morning sessions | Sessions without configured times cannot be published |

D04, D05, D07, D09 and D10 affect calculations and are implemented behind policy
versions; they do not stop delivery of the surrounding functionality. D06's total-12
invariant is confirmed and enforced today.

## Decision record template

Every decision that is later approved must be recorded with: the original
requirement, the options considered, examples of impact, the recommendation, the
approver, the date, the policy version it produced, and the affected features.
Provisional test values must never be promoted into production policy by default.
