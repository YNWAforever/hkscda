# Sponsorship Pledge Magic-Link Status Page Design (Slice D)

## Summary

Give the sponsorship pledge confirmation email (shipped in the prior "public sponsorship
pledge submission" slice) a working status link. Today the email includes a reference
number but no way to check status; a `public_status_token` row is already generated for
every pledge but nothing ever redeems it. This slice adds the public status page and
wires the token into the email — mirroring the existing public adoption status page
(`src/routes/adoption/status.$token.tsx`, `src/lib/publicAdoption/statusToken.server.ts`)
file-for-file.

## Current Context

- `persistSponsorshipPledge` (`src/lib/sponsorship/submission.server.ts`) already creates
  a `public_status_token` row per pledge (`entity_type: "sponsorship_pledge"`) and returns
  `statusToken`/`statusUrl`/`expiresAt`, but `sendPledgeConfirmationEmail` never passes the
  URL into the email template — it was intentionally deferred groundwork.
- The generic `public_status_token` table (hashed token, `entity_type`/`entity_id`,
  `expires_at`, `revoked_at`, `last_viewed_at`) and its helpers
  (`hashStatusToken`, `isTokenExpired`, `statusTokenExpiry`) already support this without
  schema changes.
- The adoption status page is the direct precedent for both the server lookup route
  (`src/routes/api/adoption/status/$token.ts`) and the client page
  (`src/components/site/adoption/StatusPage.tsx`): hash the token, look it up scoped by
  `entity_type`, reject on missing/revoked/expired, bump `last_viewed_at`, join detail
  tables, return a flat summary object, render a shared `StateShell` for
  loading/expired/missing/generic-error states plus a rich content view on success.
- `sponsorship_pledge.status` already supports 5 values
  (`pending_payment`, `provisional`, `active`, `needs_followup`, `cancelled`) from the
  Slice A+B migration, even though only the first two are reachable through the app today
  (the admin review slice that sets the other three has not shipped yet).

## Approved Design

### 1. Shared reference helper

Extract `referenceForPledge` out of `submission.server.ts` into a small new pure module
`src/lib/sponsorship/statusSummary.ts` as `pledgeReference(pledgeId)`, and have
`submission.server.ts` import it instead of defining it privately. This avoids a second,
divergent implementation of the same derivation.

### 2. `buildPublicPledgeStatusSummary` — `src/lib/sponsorship/statusSummary.ts`

A pure mapper, structurally parallel to `buildPublicStatusSummary` in
`publicAdoption/statusToken.server.ts`:

```
{
  reference: string;
  submittedAt: string;
  monthlyTier: "100" | "300" | "500" | "custom";
  amountCents: number;
  status: SponsorshipPledgeStatus;
  rankedAnimals: Array<{ rank: number; name: string }>;
  hasPaymentProof: boolean;
  expiresAt: string;
}
```

Deliberately excludes contact PII, the payment proof image, and payment
reference/amount/date detail — `hasPaymentProof` is a boolean derived from whether a
`sponsorship_payment_proof` row exists, not the row's contents. This matches the adoption
status page's minimal-disclosure precedent (no photos, no internal fields).

### 3. API route — `src/routes/api/sponsorships/status/$token.ts`

Same control flow as `api/adoption/status/$token.ts`:

1. Missing token → 404 `{error: "Status link not found"}`.
2. Hash token, look up `public_status_token` filtered to
   `entity_type = "sponsorship_pledge"`.
3. Not found → 404. Revoked or expired (`isTokenExpired`) → 410
   `{error: "Status link expired"}`.
4. Update `last_viewed_at` (log-and-continue on failure, never blocks the response).
5. Join `sponsorship_pledge` (id, created_at, monthly_tier, amount_cents, status) and
   `sponsorship_preference` (rank, animal_name_snapshot), and check existence of a
   `sponsorship_payment_proof` row for `hasPaymentProof`.
6. Missing pledge row → 404. Otherwise return
   `jsonNoStore({ status: buildPublicPledgeStatusSummary(...) })`.
7. Any unexpected error → logged, generic 500.

### 4. Client — `PledgeStatusPage` + route wrapper

- `src/components/site/sponsorship/PledgeStatusPage.tsx`: same `useQuery` + `StateShell`
  pattern as `StatusPage.tsx` (Loading / Expired (410) / Missing (404) / GenericError
  (5xx, with retry) / Content). Uses the app's existing dashed-card / token-driven styling,
  consistent with the rest of the sponsorship UI shipped in the prior slices.
- `src/routes/sponsors_.status.$token.tsx`: thin route wrapper, trailing-underscore
  convention matching the existing `sponsors_.$id.tsx` / `sponsors_.pledge.tsx` siblings so
  it doesn't nest under `sponsors.tsx`'s layout.
- Content view shows: reference, submitted date, monthly amount (via `centsToHkd`) and
  tier, ranked sponsor animal list, and a status card whose message and tone come from a
  `PLEDGE_STATUS_COPY` lookup covering **all 5** status values (approved decision — costs
  nothing now and means Slice C's transitions display correctly with no follow-up work):
  - `pending_payment` — "等待您的付款" — includes the same static FPS / bank transfer /
    PayMe / PayPal / Give.asia payment-instructions block reused from the confirmation
    email, so the page is self-sufficient without the user needing to find the original
    email.
  - `provisional` — "已收到付款證明，正在核實中"
  - `active` — "助養已確認，多謝支持！"
  - `needs_followup` — "需要您協助跟進" + a `mailto:` CTA referencing the pledge
    reference, matching the adoption status page's expired-link mailto pattern.
  - `cancelled` — "此助養承諾已取消"

### 5. Wire the token into the confirmation email

`renderPledgeConfirmationEmail` (`src/lib/sponsorship/emailTemplates.server.ts`) gains an
optional-no-longer status URL parameter and includes a "查看助養狀態" / "View sponsorship
status" link, matching the adoption confirmation email's existing pattern.
`sendPledgeConfirmationEmail` passes `result.statusUrl` through. This is the one change
that touches the previously-shipped submission slice; everything else in this design is
new files.

## Error Handling

Identical to the adoption precedent: missing/invalid token and expired/revoked tokens are
distinguished (404 vs 410) so the client can show a "wrong link" vs "expired, request a
new one" message; `last_viewed_at` update failures are logged but never fail the request;
unexpected errors return a generic message with no internal detail leaked.

## Testing Plan

- `buildPublicPledgeStatusSummary`: correct mapping for each of the 5 statuses, and both
  `hasPaymentProof: true/false` cases.
- `pledgeReference`: unchanged behavior after extraction (existing
  `submission.server.test.ts` reference-format assertions continue to pass unmodified).
- Route: 404 (missing token, missing pledge row), 410 (expired, revoked), 200 (happy path)
  using the same fake-Supabase-client pattern established in
  `submission.server.test.ts`.
- Email template: the "查看助養狀態" link renders and is HTML-escaped.
- No new client-side tests — `StatusPage.tsx` has none either; this mirrors that
  precedent.

## Out of Scope

- A resend-link flow (the adoption status page doesn't have one either — just a `mailto:`
  fallback on the expired state).
- Any admin-facing status editing or transition UI (Slice C).
- Recurring billing, reminders, or further lifecycle emails beyond the confirmation link.

## Design Defaults

- Mirror the adoption status page's file layout, control flow, and minimal-disclosure
  principle exactly.
- Reuse the generic `public_status_token` table and helpers without schema changes.
- Cover all 5 pledge statuses in the status-copy map now, even though only 2 are reachable
  before Slice C ships.
