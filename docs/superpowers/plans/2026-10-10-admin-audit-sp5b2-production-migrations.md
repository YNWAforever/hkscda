# SP-5b-2 production migration runbook

This runbook is for the owner. It covers the six migrations that SP-5b-2 (required reasons for financial and irreversible admin actions) adds, in the order to apply them. Nothing here has been applied to production.

## Summary

- **The order is fixed.** Apply all six migrations to production first, run each verification query and the release schema check, then merge and deploy. The app on this branch must not reach production before the migrations.
- The migrations are backward compatible (plan D1): every new argument is `p_reason text default null`, and the RPCs that take a jsonb payload read `payload->>'reason'`. The app that is deployed today sends no reason and keeps working against the migrated database, so there is no hurry between applying the migrations and the deploy.
- The new app does **not** work against the old database for M1, M2 and M4. It names `p_reason` when it calls `void_receipt_with_audit`, `set_volunteer_registration_status_with_audit` and `deactivate_faq_entry_with_audit`, and PostgREST matches a call by its named arguments. Against the old functions it finds no match and answers `PGRST202` (404, "could not find the function"). Until M1, M2 and M4 are applied, every receipt void, every FAQ deactivation and every volunteer registration status change (approve and waitlist included, not only reject) fails. The release schema check reports `incompatible` until they are applied, which is why it must be green before the merge.
- For M5 and M6 the new app would keep working against the old database, but the reasons for estate deletes, board member step-downs and coordinator status deletes would be silently dropped, because the old RPC bodies ignore the payload key. That is not a reason to change the order above.
- The database itself does not require a reason after these migrations. Making the database reject a missing reason is a follow-up migration, to be written after this branch has been deployed and the old app is gone.

## Before you start

- Use a database connection you trust. Do not paste a connection string into a chat, a ticket or this file.
- Apply the migrations in the order below with your usual process (`supabase db push` against the linked project, or the SQL editor, one file at a time). Each file is self-contained.
- Apply each file once. M1, M2 and M4 drop the old identity and then `create function` the new one, so a re-run errors (42723, the function already exists) and changes nothing; that error is harmless. M3, M5 and M6 use `create or replace` and may be re-run.
- Run each file inside one transaction, so there is no instant when neither the old nor the new identity of a function exists. `supabase db push` and the SQL editor both do this for a file.
- M1, M2 and M4 change an RPC signature, so PostgREST must reload its schema cache. Supabase does this on its own through its DDL event trigger. If a call made after the migration still answers `PGRST202`, run `notify pgrst, 'reload schema';` and try again.
- Do not run them against the shared local stack on port 55321.

## Database tests have not been run

The `*.database.test.ts` files for M1 to M6 have never been run against a real database. Only the static body-diff tests (`*.migration.test.ts`) have run. Before production, run each one against an **isolated, disposable** Postgres (not the shared stack and not production), with its own variable set to that database's URL. Each file refuses a URL that is not a `postgresql://` URL on `127.0.0.1`, that uses port 55321, or that carries a query or fragment; when its variable is unset the file skips.

| Migration | Test file                                                          | Environment variable                        |
| --------- | ------------------------------------------------------------------ | ------------------------------------------- |
| M1        | `src/lib/donations/receiptVoidReason.database.test.ts`             | `SP5B2_RECEIPT_VOID_TEST_DATABASE_URL`      |
| M2        | `src/lib/volunteers/registrationReason.database.test.ts`           | `SP5B2_VOLUNTEER_REASON_TEST_DATABASE_URL`  |
| M3        | `src/lib/internships/reviewAuditReason.database.test.ts`           | `SP5B2_INTERNSHIP_REASON_TEST_DATABASE_URL` |
| M4        | `src/lib/faq/deactivateReason.database.test.ts`                    | `SP5B2_FAQ_REASON_TEST_DATABASE_URL`        |
| M5        | `src/lib/adoptionInformation/contentDeleteReason.database.test.ts` | `SP5B2_CONTENT_REASON_TEST_DATABASE_URL`    |
| M6        | `src/lib/adoptions/statusDeleteReason.database.test.ts`            | `SP5B2_STATUS_REASON_TEST_DATABASE_URL`     |

Each file reads its own variable (grep the file for `process.env` to confirm the name before use). Apply the full migration history to the disposable database first, then run for example `bun test src/lib/donations/receiptVoidReason.database.test.ts`.

## The six migrations, in order

For every migration, run its verification query on production after applying it. The queries are read-only. In each `like` pattern the underscore is escaped (`\_`), because a bare `_` matches any single character.

### M1. `20261010130000_sp5b2_receipt_void_reason.sql`

- **Changes:** `void_receipt_with_audit` gains `p_reason text default null`. The old identity `(uuid, uuid, uuid)` is dropped and the function recreated, so there is never a second overload. A null or blank reason is stored as `'manual'`, which is what the previous definition always stored.
- **Verify:**

```sql
select pg_get_function_identity_arguments(oid) as identity_arguments
from pg_proc
where proname = 'void_receipt_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect one row: p_receipt_id uuid, p_actor uuid, p_supporter_id uuid, p_reason text

select prosrc like '%p\_reason%' as records_reason
from pg_proc
where proname = 'void_receipt_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect: t
```

### M2. `20261010130100_sp5b2_volunteer_registration_reason.sql`

- **Changes:** `set_volunteer_registration_status_with_audit` gains `p_reason text default null`; the old six-argument identity is dropped and the function recreated. The audit detail adds `reason` when one is sent and is unchanged otherwise.
- **Verify:**

```sql
select pg_get_function_identity_arguments(oid) as identity_arguments
from pg_proc
where proname = 'set_volunteer_registration_status_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect one row, ending in: p_update_internal_notes boolean, p_reason text

select prosrc like '%p\_reason%' as records_reason
from pg_proc
where proname = 'set_volunteer_registration_status_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect: t
```

### M3. `20261010130200_sp5b2_internship_review_audit_reason.sql`

- **Changes:** `internship_command` keeps its identity `(p_actor uuid, p_command jsonb)`. The `review` audit detail adds `status` and `reason`. The stored replay result is unchanged.
- **App change that ships with it:** the length cap on an internship review reason (approve, reject and needs_information) moves from 2000 to 500 characters (Ruling 5, the shared reason contract). A longer reason gets a 400; staff must shorten it.
- **Verify:**

```sql
select pg_get_function_identity_arguments(oid) as identity_arguments
from pg_proc
where proname = 'internship_command'
  and pronamespace = 'public'::regnamespace;
-- expect one row: p_actor uuid, p_command jsonb

select prosrc like '%''status'', p\_command->>''status'', ''reason''%' as records_status_and_reason
from pg_proc
where proname = 'internship_command'
  and pronamespace = 'public'::regnamespace;
-- expect: t
```

### M4. `20261010130300_sp5b2_faq_deactivate_reason.sql`

- **Changes:** `deactivate_faq_entry_with_audit` gains `p_reason text default null`; the old `(uuid, uuid)` identity is dropped and the function recreated. The audit detail is `{}` without a reason, as before.
- **Verify:**

```sql
select pg_get_function_identity_arguments(oid) as identity_arguments
from pg_proc
where proname = 'deactivate_faq_entry_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect one row: p_actor_user_id uuid, p_id uuid, p_reason text

select prosrc like '%p\_reason%' as records_reason
from pg_proc
where proname = 'deactivate_faq_entry_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect: t
```

### M5. `20261010130400_sp5b2_admin_content_delete_reason.sql`

- **Changes:** `mutate_admin_content_with_audit` keeps its identity. For every operation other than `upsert`, the audit detail now records `payload.reason` (the delete of an estate and the step-down of a board member). Without a reason the detail is `{}` as before. Against the old body, the new app's reasons would be dropped (see Summary).
- **Verify:**

```sql
select pg_get_function_identity_arguments(oid) as identity_arguments
from pg_proc
where proname = 'mutate_admin_content_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect one row: p_actor_user_id uuid, p_entity text, p_operation text, p_id uuid, p_payload jsonb

select prosrc like '%p\_payload->>''reason''%' as records_reason
from pg_proc
where proname = 'mutate_admin_content_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect: t
```

### M6. `20261010130500_sp5b2_coordinator_status_delete_reason.sql`

- **Changes:** `mutate_adoption_coordinator_with_audit` keeps its identity. The status delete branch's audit detail records the reason beside `category` and `key`. Without a reason the detail is `{category, key}` as before. Against the old body, the new app's reasons would be dropped (see Summary).
- **Verify:**

```sql
select pg_get_function_identity_arguments(oid) as identity_arguments
from pg_proc
where proname = 'mutate_adoption_coordinator_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect one row: p_actor_user_id uuid, p_entity text, p_operation text, p_id uuid, p_payload jsonb

select prosrc like '%p\_payload->>''reason''%' as records_reason
from pg_proc
where proname = 'mutate_adoption_coordinator_with_audit'
  and pronamespace = 'public'::regnamespace;
-- expect: t
```

## Release schema check

After M6, run the release schema check from a checkout of this branch:

```
bun scripts/check-release-schema.ts
```

It needs one environment variable, `CHECK_RELEASE_SCHEMA_DATABASE_URL`, set to a PostgreSQL URL (`postgres://` or `postgresql://`) for the production database. Set it in your own shell and do not write the value into any file. The script is read-only: it reads the catalog and the migration ledger, compares them with `src/lib/operations/releaseManifest.ts`, prints a JSON report and exits 1 when the state is `incompatible`.

The manifest on this branch lists the new identities for `void_receipt_with_audit`, `set_volunteer_registration_status_with_audit` and `deactivate_faq_entry_with_audit`, so the check is expected to report `incompatible` **until** M1, M2 and M4 are applied, and to be green afterwards. Merge only once it is green.

## Deploy

1. Apply M1 to M6 in order and run each verification query.
2. Run `bun scripts/check-release-schema.ts` and confirm it is green.
3. Get release approval. Merge order is SP-5a (#207), then SP-5b-1 (#206), then this branch. Merging to `main` deploys to production.
4. After the deploy, tell staff to **reload any open admin page**. A browser tab that was open before the deploy still runs the old bundle, which sends no reason, so its delete, reject and void calls are refused with a 400 until the page is reloaded. Tell them too that the internship review reason cap has moved from 2000 to 500 characters: a stale tab may still let them type up to 2000, and the server refuses anything over 500.

## Where each reason is stored

Most reasons land in `audit_log.detail.reason`. The exceptions:

| Action                                            | Where the reason lands                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Pledge cancel, pledge proof reject                | `audit_log.detail.note` (existing RPCs)                                                                                          |
| Closing an adoption case                          | `audit_log.detail.note` (`change_adoption_case_status`)                                                                          |
| Sponsorship finance (reverse, reallocate, refund) | The existing reason columns of those records; a refund also writes it to `audit_log.detail.reason` (`record_sponsorship_refund`) |
| Document delete, annual report delete             | `audit_log.detail.reason`, through `p_values` (no migration)                                                                     |
| Internship reject                                 | `audit_log.detail.reason` and `detail.status` (M3)                                                                               |
| Volunteer activity bulk cancel                    | Already required by zod and SQL; unchanged by SP-5b-2                                                                            |
| Everything else (M1, M2, M4, M5, M6)              | `audit_log.detail.reason`                                                                                                        |

## Known limits

- SQL `btrim` strips only spaces. The app's zod `trim()` also strips tabs and newlines, so a reason made of other whitespace is refused by the app (400, before any RPC call) but a direct RPC call with such a value would store it. The app path is covered.
- The SQL does not enforce a reason, by design (D1). That is the follow-up migration.

## Follow-ups

- Make the database itself require a reason (raise when `p_reason` or `payload.reason` is blank) in the six RPCs, in a migration applied after this branch has deployed and every open admin tab has reloaded.
