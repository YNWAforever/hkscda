# D2 COD AlipayHK receipt and delivery evidence

Scope: `codex/d2-alipay-receipt`, based on main
`e29064af0fecd9ae6c130befbd8957e7557f7e13` (D1 #224).
This is local fixture evidence, not current deployment or payment-provider proof.

Channels/checkout still gated; no live COD activation.
`VITE_PUBLIC_DONATION_CHECKOUT_ENABLED=false` remains required in every environment.
No production credentials, webhook/merchant registration, charges, deployment,
DNS, D3 or D4 work. A-04 terms remain unavailable and A-05 environment setup is
untouched. Vercel automatic deployment is disabled for this review branch.

## Fixed

COD notification/status paths previously called receipt/acknowledgement side
effects outside the durable worker. A missing mail configuration or rejected
send left the success-triggered job pending until cron attempted it; the finance
failed-delivery worklist could not show that failure immediately. Succeeded COD
status polling also bypassed the job's backoff and staff-attention state.

A thin COD reconciliation composition now runs the existing job through
`createDonationDeliveryWorker`. Verified payment success still commits first.
The worker records receipt/PDF/mail failures for the existing worklist and
reuses the same receipt allocator, PDF path and acknowledgement idempotency key.
Public status recovery uses the same job and respects its lease, backoff,
completed state and staff-attention requirement. No new mailer, role, schema,
migration, checkout method or batch action was added.

Regression proof: running the new default-notification test with main's original
`cod-webhook.server.ts` failed: the queued acknowledgement left a pending job
with zero attempts instead of a retryable job with `acknowledgement_pending`.
The final implementation passes that test.

The finance payment-provider enum/filter also omitted COD, silently parsing a
`provider=cod` list/export request as `all`. COD is now in the shared provider
list and bilingual filter labels. A mixed COD/Stripe fixture proves both list
and export return only COD when selected. The regression returned both rows on
main. Pending COD payments remain excluded from manual reconciliation; receipt
issuance retains existing treasurer/admin permissions.

## Verified inventory

- Existing RSA verification and merchant/segment/wallet/currency/amount binding
  precede payment reconciliation; verified order refresh shares that lifecycle.
- Existing public, service-role-only receipt RPC allocates idempotently;
  `issue_receipt_with_audit` is used for manual finance issuance.
- Receipt eligibility remains requested retained gifts of at least HK$100;
  the PDF is stored privately as `{tax_year}/{receipt_no}.pdf`.
- Existing bilingual acknowledgement includes `receiptNo`; `sent` means provider
  acceptance, distinct from Resend webhook-confirmed `delivered`.
- Existing donation-success trigger queues COD without filtering by processor;
  due-job cron and the finance failed-delivery worklist also have no COD exclusion.
- Existing treasurer/admin retry is audited and rechecks current Auth/admin
  eligibility and succeeded payment/donation state. Receipt issue uses the same
  roles. No supported UAT login was created or impersonated.
- Existing worklist is paginated, 25 jobs per page, with individual confirmed
  retry; there is no existing bulk retry to extend.

## Fixture journeys

`src/lib/donations/cod-delivery.server.test.ts` uses generated test-only RSA keys,
an in-memory PostgREST/storage transport, injected PDF bytes and a fake mail
provider. Production notification parsing, reconciliation, receipt issuance,
acknowledgement generation, delivery worker, finance list and retry handler run.
The fixture models trigger/RPC transactions; it does not prove database grants,
RLS behavior or actual transactions against a deployed database.

1. Signed COD `ALIPAYHK` paid notification for HK$200: payment/donation succeeded,
   one issued receipt, stored PDF path, zh-HK acknowledgement with that number,
   and complete delivery job. Duplicate and distinct paid events plus succeeded
   status polling produce no additional PDF upload or send.
2. A permanent provider rejection leaves payment succeeded and the existing job
   visible as `attention_required`. Public polling and another verified paid
   event cannot send around it. An authorized fixture finance retry writes the
   existing retry audit, sends with the original receipt/key and removes the
   failure from the worklist. Repeating retry on a completed job does not send.
3. PDF metadata persistence failure creates a retryable job before any email.
   Existing admin receipt issue repairs the same number and storage path;
   existing delivery retry sends it without allocating another receipt.
4. Fully bound paid order refresh for exactly HK$100 issues and sends through the
   same worker. A later paid notification reuses the completed job.
5. HK$99.99 requested and HK$200 unrequested gifts receive acknowledgement without
   an IRD receipt. Missing email configuration leaves a queued message and a
   retryable job. Polling respects backoff and the attempt count.
6. Completed, busy/concurrently-completed, missing-job and staff-attention cases
   do not fall back to an unleased send.

## Validation and limitations

Use repository-pinned Bun 1.3.14 and Node 24. Unit-only runs set
`SUPABASE_LOCAL_URL=http://127.0.0.1:1` to avoid another worktree's local stack.
Checks: focused donation/finance suites, full isolated tests, typecheck, lint,
fixture build, generated-route-tree check and local public brand verification.
Final counts, logs, tip SHA, draft PR URL and CI status are recorded outside the
repository at `/workspace/cli-logs/hkscda-d2.last.txt` and in the PR checks.

No real COD sandbox credentials, Resend test-domain delivery or supported finance
UAT identity were used. No real inbox, provider callback, deployed database
permissions, cron configuration or browser-based finance session is certified.
Database suites requiring an explicitly selected isolated stack are skipped
locally; repository CI remains the source for those checks. Live/sandbox E2E and
finance UAT remain external follow-ups under the existing approval gates.
