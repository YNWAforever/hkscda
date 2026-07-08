# Admin Performance Next Phase Design

## Goal

Improve admin dashboard loading speed through a sequential next phase:

1. Implement the already-approved animal pipeline loading optimization.
2. Design the payments/reconciliation optimization after verifying current finance summary behavior.

## Approved Approach

Use a sequential sprint instead of bundling animal pipeline and payments into one implementation. This gives staff a fast visible improvement in the known slowest area while keeping finance data behavior stable until the summary and reconciliation rules are confirmed.

## Phase 1: Animal Pipeline Implementation

Use the existing design in `docs/superpowers/specs/2026-07-08-admin-data-loading-speed-design.md` as the implementation source of truth.

The implementation should:

- Add a paginated admin API for animal pipeline rows.
- Move list search and filters from browser-only processing to server-side query parameters.
- Return only the list-view fields required by the pipeline table/cards.
- Keep selected-animal details and tasks lazy-loaded.
- Add client pagination, debounced search, and `keepPreviousData` behavior.
- Cache low-change reference data such as positions, arrival sources, and coordinator statuses.

## Phase 2: Payments/Reconciliation Design

Do not change payments/reconciliation loading behavior in Phase 1.

Before designing Phase 2, inspect the current payments UI and APIs to answer:

- Whether the dashboard summary must describe all matching payments or only the current page.
- Which filters need server-side support.
- Whether exports must use the same filter set as the table.
- Whether receipts and finance activity should be returned with payments, split into separate endpoints, or summarized separately.

The Phase 2 output should be a separate payments/reconciliation performance spec, not an implementation mixed into Phase 1.

## Data Safety

Animal pipeline changes are operational and can be paginated without changing finance semantics. Payments/reconciliation changes touch money-facing workflows, so they need a separate design and review before implementation.

## Testing

Phase 1 should follow TDD:

- First add failing tests for pagination parameter normalization.
- Add tests for filter/search query construction.
- Add UI logic tests for debounced pipeline search or stable query params.
- Run targeted tests red, implement, then run them green.

Phase 2 should define its own tests after the payment summary behavior is confirmed.

## Success Criteria

- Phase 1 implementation can proceed from the existing animal pipeline loading spec.
- Phase 2 remains explicitly design-only until finance summary behavior is confirmed.
- No payments/reconciliation API behavior changes are introduced during the animal pipeline performance work.
