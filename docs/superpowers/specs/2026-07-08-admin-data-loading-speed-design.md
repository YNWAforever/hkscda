# Admin Data Loading Speed Design

## Goal

Improve perceived and actual data-loading speed across the admin dashboard, starting with the worst identified bottleneck: the adoption animal pipeline loading full animal and internal profile tables into the browser.

## Current Findings

The animal pipeline currently fetches all `animals` rows and all `animal_profile_internal` rows, then joins, searches, filters, groups, and summarizes the data in the client. This creates slow first loads as records grow and sends more data than the list view needs.

Other admin areas already use server pagination in places, such as adoption cases and CRM supporters. Some admin search fields still fire a request on every keystroke, and several reference-data queries can be cached longer. Payments also loads broad data, but its all-data summary behavior needs a separate product decision before changing the API shape.

## Scope

This implementation optimizes the first production slice:

- Move animal pipeline list loading to a paginated admin API.
- Keep selected-animal details and tasks lazy-loaded.
- Add server-side filtering/search for the pipeline list.
- Add client pagination and debounced search to avoid request bursts.
- Cache low-change reference data with React Query stale times.

Out of scope for this slice:

- Reworking payments reconciliation summaries.
- Adding new database indexes or migrations before measuring query behavior through the new endpoint.
- Changing adoption case management behavior.
- Changing public-facing adoption pages.

## Architecture

Add a server-side query module for the animal pipeline that accepts normalized filters and returns a compact list response:

- `rows`: current page of pipeline animals with only list-view fields.
- `total`: total rows matching current filters.
- `page` and `pageSize`: normalized pagination metadata.

Expose the query through an authenticated admin API route. The frontend pipeline component will stop loading full tables directly from Supabase for the list. It will call the API with filters, display the returned page, and keep existing lazy queries for selected-animal tasks/details.

Reference tables such as positions, arrival sources, and coordinator statuses can remain separate queries because they are small and shared across UI interactions. They should use a longer `staleTime` to avoid repeat loads while staff move around the admin panel.

## Data Flow

1. Admin opens the animal pipeline.
2. The UI builds query params from page, page size, search text, animal type, status, adoptable flag, support pool, and position filters.
3. The API validates and normalizes those params.
4. The server builds a Supabase query using selected columns, `range`, and matching filters.
5. The API returns the current page plus total count.
6. The UI renders the page immediately, keeps previous data during transitions, and fetches a new page only after debounced search input settles.

## Error Handling

The API should return a structured error response with an appropriate status when validation, authorization, or Supabase querying fails. The UI should keep the existing admin error surface and avoid clearing the previous page during refetches.

## Testing

Follow TDD:

- Add failing tests for query-param normalization and pagination bounds.
- Add failing tests for pipeline row mapping/filter construction where practical.
- Add a failing component or logic test showing search pagination params are debounced or generated correctly.
- Run the targeted tests red, then implement, then run them green.

## Success Criteria

- The animal pipeline no longer fetches all animals and all internal profiles on initial list load.
- List requests include page and page size.
- Search/filter changes are handled server-side.
- The UI avoids request-per-keystroke behavior for the pipeline search box.
- Existing selected-animal workflows still work.
- Targeted tests pass.
