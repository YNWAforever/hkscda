# Public Sponsorship Pledge Submission Design (Phase 2, Slice A+B)

## Summary

Turn the `開始助養` call-to-action into a real public sponsorship pledge flow. A
visitor shortlists up to 10 sponsor animals (already shipped), opens a guided
`/sponsors/pledge` wizard, chooses a monthly support tier, provides contact +
consent, **optionally** uploads a payment proof, and submits. The server creates
or matches a CRM supporter, writes the pledge + ranked preferences (+ optional
proof), and emails a bilingual confirmation with a reference.

This is **Phase 2, Slice A+B** (data model + public submit flow) from the
[public adoption & sponsorship journey blueprint](./2026-07-02-public-adoption-sponsorship-journey-design.md).
It builds on the [Phase 1 shortlist work](./2026-07-02-sponsorship-shortlist-ui-design.md).
Staff review (Slice C) and the magic-link status page + lifecycle emails (Slice D)
are explicitly out of scope here.

## Approved Decisions

- **Tiers:** a fixed set of monthly tiers (HK$100 / HK$300 / HK$500) plus an
  optional custom amount, mirroring the donate page's amount buttons.
- **Payment proof:** optional at submit. With proof → pledge state `provisional`
  (awaiting staff review); without proof → `pending_payment`, and the
  confirmation email carries manual payment instructions.
- **Confirmation:** email + reference now. The status token is generated (for
  Slice D), but the magic-link status-page sponsorship section is deferred to
  Slice D. No public status page is built in this slice.

## Reuse Map (grounding)

The public adoption submission pipeline is mirrored file-for-file. Reused verbatim
or by close analogy:

- **Request skeleton** (`src/routes/api/adoption/applications.ts`): `getClientIp`
  → `enforceRateLimit` → header validation → multipart parse (`payload` JSON +
  typed file fields) → `verifyTurnstile` → `createSupabaseServiceClient` →
  transactional persist → email. `jsonNoStore` responses.
- **Security** (`src/lib/security/*`): `verifyTurnstile` (fails open when
  unconfigured, closed when configured), `enforceRateLimit` (Upstash sliding
  window, fails open), `getClientIp`.
- **Status token** (`src/lib/publicAdoption/statusToken.server.ts`):
  `createStatusTokenPair()` → `{rawToken, tokenHash}`, `statusTokenExpiry()`
  (+30 days). The `public_status_token` table is generic
  (`entity_type`/`entity_id`), so pledges insert `entity_type:
  'sponsorship_pledge'`.
- **Email ledger** (`sendAdoptionConfirmationEmail` pattern): insert a `message`
  row (`channel 'email'`, status `queued`) first, then send via Resend, then
  update `sent`/`failed`; never throws.
- **Config** (`src/lib/donations/config.server.ts`): `getAppUrl`,
  `getEmailConfig`.
- **Payment helpers** (`src/lib/donations/*`): payment-method enum + manual
  FPS/PayMe instruction generation + reference-number generation.
- **Supporter linkage** (`src/lib/crm/*`): upsert/match a supporter by email —
  the difference from adoption, which links the email recipient via
  `adoption_case.supporter_id`. A pledge must supply its own supporter.

## Data Model

One migration `supabase/migrations/<timestamp>_sponsorship_pledge_phase_2.sql`,
following Phase-1 conventions: RLS enabled, all writes via service-role only, no
anon read/write grants, private storage bucket with admin/service-role-only
policies. Use the "RPC in public schema granted to service_role" pattern only if
a routine is actually required (direct service-role inserts, like adoption, are
expected to suffice).

### `sponsorship_pledge`

- `id` uuid pk
- `supporter_id` uuid not null → `supporter(id)`
- `monthly_tier` text not null CHECK in (`'100'`, `'300'`, `'500'`, `'custom'`)
- `amount_cents` integer not null (the chosen monthly amount in cents)
- `currency` text not null default `'HKD'`
- `language` text not null (`'zh-HK'` | `'en'`)
- `notes` text null
- `status` text not null default `'pending_payment'` CHECK in
  (`'pending_payment'`, `'provisional'`, `'active'`, `'needs_followup'`,
  `'cancelled'`)
- `reference` text not null unique
- `created_at`, `updated_at` timestamptz default now()

### `sponsorship_preference`

- `id` uuid pk
- `pledge_id` uuid not null → `sponsorship_pledge(id)` on delete cascade
- `sponsor_animal_id` uuid null (snapshot-friendly; not a hard FK so animal
  changes/removals don't break history)
- `rank` integer not null
- `animal_name_snapshot` text not null
- `animal_type_snapshot` text not null
- `created_at` timestamptz default now()

### `sponsorship_payment_proof`

- `id` uuid pk
- `pledge_id` uuid not null → `sponsorship_pledge(id)` on delete cascade
- `storage_path` text not null (path within the private bucket)
- `file_name` text not null
- `file_type` text not null
- `file_size` integer not null
- `payment_method` text not null
- `reference` text null (payer-supplied reference)
- `amount_cents` integer not null
- `payment_date` date not null
- `review_status` text not null default `'pending'`
- `created_at` timestamptz default now()

### Storage

Private bucket `sponsorship-proof`, mirroring the adoption photo bucket: no public
access, admin/service-role only, ownership + allowed-MIME validated server-side.

### State usage in this slice

The `status` CHECK includes all five blueprint states, but A+B only ever writes
`pending_payment` (no proof) or `provisional` (proof attached). `active`,
`needs_followup`, and `cancelled` are set by staff in Slice C.

## Public Submit Flow (server)

New module `src/lib/sponsorship/`, mirroring `src/lib/publicAdoption/`:

- `schemas.ts` — zod schemas + `to*Insert` mappers:
  - pledge submission: `monthlyTier` enum + custom-amount rule (custom requires a
    positive `amount`; presets fix the amount), contact fields, consents,
    `animalPreferences` (≥1, ≤10, ranked), optional `proof` descriptor.
  - `validateProofDescriptor` (per-file: category/MIME/size), `MAX_PROOF_BYTES`
    (8 MB), `PROOF_MIME_TYPES` (jpeg/png/webp/pdf).
  - `toPledgeInsert`, `toPreferenceInserts`, `toPaymentProofInsert`
    (camelCase → snake_case).
- `submission.server.ts` — bucket constant, `validate…RequestHeaders`,
  `parseSponsorshipMultipart` (`payload` JSON + optional single `proof` file),
  `persistSponsorshipPledge` (transactional, accumulates `pledgeId` +
  `uploadedPaths` and cleans them up on any failure), `sendPledgeConfirmationEmail`,
  and an error guard that re-throws a generic message.
- `emailTemplates.server.ts` — `renderPledgeConfirmationEmail({language,
  supporterName, reference, tierLabel, amountCents, status,
  paymentInstructions?})` → `{subject, html}`, bilingual, HTML-escapes all
  interpolation. Includes manual FPS/PayMe instructions when
  `status === 'pending_payment'`.
- Supporter linkage reuses the CRM upsert-by-email helper; consents captured like
  the donate page.

### Route

`src/routes/api/sponsorships/pledges.ts` — POST handler, ordering identical to
adoption:

1. `getClientIp` → `enforceRateLimit` (prefix `'sponsorship'`, max 5, window
   `'1 m'`).
2. `validateSponsorshipSubmissionRequestHeaders` (content-type, multipart,
   content-length ceiling).
3. `parseSponsorshipMultipart`.
4. `verifyTurnstile(token, ip)`.
5. `createSupabaseServiceClient`.
6. Upsert/match supporter by email.
7. `persistSponsorshipPledge`: insert pledge (status derived from proof
   presence), preference rows, optional proof upload + row; generate + insert
   `public_status_token` (`entity_type 'sponsorship_pledge'`).
8. `sendPledgeConfirmationEmail` (failure ignored).

Returns `201 {pledgeId, reference}` with `no-store`. Validation → 400,
oversized → 413, wrong content-type → 415, everything else → 500 (generic body).

## Client Wizard

- New route `src/routes/sponsors.pledge.tsx` mounting a `PledgeWizard` component
  under `src/components/site/sponsorship/`.
- Reads the sponsorship shortlist via `useShortlist()` (`intent === 'sponsorship'`).
  If empty, show an empty state linking back to `/sponsors`.
- Bilingual (zh-HK / en toggle, like `donate.tsx`). Linear steps:
  1. **Selected animals** — reorder/remove sponsorship shortlist items (≤10).
  2. **Monthly tier** — HK$100 / 300 / 500 buttons + optional custom amount.
  3. **Contact & consent** — name, email, phone, language, email/WhatsApp consent.
  4. **Payment proof (optional)** — method, reference, amount, date, and one image
     upload; skippable.
  5. **Review & submit** — summary + terms; on submit builds `FormData`
     (`payload` JSON with tier/contact/consents/animalPreferences/proof-metadata,
     plus a single optional `proof` file field) and POSTs.
- On success: `clearIntent('sponsorship')` (reuses the Phase-1 helper) and shows
  the reference + next steps. Local draft autosave reuses the adoption draft
  pattern (text answers only; the proof file is never persisted).
- Update `ShortlistTray` `開始助養` link: `to="/sponsors"` → `to="/sponsors/pledge"`.

## Error Handling

Mirrors adoption:

- Invalid payload / descriptor → structured 400; oversized body → 413; bad
  content-type → 415.
- Turnstile + rate-limit fail open when unconfigured (dev/preview/tests keyless).
- `persistSponsorshipPledge` is transactional: on any failure it removes uploaded
  proof files, deletes the status token, and deletes the pledge (children
  FK-cascade), then re-throws a generic message so internals never leak.
- Email failure is logged (ledger row `failed`) but never rolls back the pledge.
- Client: validation errors map to the relevant step; submit errors preserve the
  local draft until success.

## Testing Plan (bun test, TDD)

- **schemas:** tier/custom-amount validation, proof descriptor (MIME/size),
  animal-preference bounds (≥1, ≤10) and ranking, `to*Insert` mappers.
- **submission.server:** persist step ordering; `provisional` vs
  `pending_payment` derived from proof presence; supporter upsert linkage;
  status-token creation with `entity_type 'sponsorship_pledge'`; orphan cleanup
  removes proof + token + pledge on a mid-persist failure; email returns
  `queued`/`sent`/`failed` and never throws.
- **email templates:** bilingual render, HTML-escaping, payment-instructions
  branch present only for `pending_payment`.
- **route:** rate-limit and Turnstile gating, `201` shape, `no-store` header,
  400/413/415/500 mapping.
- **migration safety:** new tables, constraints, and the private bucket exist and
  are anon-inaccessible (mirror the existing migration test).

## Out Of Scope (later slices)

- **Slice C:** admin intake lane for payment proof, pledge detail + review,
  `active` / `needs_followup` / `cancelled` transitions, supporter timeline
  entries.
- **Slice D:** magic-link status-page sponsorship section; proof-received,
  payment-confirmed, and rejection/cancellation emails.
- Recurring/automatic billing, monthly payment reminders, and public editing or
  cancellation of a pledge.

## Design Defaults

- Mirror `src/lib/publicAdoption/` structure in a new `src/lib/sponsorship/`.
- Reuse the generic `public_status_token`, Turnstile, rate-limit, email-ledger,
  config, payment-instruction, and CRM-supporter helpers rather than
  reimplementing them.
- Store the chosen monthly amount as `amount_cents` plus a `monthly_tier` label.
- Snapshot animal name/type on each preference row; keep `sponsor_animal_id` soft.
- Derive pledge status purely from whether a proof was attached at submit.
