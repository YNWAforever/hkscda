# Adoption Coordinator HTTP Boundary Design

**Date:** 2026-07-28  
**Status:** Approved for implementation planning

## Purpose

Refactor the adoption coordinator HTTP boundary so its responsibilities are
grouped by domain instead of being concentrated in the 279-line
`createAdoptionCoordinatorHandlers` factory.

This is a behavior-preserving structural change. Existing routes, authorization
rules, request parsing, service calls, response bodies, status codes, headers,
error messages, and observable validation order must remain unchanged.

## Current state

`src/lib/adoptions/http.server.ts` currently owns shared transport helpers and
25 coordinator handlers in one factory. The factory is the single dependency
of the admin adoption route adapter, which exposes the handlers to roughly 30
route methods.

The handlers are individually straightforward, but the combined factory mixes
five distinct areas:

- status administration;
- adoption cases and intake;
- coordinator tasks;
- reports and CSV exports;
- adopter lookup and detail.

This makes the HTTP boundary harder to scan, review, and change safely even
though business behavior already belongs in the coordinator service.

## Design principles

1. Keep `createAdoptionCoordinatorHandlers()` as the stable public facade.
2. Group handlers by domain while keeping their control flow explicit.
3. Share transport mechanics, not business behavior.
4. Preserve the exact order of validation, authorization, parsing, and service
   calls.
5. Use characterization tests to prove equivalence before and after extraction.
6. Avoid a generic handler-definition framework and unrelated refactoring.

## Architecture

`src/lib/adoptions/http.server.ts` remains the public module imported by route
code. It will compose five internal handler groups:

| Internal module | Responsibilities |
| --- | --- |
| `http/statusHandlers.server.ts` | List, create, get, update, and delete coordinator statuses |
| `http/caseHandlers.server.ts` | Case listing/detail, intake, animal pipeline, manual case creation, status changes, matches, follow-ups, and finalization |
| `http/taskHandlers.server.ts` | List, create, get, and update coordinator tasks |
| `http/reportingHandlers.server.ts` | Export history, monthly summary, CSV export, and export regeneration |
| `http/adopterHandlers.server.ts` | Adopter listing/detail and manual identity search |

A narrow `http/shared.server.ts` module will own the existing transport-level
building blocks required by more than one group:

- handler context and dependency types;
- no-store JSON responses;
- CSV responses;
- JSON request-body parsing;
- required UUID extraction;
- centralized error translation;
- raw query-parameter conversion.

The facade will pass the existing coordinator service and authorization
callbacks into each group, then combine the returned handler objects:

```text
admin adoption route
  -> createAdoptionCoordinatorHandlers(dependencies)
      -> status handlers
      -> case handlers
      -> task handlers
      -> reporting handlers
      -> adopter handlers
  -> unchanged named handler
  -> unchanged coordinator service method
```

The facade's returned handler names and TypeScript-visible shape remain
compatible with current route imports.

## Domain boundaries

### Status handlers

This group receives both `requireCoordinator` and `requireStatusAdmin`.
Read-only status operations continue using coordinator access. Protected status
mutations continue using status-admin access and forwarding the authenticated
actor ID.

### Case handlers

This group owns case-centric operations, including intake and the animal
pipeline because they feed the case workflow. It keeps the current response
wrappers for manual case creation, case detail, case status changes, matches,
follow-ups, and finalization.

### Task handlers

This group owns task collection and task-detail operations. Follow-up creation
remains in the case group because its route and request contract are
case-centric, even though the service may delegate internally to task
creation.

### Reporting handlers

This group owns report filters and CSV transport. It preserves filenames,
content types, content-disposition headers, no-store headers, and the
validation-before-authorization order used by export regeneration.

### Adopter handlers

This group owns adopter collection/detail operations and manual identity
search. Identity search remains here because its HTTP purpose is selecting an
existing adopter or supporter identity for manual intake.

## Data flow and compatibility

Every route continues to resolve a named handler from the facade. A handler
continues to perform only HTTP orchestration:

1. validate route parameters when the existing handler does so first;
2. call the same authorization dependency;
3. parse the same query parameters or JSON body;
4. call the same coordinator service method with the same arguments;
5. map the result to the same JSON or CSV response.

The extraction must preserve observable ordering. For example, handlers that
currently reject an invalid UUID before authorization must continue doing so.
Handlers that authorize before parsing request data must retain that ordering.

No domain validation moves from the service into the HTTP layer.

## Error handling

The existing centralized error translation remains the only general error
boundary. It must continue mapping malformed JSON, schema validation,
authorization, repository, and conflict errors to the same response status and
payload.

Explicit not-found responses remain local to the relevant handler and retain
their exact messages:

- `Status not found`
- `Case not found`
- `Task not found`
- `Adopter profile not found`

The refactor must not introduce catch-and-rethrow layers or normalize error
messages beyond the current behavior.

## Testing strategy

### Characterization tests

Extend `src/lib/adoptions/http.test.ts` before extraction to lock down:

- the complete handler-name set returned by the facade;
- the authorization callback selected for every handler;
- UUID, query-string, and JSON-body forwarding;
- service method and argument mapping;
- success status codes and response payloads;
- not-found status codes and exact messages;
- CSV body, filename, content type, content disposition, and cache headers;
- validation and authorization call order where observable;
- centralized error translation.

The existing test suite already covers many of these contracts. New tests
should fill only material gaps needed to make the extraction safe.

### Internal group tests

Each internal handler group receives focused tests for its distinctive
behavior. Tests should prefer public handler calls with mocked dependencies
over assertions about implementation details.

### Verification

After each extraction:

```bash
bun test src/lib/adoptions/http.test.ts
```

Final verification:

```bash
bun test src/lib/adoptions
bun run typecheck
bun run build
bun test
git diff --check
```

Any unrelated full-suite instability must be reproduced independently and
reported separately. No adoption-focused failure is acceptable.

## Scope

This task changes only the adoption coordinator HTTP boundary and its tests.

### In scope

- characterization tests for the facade contract;
- extraction into five domain handler groups;
- extraction of narrow shared transport helpers;
- preservation of the existing facade and route imports;
- focused documentation needed to explain the new boundary.

### Out of scope

- route names or route-tree changes;
- request or response contract changes;
- authorization-role changes;
- coordinator service or repository behavior changes;
- database migrations;
- UI changes;
- a generic framework shared by unrelated HTTP modules;
- cleanup of content, CRM, document, or volunteer handler factories.

## Completion criteria

The work is complete when:

1. `createAdoptionCoordinatorHandlers()` is a small composition facade;
2. each internal group has one clear domain responsibility;
3. all existing route imports and handler names remain valid;
4. characterization tests prove the public contract is unchanged;
5. adoption-focused tests, typecheck, and production build pass;
6. the full suite introduces no new failure attributable to this refactor.
