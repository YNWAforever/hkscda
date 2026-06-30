# Phase 3 — Donations/Payments Reconcile (Finance Console) — Design

**Date:** 2026-06-30
**Branch:** `feat/admin-shell-ux` (continues the sequential admin UX overhaul; Phase 1 shell + Phase 2 primitives already merged in PR #12)
**Status:** Approved (scope: full finance console; placement: extracted component at existing route; gating: API-enforced + graceful 403)

## Goal

Replace the raw, hand-rolled payments table at `/admin?section=payments` with a proper **finance console** that lets staff/treasurers run the full manual-reconcile lifecycle on the Phase 2 design primitives (`DataTable`, `StatusPill`):

- Confirm manual (FPS / PayMe / manual) payments awaiting bank settlement.
- Manage donation receipts (issue / re-issue / void) inline.
- Export a payments CSV.
- Review recent finance activity (mark-received / receipt issue / receipt void).

The reconcile/receipt **backend and API routes already exist** — this phase is almost entirely UI, plus three small additive backend *reads*.

## Background — what already exists

Server (`src/lib/donations/`):
- `reconcileManualPayment({ client, paymentId, actorUserId, bankReference })` — flips a pending manual payment + its donation to `succeeded`, issues a receipt if eligible, sends the acknowledgement, and writes an `audit_log` row (`payment.mark_received`).
- `issueReceiptForDonation(...)` / `voidReceipt(...)` — receipt lifecycle, both audit-logged (`receipt.issue`, `receipt.void`).
- `listAdminPayments(client)` — latest 100 payments joined to donation + supporter.

API routes (`src/routes/api/admin/`):
- `GET /api/admin/payments` — roles `staff/treasurer/admin`.
- `POST /api/admin/payments/$id/reconcile` `{ bankReference }` — roles `treasurer/admin`.
- `POST /api/admin/receipts` `{ donationId, supporterId? }` — roles `treasurer/admin`.
- `POST /api/admin/receipts/$id/void` `{ supporterId? }` — roles `treasurer/admin`.
- `GET /api/admin/exports/donations.csv` — CRM-based donations export.

UI today (`src/routes/admin/index.tsx`, the `section === "payments"` branch):
- A raw `<table>` with hardcoded Tailwind colours (`bg-green-100`, `bg-amber-100`, `bg-gray-100`) — bypasses the Phase 2 `DataTable`/`StatusPill` and the CSS-variable token rule.
- Renders only two states ("已確認" vs "待確認"), so `failed` and `refunded` payments both show misleadingly as "待確認".
- `window.prompt()` for the bank reference; no validation, confirm, or success/error feedback.
- No queue framing, summary, or filters; lives inline inside an already-overloaded `index.tsx`.

The CRM (`src/components/admin/crm/`) is the **donor-centric** counterpart: `SupporterDetail` already does per-supporter receipt issue/void with good UX. The finance console is the **transaction-centric** counterpart (a reconcile queue across all donors) and reuses the same backend.

## Non-goals (YAGNI)

- No change to webhook reconciliation (Stripe/PayPal auto-flow is untouched).
- No admin-initiated refunds or amount edits — refunds remain provider-side via webhooks. "Mark received" stays manual-payment-only, matching the existing API.
- Manual *donation entry* stays in the CRM's `ManualDonationDialog` (not duplicated here).
- No bulk-reconcile in v1.
- No new pagination beyond the existing 100-row cap (documented limitation; filters operate client-side over that window).

## Architecture

### New component package: `src/components/admin/donations/`

| File | Responsibility | React? |
|------|----------------|--------|
| `paymentsReconcileLogic.ts` (+ `.test.ts`) | Status→tone mapping; `canReconcile` / `canIssueReceipt` / `canVoidReceipt` predicates; join receipts→payments; `applyPaymentFilters`; `summarizePayments`. | No (pure) |
| `PaymentsReconcile.tsx` | The console shell: summary cards → filters → `DataTable` (desktop rows + mobile cards) → activity feed. Owns React Query queries/mutations. | Yes |
| `ReconcileDialog.tsx` | shadcn `Dialog` replacing `window.prompt`: bank-reference input, validation (1–120 chars, matching the server schema), confirm/cancel, pending state, error surfacing. | Yes |

Pure logic lives in `paymentsReconcileLogic.ts` so the workflow rules are unit-tested without rendering — matching the established `*Logic.ts` + `*Logic.test.ts` pattern (`taskCenterLogic`, `animalPipelineLogic`, etc.).

### Shared client helper

`fetchAdminJson` is currently duplicated in `src/components/admin/crm/api.ts` and inline in `admin/index.tsx`. Lift the canonical version (the CRM one — it surfaces server `error` messages) to a single shared client helper (`src/lib/admin/http.client.ts` exporting `fetchAdminJson` + `getAdminAccessToken`); point `crm/api.ts` and the new donations component at it. Avoids a third copy.

### `admin/index.tsx` slim-down

The `section === "payments"` branch becomes `<PaymentsReconcile />`. Removed from `index.tsx`: the `PaymentRow` type, `reconcilePayment`, `issueReceipt`, the payments `useQuery`, and the duplicate `fetchAdminJson`/`formatHkd`. The nav, route, search schema, and `activeSection` wiring are unchanged (Phase 1/2 discipline: presentation only).

### Backend — three additive reads (no writes changed)

1. **Extend `GET /api/admin/payments`** to return `{ payments, receipts }`.
   - Add `listAdminReceipts(client)` in `supabase.server.ts`: recent receipts selecting `id, receipt_no, donation_ids, status` (e.g. last 200, covering the payment window).
   - Receipts link to donations through the `donation_ids` array (no FK), so the payment↔receipt join is done in `paymentsReconcileLogic` by `donation.id ∈ receipt.donation_ids` — the same approach `SupporterDetail` uses.
   - Purely additive to the response; existing consumers ignore the new key.

2. **New `GET /api/admin/finance/activity`** — recent `audit_log` rows where `action ∈ {payment.mark_received, receipt.issue, receipt.void}`, newest first (e.g. last 50), returning `{ actor (email), action, entityId, detail, createdAt }`. Read-only; roles `staff/treasurer/admin`. Actor email resolved by joining `audit_log.actor_user_id` to the admin/user table (same lookup `requireAdmin` already performs); `actor: null` for system/webhook-driven voids.

3. **New `GET /api/admin/exports/payments.csv`** — payments CSV (donor name/email, provider, amount, purpose, status, provider_ref, bank_reference, received_at, created_at), reusing the `listAdminPayments` projection. Roles `treasurer/admin`. Mirrors the existing `donations.csv` route; downloaded via the authenticated-blob pattern from `adoptions/ExportButton`.

## Data flow

On mount (`section === "payments"`), `PaymentsReconcile`:
1. `GET /api/admin/payments` → `{ payments[], receipts[] }`
2. `GET /api/admin/finance/activity` → `{ activity[] }`

`paymentsReconcileLogic` then:
- joins each payment to its issued/void receipt (by donation id),
- computes summary counts,
- applies the active filters (status, provider, text search) to produce the visible rows.

Actions (each invalidates `["admin-payments"]` and `["admin-finance-activity"]` on success):
- **標記已收款** → `ReconcileDialog` → `POST /api/admin/payments/$id/reconcile { bankReference }`
- **發/補發收條** → `POST /api/admin/receipts { donationId }`
- **作廢收條** → confirm → `POST /api/admin/receipts/$id/void`
- **匯出 CSV** (header) → authenticated download of `/api/admin/exports/payments.csv`

## Status mapping (`StatusPill` tones)

Payment status:
| status | tone | label |
|--------|------|-------|
| pending | `warning` | 待確認 |
| succeeded | `success` | 已確認 |
| failed | `danger` | 失敗 |
| refunded | `neutral` | 已退款 |

Receipt status (derived from the joined receipt):
| condition | tone | label |
|-----------|------|-------|
| issued receipt exists | `success` | 已發 #`receipt_no` |
| void receipt exists | `neutral` | 已作廢 |
| succeeded + receiptRequested + none issued | `warning` | 待發收條 |
| receipt not requested | — | — |

This fixes the current bug where `failed`/`refunded` both render as "待確認".

## Row actions — gated by logic predicates

- `canReconcile(payment)` → `status === "pending"` AND `provider ∈ {fps, payme, manual}`
- `canIssueReceipt(payment, receipt)` → `donation.status === "succeeded"` AND `donation.receiptRequested` AND no issued receipt for the donation
- `canVoidReceipt(receipt)` → an issued receipt exists for the donation

## Summary + filters

- **Summary cards (top):** 待確認手動收款 (count of `canReconcile`), 待發收條 (count of `canIssueReceipt`), and confirmed total amount among the currently visible rows.
- **Filters (client-side over the ≤100 loaded rows):** status (all / pending / succeeded / failed / refunded), provider (all / stripe / paypal / fps / payme / manual), and a text search over donor name / email / provider_ref / bank_reference.

## Activity feed

A compact, read-only list under the table: newest finance actions first, each line = actor email · localized action label · target (receipt no / donor) · relative time. Renders the `GET /api/admin/finance/activity` payload. Empty state when there is no recent activity.

## Write-action gating (decided: API-enforced + graceful 403)

There is no client-side endpoint exposing the admin's role today (the client only knows the signed-in email). The reconcile/receipt APIs require `treasurer/admin` and enforce it server-side. Decision: **do not** build a role-broadcast endpoint to hide buttons. Show the actions; when a non-treasurer triggers one, the mutation's 403 is caught and surfaced as a clear message (e.g. "需要司庫權限"). The API remains the single security boundary. A future `GET /api/admin/me { email, role }` for pre-emptive button gating is noted as an optional later enhancement, out of scope here.

## Error / feedback handling

All mutations use React Query and render their `error.message` inline (the lifted `fetchAdminJson` already extracts the server `error` string). Success refreshes the queries so the row's status/receipt pill and the activity feed update without a manual reload. The `ReconcileDialog` shows pending and error states and only closes on success.

## Testing

`paymentsReconcileLogic.test.ts` covers:
- payment + receipt status→tone/label mapping (all four payment states; all receipt conditions),
- `canReconcile` / `canIssueReceipt` / `canVoidReceipt` across representative rows,
- receipt→payment join by `donation_ids` containment,
- `applyPaymentFilters` (status, provider, search; combined),
- `summarizePayments` counts and confirmed total.

If the activity endpoint grows any non-trivial mapping (e.g. action→label, actor resolution), extract it to a pure helper and test it too. Keep `bun test` green; no new `tsc`/`eslint` errors.

## Verification

Admin pages sit behind login, so headless screenshots aren't possible. Verify with:
- `bun test` (all green), `bun run lint`, `tsc` (no new errors),
- a Vercel preview deploy for the real interactive UI (matching the Phase 2 verification note).

## Out of scope / future

- `GET /api/admin/me` role endpoint for pre-emptive button gating.
- Server-side pagination / search beyond the 100-row window.
- Bulk reconcile.
- Phase 4 (mobile polish) builds on the `DataTable` mobile-card seam this phase exercises.
