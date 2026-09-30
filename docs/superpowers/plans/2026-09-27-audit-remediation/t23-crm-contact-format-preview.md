# T23 CRM contact format preview — implementation specification

Scope: an independent read-only CRM slice stacked after draft PR #175. It completes the format-cleanup preview portion of the T23 CRM row. Tag bulk and restricted export remain their existing workflows; identity merge, email identity change, marketing consent and notifications are outside this command.

## Contract

- A currently active treasurer or admin may POST 1–1,000 distinct supporter UUIDs plus a 64-character selection hash to `/api/admin/supporters/format-preview`. The server rejects other methods and malformed, duplicate or oversized selections before querying supporter data. Every response is `no-store` and unexpected errors expose no row or query detail.
- The service reads only `id,name,email,phone,updated_at,deleted_at` in 100-ID batches. Results retain requested order. A missing or deleted ID returns `skipped/missing_or_deleted` without personal data.
- Whitespace-only name and phone suggestions return `suggested`. Email trim or case suggestions return `manual_review/identity_review` because email is an identity key. The output includes before/after and source `updatedAt`, but no apply endpoint or mutation. Digits, country code, punctuation and consent remain untouched.
- The selected CRM list drives the preview. A filter or selection change invalidates the current result, including any in-flight response. The staff UI pages 25 results at a time and has no apply control. This is a transient review, not a durable bulk operation.

## Acceptance and release boundary

- Red tests first for the absent service and route; green tests cover ordered and redacted results, role denial before PII read, unique selection limits, 25 and 1,000 row boundaries, no-store response and sanitized backend failure. Existing SupporterList tests and full isolated suite must pass.
- Build must regenerate the TanStack route tree; typecheck, lint and build are separate gates. No schema change is required. Actual-role hosted API and mobile/keyboard UI UAT remain a release gate; no production data is read by these tests.
- This slice leaves ADMIN-04 partial. An eventual write command needs a fresh persisted snapshot, per-item actor/version/identity checks, atomic audit and an explicit reviewed policy. It cannot infer marketing consent or merge identities from formatting suggestions.
