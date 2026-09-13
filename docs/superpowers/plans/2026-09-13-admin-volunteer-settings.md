# Administrator volunteer settings implementation

Source: CODEX_HKSCDA_Implementation_Master_Instruction_v3_Admin_Settings_2026-09-13_ZH.md.

## Baseline and preservation

Fresh origin/main and audited baseline both resolve to 3fcf8cec235e0fa252b7d134f74948f2a682ebac. Work is isolated on codex/admin-volunteer-settings-20260913. The original feat/hkscda-phase3-sponsorship checkout and its 24 modified files are preserved. No production migrations, records, messages, payments, merges or deployments are authorized by this implementation request.

## Implementation sequence

1. Revalidate baseline, migrations, deployment and isolated test tooling.
2. Make attendance recording/correction atomic, versioned and append-only.
3. Define strict draft policy schemas and a versioned initial client catalogue; unresolved client decisions stay local to the affected activation.
4. Deliver cat afternoon settings through durable draft, impact preview, publication, activity binding, authenticated booking, staff approval and shared DB evaluator.
5. Expand the same evaluator to cat/dog roles, groups, shared daily quotas, late release and credentials; no second admission evaluator in TypeScript.
6. Add calendar, identity/terms workflow, independent internships, fixed-period assessment and notification outbox operations.
7. Revalidate and complete FIX-01 through FIX-13 without replacing canonical entities or financial history.
8. Run isolated DB races, role browser journeys, migration/rollback rehearsal and repository gates; record exact evidence and unresolved operational activation separately.

## Transaction contract

All volunteer writes first acquire the transaction-level advisory domain guard hashtextextended('volunteer-domain', 0), then policy/profile/date/activity/registration locks in fixed order. Time-sensitive admission reads clock_timestamp after acquiring locks. Existing activity and registration IDs remain authoritative. Published policy revisions and factual attendance entries are immutable; rollback creates another policy revision.

## Acceptance

Required first integrated proof: edit cat afternoon capacity 5 to 6, persist draft, preview and publish, create/apply a selected future session, accept exactly one of two concurrent applicants for the last seat, reject/waitlist the seventh, show 6/6 in calendar, preserve old sessions and history. Unit tests alone do not establish this proof.

Track CFG-01..17, VOL-01..12, OPS-01..05 and FIX-01..13 against actual files and executed evidence. Not-yet-implemented and skipped checks must never be reported as accepted.
