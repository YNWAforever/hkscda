# D1 payment proof and bankfeed — local evidence, 2026-10-28

Base: `2b59aacc7d2aa5a923ac575a386cb1b687772e17`; branch: `codex/d1-payment-bankfeed`.
This is fresh local execution. Historical T23 evidence was not counted as runtime proof.

## Fixed versus verified

| Path                                   | Finding and result                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bankfeed → payment/donation visibility | Fixed: applying a match only refreshed the operation snapshot. The surrounding payment list/activity remained cached. Apply now refreshes payment facts even when its response or the subsequent snapshot read is lost. Restoring/reloading an operation also refreshes facts. Receipt worklist and cached supporter details are invalidated.                                                                |
| Sponsorship → existing bank payment    | Fixed: finance GET called `read(id)` without its finance permission flag, so its default `false` suppressed all existing-payment candidates even for treasurer/admin. The HTTP factory now passes the verified role's permission to the repository. Staff still receives no candidates.                                                                                                                      |
| Staff sponsorship proof upload         | Fixed: malformed `null` payload caused 500; invalid payment metadata could reserve/upload an object before service validation failed. Validate the existing canonical payment schema first. SQL permission refusals now return 403 through shared sponsorship HTTP handling, including proof review and refusal after an object was uploaded; deferred cleanup remains responsible for unreferenced uploads. |
| Donation assisted handoff              | Fixed missing copy: the existing donation email contact now explicitly asks for a transfer photo/record, amount, date and optional reference, in zh-HK/en. Checkout remains disabled. There is no native donation proof-upload endpoint or attachment field in manual-gift intake.                                                                                                                           |
| Public sponsorship upload              | Verified existing signed-upload URL → direct upload helper, private bucket, MIME/size validation, intent registration/ownership and submission-reference checks with local fixtures/unit tests. No new uploader.                                                                                                                                                                                             |
| Bank matching                          | Verified existing canonical CSV parser → read-only preview → exact one-to-one selection → confirmation snapshot → per-item apply. Non-exact, duplicate, changed/expired and denied cases retain existing coverage. No bankfeed rebuild or SQL changes.                                                                                                                                                       |
| Sponsorship approval/status            | Verified existing staff file upload → service → private proof preview → exact proof/revision approval → visible confirmed pledge and approved proof in browser fixtures.                                                                                                                                                                                                                                     |
| Legacy sponsorship linkage             | Verified the existing finance selector can offer the bank-confirmed payment and send a reasoned `reconcile` command through the actual finance repository adapter. It shows “Linked to a single payment entry.” This is an explicit legacy link; bankfeed does not automatically approve a sponsorship. New proof approval has its own payment-source path.                                                  |

## Roles and upload contract

- Public sponsorship upload: no admin account; rate-limited, Turnstile verified when issuing the signed URL; final submission verifies the signed intent and uploaded-object metadata. JPEG, PNG, WebP or PDF, nonempty, maximum **8 MiB**. Private bucket: `sponsorship-payment-proof`. Staff reads use a **60-second** signed URL tied to an exact proof/revision.
- Staff sponsorship recording/upload: active **staff/admin**, using the existing multipart API. Same formats/8 MiB limit; file optional for an independently verified manual payment. Multipart envelope capped at 9 MiB. Staff cannot approve proof or perform finance linkage.
- Sponsorship proof approval and existing-payment reconciliation: active **treasurer/admin**. Read-only pledge/proof access also permits staff. Finance linkage requires an approved legacy proof, matching succeeded payment/donation for the same supporter and amount, and a reason of at least five characters (SQL checks; not executed locally).
- Donation manual gift creation and bank preview/create/apply: active **treasurer/admin**. Staff can read payments but cannot confirm them. Existing atomic RPCs retain role rechecks, audit writes, snapshot expiry/concurrency checks and idempotency.
- Bank CSV: UTF-8 (BOM supported), at most **256 KiB / 1,000 rows**, exact header `bank_reference,received_on,currency,amount_hkd,payment_hint`. ISO date, `HKD`, positive decimal with two fractional digits; exact selection requires the matching payment reference. Images/PDFs are proof files, not bank statement input.
- Donation photos/records use the existing email contact and staff intake. The app imposes no email attachment-format/size policy; mailbox delivery and limits were not tested. No email was sent.

## Fresh fixture journey

Run from the repository with Bun **1.3.14** (the pinned CI version):

```sh
SUPABASE_LOCAL_URL=http://127.0.0.1:1 VITE_PUBLIC_DONATION_CHECKOUT_ENABLED=false \
  bun scripts/verify-payment-bankfeed-local.ts
```

The script starts/stops its own loopback Vite server on port 56571, refuses an already occupied port, blocks external browser requests, and injects in-memory repositories/Storage. All actor/supporter identifiers are explicit DI fixture values; **no UAT/auth account was created**. The 68-byte PNG is synthetic and contains no animal photograph.

1. The real public `uploadProofDirectly` helper requested a URL through the real handler, then sent the file bytes to fixture Storage.
2. A HK$300 canonical CSV reached the actual bank preview/selection handlers. Preview did not credit anything. Confirmation applied once in the in-memory repository.
3. The following operation GET deliberately failed with 503. The actual `PaymentsReconcile` table still refetched and showed **Confirmed**, with the summary updated to HK$300. Read-only recovery then showed **Credited**.
4. The actual pledge drawer uploaded a staff PNG via multipart through the real upload handler and service. Staff loaded its private preview and approved the exact proof/revision; the drawer showed the confirmed pledge and approved proof.
5. A separately seeded historical unlinked proof selected the same bank-confirmed payment. The existing finance adapter sent `reconcile_legacy_sponsorship_payment` to the fixture RPC boundary with exact proof/payment/reason, then displayed the linked state.

Machine-readable results: [journey.json](journey.json). Screenshots are retained at
`/workspace/cli-logs/hkscda-d1-fixture/` per the evidence directory's raw-artifact policy:
`bank-confirmed.png`, `sponsorship-approved.png`, `sponsorship-bank-linked.png`,
`donation-assisted-zh.png`, `donation-assisted-en.png`.
See [raw-artifact-manifest.json](raw-artifact-manifest.json) for SHA-256 hashes and sizes.

The built `/donate` page was separately checked against the read-only CI HTTP fixture. Both languages show the assisted handoff and a disabled checkout fieldset.

## Validation and limits

Local results: **7,441 passed / 728 skipped / 0 failed** in 853 files; focused D1 tests **460 passed / 25 skipped / 0 failed** in 54 files. Typecheck, lint (0 errors, 53 existing warnings), build and generated route-tree consistency passed. Public brand verification passed **26 routes × 5 viewports**; DI browser journey passed with no page errors. Final-tip remote CI is recorded in the draft PR and `/workspace/cli-logs/hkscda-d1.last.txt`.
Commands: `bun run typecheck`, `SUPABASE_LOCAL_URL=http://127.0.0.1:1 bun run test`,
`bun run lint`, `bun run build`, route-tree diff check, `bun run verify:brand` with the workflow's read-only HTTP fixture and loopback app. Checkout was explicitly false during build/runtime. The focused command covers donation bank services/routes/components, manual-gift services, sponsorship services/routes/components, and the new finance HTTP tests.

Local setup initially symlinked dependencies into another worktree, causing Bun 1.3.14 bundler file-read failures. Replaced only this worktree's symlink with a frozen-lockfile install; the other worktree was untouched. The image also lacks the `python` executable name used by existing preservation tests; a task-local PATH alias to `/usr/bin/python3` fixes that prerequisite without repository changes.

No shared/local Supabase stack was contacted or modified. Unit-only tests used `SUPABASE_LOCAL_URL=http://127.0.0.1:1`; opt-in database suites stayed skipped. Fixture apply/review/link outcomes are simulated at repository/RPC boundaries: **they do not prove SQL transactions, RLS, deployed migrations, actual Storage access, email delivery or live finance UAT**. Public sponsorship pledge submission remains held by A-04 terms; only the upload handoff and DI submission tests were exercised. There is no deployed proof or supported finance UAT identity.

No remaining confirmed code P0 was found on the existing paths after these fixes. Outstanding acceptance evidence: real donation email/photo reception and staff intake, deployed private Storage and DB/RLS/atomic audit behavior, and supported treasurer/admin UAT. A native donation attachment uploader remains absent; this gap-fix does not introduce a new upload product.

**Channels still gated off:** `VITE_PUBLIC_DONATION_CHECKOUT_ENABLED=false`; no live Stripe/PayPal/COD, merchant/webhook/channel activation, D2–D4, A-04 terms publication/ungating, A-05 environment work, DNS, deployment or public preview. Draft PR only; no merge, auto-merge, reviewer request or Bugbot invocation.
