# Full migration catch-up — applied to production

Recorded 2026-09-12 · production project `iihqjzilgawhfdhdevam` · **all 12 migrations applied**

Supersedes the status line in `17-full-catchup-release-request.md` ("nothing
applied to production"). That document's rehearsal, ordering, and rollback
analysis stand unchanged; this is the record that approval was given and the
release was executed.

## Approval

Explicit approval was given to apply all 12 rehearsed migrations to
production now, given the live incident (`14-live-incident-sponsorship-submissions.md`):
the public sponsorship form has been failing since PR #112 deployed ahead of
its required schema.

## Applied, in the rehearsed order, via `apply_migration`

```
20260905144848_public_supporter_identity_claims
20260911120000_sponsorship_public_identity_protection
20260905155357_crm_manual_gift_delivery_jobs
20260905163900_volunteer_atomic_approval
20260911130000_animal_images_bucket
20260911140000_animal_publication_state
20260911150000_preserve_eligibility_on_species_change
20260911160000_correct_legacy_sponsor_species
20260911170000_publish_fostered_animals
20260911180000_sponsorship_second_month
20260911190000_sponsorship_monthly_ledger
20260912120000_sponsorship_assignments
```

Each was applied individually, one at a time, in this exact sequence — not as
a single batch — so a failure partway through would stop with a known-good
prefix rather than an ambiguous partial state. All 12 succeeded.

## Post-apply verification

A single comprehensive query against production confirmed every object the
rehearsal (`17`) identified as absent is now present:

- Tables: `supporter_consent_intent`, `manual_gift_request`,
  `donation_delivery_job`, `sponsorship_period`,
  `sponsorship_payment_allocation`, `sponsorship_assignment`
- Functions: `resolve_public_supporter_identity`,
  `record_manual_gift_with_audit`, `claim_donation_delivery_job`,
  `volunteer_activity_counts`, `assign_sponsorship_animal_with_audit`,
  `review_sponsorship_payment_proof` (confirmed on the new 6-argument
  signature from `20260911180000`, not the old one)

This closes the schema gap the live incident traced to: the public
sponsorship form's required tables and RPCs now exist in production.

## Post-apply advisor check

Ran Supabase's standard post-DDL advisor check (`get_advisors`, both
`security` and `performance`) as recommended after schema changes. Findings
reviewed against what predates this session's 12 migrations:

- The large majority of findings (RLS-enabled-no-policy on service-role-only
  tables, unindexed foreign keys, unused indexes, a handful of
  `security definer` functions callable by `anon`/`authenticated`) are
  long-standing, spread across tables untouched by this release, and match
  patterns already present on sibling tables elsewhere in the schema.
- The only findings touching tables from this release
  (`supporter_consent_intent`, `manual_gift_request`, `donation_delivery_job`,
  `sponsorship_assignment`, `sponsorship_payment_allocation`) are "unindexed
  foreign key" and "unused index" — expected for tables that are brand new
  and have not yet taken production traffic, not a defect introduced by
  these migrations.
- No new WARN-level finding traces to an object created or changed by the 12
  migrations above.

No follow-up migration is required as a result of this check.

## Findings carried forward from the rehearsal, restated

Both were flagged in `17` before applying and remain true after:

- **Species correction is a no-op today.** Production's 3 real
  `type='sponsor'` animals all have `code: null`, so
  `20260911160000`'s mapping matches none of them — it runs cleanly and
  changes nothing. This is a data-quality gap in the source records, not a
  bug in the migration; reclassifying those 3 animals is a separate,
  unscheduled follow-up.
- **The `animal-images` bucket was genuinely missing.** Contrary to
  `20260911130000`'s own comment claiming it existed in production,
  production's `storage.buckets` did not contain it before this release.
  `20260911130000` created it (`on conflict do nothing`, so this was safe
  regardless of which way the discrepancy resolved).

## What this establishes, and what it doesn't

- Establishes: production's schema now matches `main` — the same 12
  migrations rehearsed in `17` are applied, verified present, and the
  targeted advisor check found nothing they introduced that needs fixing.
- Does not establish: row-level reconciliation of the 3 real
  `type='sponsor'` animals' `code` values against the 128-entry mapping —
  still open, still a separate follow-up, not a blocker for this release.
