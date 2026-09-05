# HKSCDA CRM Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Track execution using checkboxes.

**Goal:** Prevent lost notifications, duplicate gifts, unauthorized supporter changes, incomplete CRM results, and volunteer overbooking.

**Architecture:** Preserve thin authenticated handlers, validated services, and repository-only Supabase access. Introduce narrow database operations for atomic mutations and aggregate reads. Persist delivery work separately from the financial transaction.

**Tech Stack:** TypeScript, Bun, TanStack Start, React, Supabase Postgres/PostgREST, Resend, pdf-lib.

## Global constraints and evidence

Source baseline: YNWAforever/hkscda main, 20c168459a90c5c92093659a18b139a994451470, reviewed 2026-09-05. Implementation paths below are relative to C:/Users/laich/Documents/HKCSDA/HKCSDA/hkscda; execute changes in a new isolated checkout. This document authorizes no production changes.

- Keep all synced sources/ files read-only. Preserve unrelated work.
- No secrets in clients, logs, fixtures, or artifacts. Use synthetic example.invalid contacts.
- Every privileged handler calls requireAdmin with the existing role matrix.
- New tables enable RLS. Public SECURITY DEFINER RPCs pin search_path and revoke execution from PUBLIC, anon, authenticated; grant only service_role. Authenticate actors server-side before supplying their IDs.
- Mutation and audit writes commit together. Service-role writes cannot rely on JWT-only audit triggers.
- Create migrations using supabase migration new; the timestamped filename is generated during execution. Each task below specifies its migration slug.
- Apply schema changes and run provider checks only against explicitly authorized staging/local resources. Production connector access is unavailable; deployed-schema parity remains unverified.
- Root reported 1,778 passing tests, 40 skipped, zero failures, and green GitHub RLS checks. These are the audit baseline, not proof that the proposed fixes exist.

Run packages 1 → 2; package 3 may then run independently of package 4; package 5 follows package 3 because both touch volunteer repositories. Review and commit explicit files after each package. Refresh Supabase/Resend documentation before implementation.

## Package 1: Honor provider rejection and delivery persistence

**Evidence:** src/lib/donations/notifications.server.ts:131 ignores the resolved Resend response, then marks sent at :160; :78 skips subsequent delivery attempts. The same defect occurs in src/lib/volunteers/notifications.server.ts:90 and :105.

**Files:** modify those two implementations and src/lib/donations/notifications.server.test.ts. Create src/lib/notifications/provider.server.ts, provider.server.test.ts, and src/lib/volunteers/notifications.server.test.ts. Preserve existing donation claim/lease logic.

**Contract**, exported from the new provider module:

~~~ts
export type ProviderResult =
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "rejected"; code: string; retryable: boolean };
export type MailInput = {
  from: string; to: string; replyTo?: string;
  subject: string; html: string; idempotencyKey: string;
};
export interface MailProvider {
  send(input: MailInput): Promise<ProviderResult>;
}
export type ResendTransport = (input: MailInput) => Promise<{
  data: { id: string } | null; error: { name: string } | null;
}>;
export declare function createResendMailProvider(send: ResendTransport): MailProvider;
~~~

Representative regression in provider.server.test.ts:

~~~ts
import { expect, test } from "bun:test";
import { createResendMailProvider } from "./provider.server";
test("resolved Resend rejection never becomes accepted", async () => {
  const provider = createResendMailProvider(async () => ({
    data: null, error: { name: "rate_limit_exceeded" },
  }));
  expect(await provider.send({
    from: "audit@example.invalid", to: "fixture@example.invalid",
    subject: "Fixture", html: "<p>Fixture</p>", idempotencyKey: "fixture-1",
  })).toEqual({ kind: "rejected", code: "rate_limit_exceeded", retryable: true });
});
~~~

- [ ] Add failing cases for resolved provider errors, thrown transport failures, missing accepted-message ID, and database failure while marking sent. Use injected transport and clock dependencies; never send real email.
- [ ] Normalize Resend data/error responses in the adapter. Only an accepted result permits sent status. Preserve rejected state, provider error code, and retryability; avoid storing complete provider responses containing personal data.
- [ ] Make volunteer status updates check Supabase error results. HTML-escape donor names in donation templates, matching the volunteer renderer.
- [ ] Verify accepted delivery preserves the provider ID; failure remains recoverable; duplicate sent rows skip; concurrent delivery claims yield one send. A donation webhook must not become complete following provider rejection.
- [ ] Run bun test src/lib/notifications/provider.server.test.ts src/lib/donations/notifications.server.test.ts src/lib/volunteers/notifications.server.test.ts. Expected: every provider-error regression passes. Commit the package.

Reference: [Resend Node.js documentation](https://resend.com/docs/send-with-nodejs) demonstrates checking the returned error.

## Package 2: Make manual gifts atomic and retryable

**Evidence:** src/lib/crm/service.ts:155 creates a fresh UUID per attempt; :175 persists the gift before fallible side effects at :181. src/lib/crm/repository.server.ts:660 independently inserts donation, payment, and audit rows.

**Files:** modify src/lib/crm/schemas.ts, service.ts, repository.server.ts, http.server.ts, service.test.ts, repository.server.test.ts, http.test.ts; modify src/components/admin/crm/ManualDonationDialog.tsx. Create its adjacent ManualDonationDialog.test.tsx, src/lib/donations/deliveryJobs.server.ts, deliveryJobs.server.test.ts, and src/routes/api/admin/donations/delivery-jobs/$id/retry.ts with retry.test.ts. Generate migration crm_manual_gift_delivery_jobs.

**Contracts:** import ManualDonationInput from CRM schemas; add requestId to that schema and remove it from the nested input below.

~~~ts
export type ManualGiftCommand = {
  requestId: string; actorUserId: string;
  input: Omit<ManualDonationInput, "requestId">;
};
export type ManualGiftResult = {
  donationId: string; paymentId: string;
  deliveryJobId: string | null; replayed: boolean;
};
export interface ManualGiftRepository {
  recordManualGift(command: ManualGiftCommand): Promise<ManualGiftResult>;
}
export type DeliveryRunResult =
  | { kind: "complete" }
  | { kind: "retryable"; code: string }
  | { kind: "attention_required"; code: string }
  | { kind: "busy" };
export interface DonationDeliveryWorker {
  run(jobId: string): Promise<DeliveryRunResult>;
}
~~~

- [ ] Reproduce identical requests with simulated receipt failure; require one donation/payment/audit/job, stable returned IDs, and no rollback of committed finance.
- [ ] Add a transactional record_manual_gift_with_audit RPC. Lock/deduplicate requestId, compare normalized payload hashes, return original IDs on identical replay, and reject changed payload with 409. Include supporter resolution, donor role, supplied consent changes, donation, payment, audit, and eligible delivery-job insertion in the transaction.
- [ ] Keep one requestId throughout dialog retries; generate a new value only for a new gift. Return 201 after commit, including delivery state; provider failure must not turn committed gift creation into 500.
- [ ] Implement guarded job leases and retry timestamps using injected clocks. Reuse idempotent receipt allocation and package-1 acknowledgement handling. Attempt work after commit; retain transient failures for retry and permanent provider rejections for staff attention through the authenticated treasurer/admin retry endpoint. Show pending/failed delivery with a retry action in the dialog result.
- [ ] Verify concurrent identical requests, changed-payload conflicts, expired leases, worker crashes after PDF upload, and forced payment/audit insert failure. Partial finance records must never remain.
- [ ] Run bun test src/lib/crm src/lib/donations/deliveryJobs.server.test.ts src/components/admin/crm/ManualDonationDialog.test.tsx src/routes/api/admin/donations/delivery-jobs. Commit after transaction/RLS tests pass.

## Package 3: Separate public submissions from authoritative supporter identity

**Evidence:** src/lib/volunteers/repository.server.ts:336 upserts by unverified email, overwrites profile fields, and clears deleted_at. src/lib/volunteers/service.ts:217 immediately appends consent. Donation intake repeats profile overwrites at src/lib/donations/supabase.server.ts:14. Adoption intake already preserves existing fields at src/lib/adoptions/repository.server.ts:1186.

**Files:** modify src/lib/volunteers/service.ts, repository.server.ts, service.test.ts; modify src/lib/donations/service.ts, supabase.server.ts, service.test.ts. Create src/lib/supporters/publicIdentity.server.ts, publicIdentity.server.test.ts, src/lib/volunteers/repository.server.test.ts, and src/lib/donations/supabase.server.test.ts. Also modify src/lib/crm/schemas.ts, service.ts, repository.server.ts, types.ts, and src/components/admin/crm/SupporterDetail.tsx; extend CRM service/HTTP tests and create SupporterDetail.test.tsx beside that component. Generate migration public_supporter_identity_claims.

~~~ts
export type PublicContact = {
  name: string; email: string; phone: string | null;
  language: "zh-HK" | "en"; source: "donation_form" | "volunteer_registration_form";
};
export type IdentityResolution = {
  supporterId: string; kind: "created" | "existing";
};
export interface PublicIdentityRepository {
  resolve(contact: PublicContact): Promise<IdentityResolution>;
}
~~~

- [ ] Add regressions submitting another existing email with changed name/phone/language, including a soft-deleted supporter.
- [ ] Resolve normalized email atomically: create missing supporters, or return existing IDs without updating canonical fields, source, tags, roles beyond the new domain role, or deletion state. Concurrent first submissions must resolve one supporter.
- [ ] Preserve submitted contact details on the registration snapshot; add a donation contact snapshot for equivalent evidence. Record unverified opt-in requests as pending evidence, never effective marketing permission. Preserve existing opt-outs; explicit opt-out requests suppress marketing. Store pending intents with supporter/channel/source/submission reference and show them on supporter detail. Extend the existing authorized consent action with an optional intentId; a review RPC locks that intent and atomically appends consent, resolves the intent, and audits the reviewer. Replayed reviews cannot duplicate consent.
- [ ] Verify public requests cannot reactivate profiles or replace consent; new contacts still complete donation/volunteer journeys; staff profile/consent changes remain authorized and audited. Do not expose whether an email already exists in public responses.
- [ ] Run bun test src/lib/supporters/publicIdentity.server.test.ts src/lib/volunteers src/lib/donations/service.test.ts src/lib/donations/supabase.server.test.ts. Commit after anonymous/authenticated/service-role boundary tests.

## Package 4: Return complete filters, summaries, and bounded exports

**Evidence:** supabase/config.toml:18 caps responses at 1,000 rows. Unpaged related reads occur in src/lib/crm/repository.server.ts:292, :304, :372. Exports at :681 and :699 advertise a 5,000-row ceiling without ensuring complete results.

**Files:** modify src/lib/crm/repository.server.ts, repository.server.test.ts, service.test.ts, http.test.ts. Create src/lib/crm/readModel.server.ts and readModel.server.test.ts. Generate migration crm_aggregate_reads.

**Contract:** import SupporterSearch, ExportSearch, SupporterSummary, and DonationExportRow from existing CRM modules.

~~~ts
export interface CrmReadModel {
  list(input: SupporterSearch): Promise<{ supporters: SupporterSummary[]; total: number }>;
  exportSupporters(input: ExportSearch): Promise<SupporterSummary[]>;
  exportDonations(input: ExportSearch): Promise<DonationExportRow[]>;
}
~~~

- [ ] Build fixtures containing 1,001 supporters, 1,001 gifts on displayed supporters, and 5,001 export matches. Fail tests when clients silently receive the first 1,000.
- [ ] Implement indexed SQL filtering and aggregation before pagination, preserving every existing search/filter combination. Calculate latest consent per supporter/channel, preferring opt-out for equal timestamps. Order supporters by created_at then id.
- [ ] Use a single-snapshot, bounded export RPC returning one JSON envelope; this avoids PostgREST row limits clipping a 5,000-row set. Compute overflow in the same statement, returning 413 before CSV output when more than 5,000 matches exist. Do not raise the global API row limit.
- [ ] Compare totals and lifetime amounts against direct SQL aggregates. Confirm every one of 1,001 matches is reachable; exports contain exactly 1,001/5,000 rows, while 5,001 returns explicit overflow. Include receipt associations, deleted filters, tied timestamps, and multiple consent channels.
- [ ] Run bun test src/lib/crm. In staging, compare query plans and p50/p95 latency on fixed 1k/10k/50k synthetic datasets; related-row response volume must depend on page size rather than donor history. Commit with measured results.

## Package 5: Make staff approval respect capacity and concurrency

**Evidence:** src/lib/volunteers/repository.server.ts:451 directly updates approval status. Public creation instead locks the activity and sums approved participants in supabase/migrations/20260704165600_volunteer_activity_management_v1.sql:107 and :154.

**Files:** modify src/lib/volunteers/service.ts, repository.server.ts, schemas.ts, http.server.ts, service.test.ts, schemas.test.ts, http.test.ts, and package-3 repository tests; modify src/components/admin/volunteers/VolunteerRegistrationDetail.tsx. Create its adjacent test. Generate migration volunteer_atomic_approval.

~~~ts
export type ApprovalCommand = {
  actorUserId: string; registrationId: string;
  expectedUpdatedAt: string;
  status: "pending" | "approved" | "waitlisted" | "rejected" | "cancelled";
  internalNotes: string | null;
};
export type ApprovalResult =
  | { kind: "updated"; updatedAt: string }
  | { kind: "conflict" | "capacity_full" };
~~~

- [ ] Test two concurrent approvals competing for one place and a group larger than remaining capacity.
- [ ] Add set_volunteer_registration_status_with_audit. Acquire the same activity advisory lock as public creation, lock rows consistently, check expectedUpdatedAt, count approved participants excluding the current registration, and update status/audit together. Return 409 for stale state or insufficient capacity.
- [ ] Reject capacity reductions below existing approved participants under the same lock. Do not introduce implicit overbooking authority.
- [ ] Preserve form input after conflicts and refresh displayed capacity. Verify concurrent public/staff approvals, cancellation freeing places, approved-to-approved edits, group counts, stale edits, and audit rollback.
- [ ] Run bun test src/lib/volunteers src/components/admin/volunteers. Verify concurrency with separate staging database sessions; fake repositories alone cannot establish locking. Commit after all assertions pass.

## Reproduction evidence and final gates

The workspace artifact artifacts/crm-audit-repro.ts uses fake repositories and a fake sender, blocking unexpected network access. Run from the task workspace with bun artifacts/crm-audit-repro.ts C:/Users/laich/Documents/HKCSDA/HKCSDA/hkscda. Saved results are in artifacts/crm-audit-repro.jsonl. Its observed baseline output was:

~~~json
{"reproduction":"resolved email provider error","providerNetworkCalls":0,"result":"sent","persistedStatuses":["sent"]}
{"reproduction":"same manual gift retried after side effect outage","storedGifts":2,"uniqueGiftIds":2,"bankReferences":["AUDIT-SAME-GIFT","AUDIT-SAME-GIFT"],"failures":["Synthetic receipt storage outage","Synthetic receipt storage outage"]}
~~~

These demonstrate application behavior, not real provider delivery or database transactions.

- [ ] Run full typecheck, tests, lint, build, and repository RLS/security checks; compare failures against the recorded baseline.
- [ ] Exercise staff/public journeys and export downloads in authorized staging with synthetic data and provider fakes/test configuration.
- [ ] Record commit IDs, migration names, test output, concurrency evidence, and unverified production parity. Root owns review, release approval, deployment, and any eventual production migration.
