# T23 CRM tag snapshot version fence

Scope: prerequisite repair for the existing CRM tag bulk workflow, before adding CRM assignment. A fresh 160-migration local install has no `supporter.edit_version`, although `create_crm_tag_bulk_preview` and `apply_crm_tag_bulk_item` both dereference it. The long-lived 57322 test stack had a manually added column and trigger, so its green fixture did not represent a fresh checkout.

## Contract

- Add `supporter.edit_version bigint not null default 1` with a BEFORE UPDATE trigger that increments the version on every supporter edit. The trigger overrides a caller-supplied version. The tag bulk preview stores the current version; the per-item apply rejects name, contact, tag, deletion or other supporter edits since preview as a conflict.
- Keep the existing 1–1,000 selection, 15-minute actor-owned snapshot, 25-item checkpoint, current-role check, per-item result and same-transaction audit flow. No identity, consent, payment, notification or public content change is in this migration.
- Make the column a required release-catalog item. The catalog checker does not inspect trigger definitions, so the migration rehearsal separately checks the enabled trigger, pinned function search path and forbidden function grants.

## Verification and release boundary

- The existing rollback-only CRM DB fixture first fails on a fresh unlinked schema with PostgreSQL `42703` (`v_row.edit_version` absent). A name-only edit after preview must then conflict; double apply, expiry, revoked actor and audit-failure rollback remain covered.
- Rehearse the exact SQL in a transaction, then run a full ordered fresh install and an ordered synthetic upgrade. Verify migration ledger, 133-item catalog, trigger/grants and existing synthetic payment/delivery rows. The synthetic upgrade does not model the divergent 79-version production ledger.
- Production migration still requires the R01 sanitized live-baseline bridge, lock/backfill measurement, backup/restore and release approval. On app rollback, retain the additive column and version history; do not restore an older database over newer audit or payment facts.
