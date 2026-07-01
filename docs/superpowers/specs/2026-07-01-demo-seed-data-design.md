# Demo Seed Data Design

## Summary

Add a small but complete idempotent demo dataset in `supabase/seed.sql`. The seed will populate the project with realistic sample records for animals, sponsor animals, adoption cases, adopters, supporters/donors, donations, payments, receipts, and coordinator workflow data.

The seed is domain data only. Admin login/auth accounts stay managed by the existing `scripts/seed-admin.js`.

## Goals

- Provide useful mock data for every major admin area.
- Make local/demo environments feel populated immediately after Supabase reset.
- Keep the seed safe to rerun by using fixed demo UUIDs and upserts.
- Include Traditional Chinese and English animal content where fields exist.
- Avoid modifying or deleting non-demo records.
- Avoid creating Supabase Auth users or admin login accounts.

## Non-Goals

- No large stress-test dataset.
- No production data import.
- No image upload or storage seeding.
- No admin user/auth seeding.
- No changes to application behavior.

## Placement

Create one committed file:

- `supabase/seed.sql`

This follows Supabase’s standard seed location and keeps the dataset reviewable as SQL.

## Dataset Size

The seed will be small but complete:

- 8 animals
- 6 supporters/donors
- 4 adopter profiles
- 6 donations/payments
- 2 receipts
- 5 adoption applications/cases
- 3 animal matches
- 5 follow-up tasks
- 1 successful adoption

## Seed Content

### Animals

Create 8 demo animals:

- 3 cats
- 2 dogs
- 3 sponsor animals (`type = 'sponsor'`)

The set should include:

- `available`, `fostered`, and `adopted` statuses.
- Chinese and English names.
- Chinese and English age, notes, and descriptions.
- Realistic rescue/adoption text.

### Supporters And Donors

Create 6 demo supporters:

- Donors
- Adopters
- Volunteers
- Foster contacts

Supporters should use demo-safe emails and realistic Hong Kong phone/address style. Tags should mark them as demo records where useful.

### Adopters

Create 4 adopter profiles linked to supporters.

Profiles should include:

- Chinese and English names where appropriate.
- Household details.
- Living area.
- Consent states.
- One profile with a blacklist flag or caution note only if useful for UI coverage.

### Donations, Payments, And Receipts

Create 6 donations/payments:

- Mix of `general`, `medical`, and `sponsor` purposes.
- Mix of FPS, PayMe, manual, and Stripe-like methods.
- Mix of `succeeded` and `pending` statuses.
- Receipt-requested records for receipt UI coverage.

Create 2 issued receipts linked to succeeded donations.

### Adoption Cases

Create 5 adoption applications and matching coordinator cases:

- States covering `new`, `screening`, `matching`, `approved`, and `rejected` or equivalent existing coordinator statuses.
- Linked supporter/adopter records where appropriate.
- Requested animals where useful.
- Assessment and preference JSON populated enough for detail screens.

### Coordinator Workflow

Create workflow data for:

- 3 animal matches.
- 5 follow-up tasks with varied priority, due dates, channels, and completion states.
- 1 successful adoption linked to an approved case, approved match, adopter, supporter, and animal.

This should populate:

- Adoption cases.
- Manual/coordinator case views.
- Coordinator task center.
- Adopter list/detail pages.
- Coordinator reports.
- Supporters/CRM pages.
- Donation/payment/receipt admin areas.

## Idempotency

The seed must be safe to rerun:

- Use fixed UUIDs for demo records.
- Use `ON CONFLICT ... DO UPDATE` for records with primary keys or natural unique keys.
- Resolve coordinator status IDs by `(category, key)` rather than hard-coding status UUIDs.
- Do not delete existing records.
- Do not alter records outside the fixed demo IDs or known demo natural keys.
- Keep demo records identifiable through names, emails, tags, or notes.

## SQL Structure

Recommended structure:

1. `begin;`
2. Section comments for each domain.
3. Upsert lookup/reference data:
   - `living_area`
   - `arrival_source`
   - `animal_position`
   - `adoption_fee`
4. Upsert animals.
5. Upsert supporters and supporter roles.
6. Upsert consents.
7. Upsert adopter profiles.
8. Upsert donation/payment/receipt data.
9. Upsert adoption applications and adoption cases.
10. Upsert animal matches, follow-ups, and successful adoption.
11. Optional audit/timeline-friendly records only if needed.
12. `commit;`

## Safety Rules

- Do not seed Supabase Auth users.
- Do not seed `admin_user`.
- Do not use production-like email addresses.
- Do not depend on external image URLs being reachable.
- Do not assume demo data will be the only data in the database.
- Do not use `truncate`, broad `delete`, or broad `update`.

## Validation

Implementation should verify:

- SQL file has no obvious syntax mistakes.
- Referenced tables and columns exist in migrations.
- Foreign-key relationships are internally consistent.
- Rerunning the seed does not duplicate demo rows.
- Admin pages have meaningful data after seeding.

If local Supabase is configured and safe to reset, run a local seed/reset validation. If not, report that database execution was not run and validate through schema inspection.

## Approved Decisions

None. The approved approach is:

- `supabase/seed.sql`
- Small but complete dataset
- Domain data only
- Fixed UUIDs and upserts
