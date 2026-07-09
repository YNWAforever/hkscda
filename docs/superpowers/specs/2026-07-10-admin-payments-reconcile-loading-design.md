# Admin Payments Reconcile Loading Design

Date: 2026-07-10

## Goal

Improve the admin payments reconciliation console so it stays fast as payment and receipt data grows. The table should stop downloading the full finance dataset into the browser on initial load. Finance summaries and CSV exports must remain complete for the active filters, not limited to the visible page.

## Current Behavior

`PaymentsReconcile` calls `/api/admin/payments`, which loads admin payments and receipts, then filters and summarizes in the browser. The repository query is capped at 100 payments, so the UI is both heavier than needed on first load and not reliable for complete finance views once there are more than 100 rows. The CSV export also calls the same unfiltered payment list.

## Selected Approach

Use server-side filtering and pagination for the payment table, while keeping summary and export semantics filter-wide.

The table request includes:

- `status`
- `provider`
- `q`
- `page`
- `pageSize`

The response includes:

- one page of payment rows
- receipts needed for the current result set
- total matching row count
- page metadata
- summary totals for all rows matching the active filters

The CSV export accepts the same filters except pagination and exports every matching payment.

## API And Data Flow

`/api/admin/payments` will parse filter params with a shared schema. It will call a server helper that returns a paginated result object. The UI will include filter params in the query key so React Query caches each filter/page combination independently.

The server helper will use small, focused Supabase queries:

1. Build a matching payment ID set from indexed payment fields and supporter fields when search is present.
2. Query the requested page from `payment`, ordered by `created_at desc`.
3. Query receipts only for matching payment IDs needed for summary and current rows.
4. Compute summary values for all matching rows, not only the current page.

The export route will reuse the same filter parsing and matching logic, but request all matching rows for CSV output.

## UI Behavior

Filters stay in the reconciliation toolbar. Search is debounced before it reaches the server. Changing any filter resets the table to page 1. Page controls show the current range and disable previous/next while loading or at the edges.

The summary cards keep their current meaning:

- awaiting reconciliation
- awaiting receipt
- confirmed amount

These values always describe all rows matching the filters.

## Performance Notes

This phase avoids speculative database migrations. The code will preserve a documented query shape that can be checked with `EXPLAIN` in Supabase. If live plans show sequential scans on the payment or supporter filter path, a later migration should add targeted indexes for the proven predicates.

This follows the Postgres performance guidance to index high-traffic `WHERE` and join columns only when the query plan shows the need, and to prefer partial indexes only for stable, frequently repeated predicates.

## Errors And Permissions

Admin access remains restricted to the existing staff, treasurer, and admin roles for the list route. CSV export remains restricted to treasurer and admin. Errors continue to return JSON failure responses for the list route and a failed CSV response for export.

## Testing

Use TDD for the implementation:

1. Schema tests for parsing payment filters and pagination defaults.
2. Server helper tests proving filters, pagination, total counts, and all-filter summary semantics.
3. Export tests proving CSV receives all matching filtered rows and ignores pagination.
4. Client helper or component tests proving stable query params, page reset on filter change, and summary values are rendered from the server response.
5. Focused route tests for authorization and error handling where existing route-test patterns support it.

## Out Of Scope

- Changing payment reconciliation business rules.
- Adding live database indexes without `EXPLAIN` evidence.
- Reworking finance activity loading.
- Changing receipt issuance behavior.

## Spec Self-Review

- No incomplete markers remain.
- Summary and export behavior is explicit: all matching filters, not current page.
- Scope is limited to payments reconciliation loading, filtering, pagination, and export behavior.
- Database migration work is intentionally deferred until query-plan evidence exists.
