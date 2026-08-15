# COD AlipayHK Donation Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sandbox-only direct COD AlipayHK checkout to HKSCDA's existing donation lifecycle, while keeping Stripe card checkout, PayPal, FPS, and PayMe behavior intact and ensuring only verified provider data can mark a donation paid.

**Architecture:** Keep one donation/payment/reconciliation lifecycle. Store `alipayhk` as the donor-facing method and `cod` as the processor. Add isolated server-only COD configuration, AES-CBC/RSA cryptography, encrypted COD client calls, a provider adapter, a signed notification route, and a pending-status refresh seam. Reuse the existing webhook reservation, payment reconciliation, receipt, notification, and audit paths; do not add a transaction table or let browser return parameters authorize payment.

**Tech Stack:** TypeScript, Bun tests, TanStack Start/Router, React, Supabase/Postgres migrations, Node `crypto`, COD Acquire TMS API v2.7.1.

## Global Constraints

- Start implementation from the current GitHub `main` after the separate CI-isolation prerequisite is available. The local checkout used for discovery is stale and dirty; do not modify it.
- Never commit the supplied merchant ID, segment ID, AES secret, RSA private key, notification public key, decrypted payloads, or production values. Test fixtures must generate their own keys and use synthetic identifiers.
- `COD_ENV=sandbox` is the only enabled release target. Production endpoint selection may be represented in configuration but must remain gated and untested against live services.
- The browser may send only a validated presentation hint (`wap` or `desktop_qr`). It cannot choose the merchant, wallet, amount, status, provider reference, or reconciliation result.
- Keep COD credentials lazy: Stripe/card, PayPal, manual flows, typecheck, and builds must not require COD environment variables unless a COD operation is invoked.
- Preserve current failed-checkout compensation, webhook idempotency, receipt eligibility, audit behavior, rate limits, and no-store status responses.
- Use test-first changes. For every implementation step, add or update a focused failing test, run the narrow test, implement the smallest change, rerun the narrow test, then run the relevant broader suite.
- Do not perform a real sandbox request, register a webhook, deploy, or switch production configuration as part of implementation.

## Prerequisite: separate CI isolation change (not part of this branch)

This is a small prerequisite PR and must stay separate from both PR #56 and the Alipay implementation:

- `package.json`: change the test script from `bun test` to `bun test --parallel`.
- `.github/workflows/ci.yml` on current `main`: make the test step run `bun run test` so CI uses the package script. Confirm the exact workflow path after rebasing because the local stale base predates the workflow.
- Reproduce the current order-dependent failure with plain `bun test`, verify the parallel command passes, then run `bun run test`, `bun run typecheck`, `bun run lint`, and `bun run build` before opening that PR.
- Do not mix the PR #56 partner-content correction into this change. Its factual media-history assertion needs a separate review decision.

## Task 1: Extend the domain and database contracts

**Files:**

- Add `supabase/migrations/20260720100000_cod_alipayhk_payment_support.sql`.
- Modify `src/lib/donations/contracts.ts` and `src/lib/donations/domain.ts`.
- Modify `src/lib/donations/service.ts` and `src/lib/donations/reconcile.server.ts`.
- Modify `src/lib/supabaseMigrations.test.ts`, `src/lib/donations/domain.test.ts`, and `src/lib/donations/service.test.ts`.

### 1.1 Write the failing migration/contract tests first

- In `src/lib/supabaseMigrations.test.ts`, read the new migration by its exact filename and assert it drops and recreates the three expected checks without rewriting rows:

  ```ts
  expect(sql).toContain("drop constraint if exists donation_method_check");
  expect(sql).toContain("add constraint donation_method_check check");
  expect(sql).toContain("'alipayhk'");
  expect(sql).toContain("drop constraint if exists payment_provider_check");
  expect(sql).toContain("'cod'");
  expect(sql).toContain("drop constraint if exists webhook_event_provider_check");
  expect(sql).toContain("'cod'");
  expect(sql).not.toMatch(/delete\s+from\s+(public\.)?(donation|payment|webhook_event)/i);
  ```

- Add domain tests proving `donationRequestSchema` accepts `method: "alipayhk"`, defaults a missing checkout hint to `desktop_qr`, accepts `wap`, and rejects any other hint before provider work.
- Add service tests proving an AlipayHK request writes `provider: "cod"`, calls only the COD provider, carries the validated hint, and returns a redirect whose provider is `cod`.
- Add a type-level/fixture assertion that Stripe and PayPal remain valid online providers and manual `fps`, `payme`, and legacy `manual` payment rows remain representable.

Run:

```text
bun test src/lib/supabaseMigrations.test.ts src/lib/donations/domain.test.ts src/lib/donations/service.test.ts
```

The new assertions must fail before implementation.

### 1.2 Implement the forward-only migration and typed unions

- In the migration, use the existing check names and preserve all current values while adding only the new value:

  ```sql
  alter table public.donation drop constraint if exists donation_method_check;
  alter table public.donation add constraint donation_method_check
    check (method in ('stripe', 'payme', 'fps', 'paypal', 'manual', 'alipayhk'));

  alter table public.payment drop constraint if exists payment_provider_check;
  alter table public.payment add constraint payment_provider_check
    check (provider in ('stripe', 'payme', 'fps', 'paypal', 'manual', 'cod'));

  alter table public.webhook_event drop constraint if exists webhook_event_provider_check;
  alter table public.webhook_event add constraint webhook_event_provider_check
    check (provider in ('stripe', 'paypal', 'payme', 'fps', 'resend', 'whatsapp', 'cod'));
  ```

  Keep the existing unique `(provider, provider_ref)` index and do not seed or rewrite data. If a later current-main migration uses a different constraint name, stop and adapt the migration to that verified name rather than silently creating a parallel check.

- In `contracts.ts`, add `alipayhk` to `donationMethods`, export `CheckoutExperience = "wap" | "desktop_qr"`, and export `PaymentProvider = Exclude<DonationMethod, "alipayhk"> | "manual" | "cod"` plus `OnlinePaymentProvider = "stripe" | "paypal" | "cod"`. This makes it impossible to persist the donor-facing `alipayhk` label as a processor value.
- In `domain.ts`, add `checkoutExperience: z.enum(["wap", "desktop_qr"]).default("desktop_qr")` to `donationRequestSchema` and re-export the new types. The parsed value is input validation only; it is not persisted.
- In `service.ts`, change `PaymentInsert.provider` to `PaymentProvider`, make `CheckoutProviderInput.checkoutExperience` required, add `createCodAlipayHkCheckout`, and branch explicitly on `stripe`, `paypal`, and `alipayhk`. Map `alipayhk` to the stored payment provider `cod`; do not use the donor method string as the processor value. Return `provider: "cod"` for the Alipay redirect result.
- In `reconcile.server.ts`, use `OnlinePaymentProvider` for provider webhook arguments so the existing reservation, lookup, fallback payment ID, and idempotent success/refund functions accept `cod` without loosening the provider type to arbitrary strings.

Run the three focused test files again and inspect the migration diff for destructive statements.

### 1.3 Verify this task

- `bun test src/lib/supabaseMigrations.test.ts src/lib/donations/domain.test.ts src/lib/donations/service.test.ts`
- `bun run typecheck`
- `git diff --check`

## Task 2: Add lazy COD configuration and cryptographic primitives

**Files:**

- Modify `src/lib/donations/config.server.ts` and `.env.example`.
- Add `src/lib/donations/cod-crypto.server.ts` and `src/lib/donations/cod-crypto.server.test.ts`.

### 2.1 Write failing crypto/config tests

- Test strict decoding of base64 AES material, 16-byte and 32-byte key acceptance, invalid length rejection, malformed PEM rejection, and unsupported environment rejection.
- Test AES-CBC PKCS#7 round trips for both key lengths, random 16-byte IV generation, invalid IV rejection, and the fact that two encryptions of the same plaintext produce different nonces.
- Generate test-only RSA keys in the test file and assert RSA-SHA256 PKCS#1 v1.5 signs and verifies the exact `nonce bytes || ciphertext bytes` sequence. Altered ciphertext, altered nonce, altered signature, and wrong public key must fail.
- Assert notification verification signs/verifies the exact UTF-8 bytes of the original `data` string, including whitespace and escaped Unicode; do not parse and reserialize before verification.

Run:

```text
bun test src/lib/donations/cod-crypto.server.test.ts
```

### 2.2 Implement the server-only configuration and crypto module

- Add `getCodConfig()` to `config.server.ts` with lazy reads of:

  ```text
COD_ENV=sandbox|production
COD_MERCHANT_ID
COD_SEGMENT_ID
COD_AES_SECRET_BASE64
COD_PRIVATE_KEY_BASE64
COD_NOTIFICATION_PUBLIC_KEY_BASE64
  ```

- Derive the API base internally (`https://aqs-api.sandbox-codpayment.com` for sandbox and `https://aqs-api.codpayment.com` for production); do not accept an arbitrary URL environment variable. Decode key material only inside this function, validate AES length (16 or 32 bytes), parse both PEM keys, and return a typed object. Do not log the decoded values.
- Add matching empty placeholders and a clear sandbox comment to `.env.example`; never use a `VITE_` prefix.
- Implement `cod-crypto.server.ts` with explicit-input functions for AES-CBC PKCS#7 encryption/decryption, strict base64 encode/decode, RSA-SHA256 PKCS#1 v1.5 signing/verifying, and envelope construction. The request envelope is `{ merchant_id, message, nonce, tag, cipher_suite }`, where `tag` is the signature over the raw `nonce || ciphertext` bytes and `cipher_suite` is selected from the AES key length.
- Keep the module free of environment reads, network calls, donation imports, and logging.

### 2.3 Verify this task

- `bun test src/lib/donations/cod-crypto.server.test.ts`
- `bun run typecheck`
- Scan the diff for private-key blocks, long base64 literals, merchant IDs, and `console.log`/`console.error` calls in the crypto module.

## Task 3: Build the encrypted COD client and AlipayHK provider adapter

**Files:**

- Add `src/lib/donations/cod-client.server.ts` and `src/lib/donations/cod-client.server.test.ts`.
- Add `src/lib/donations/cod-provider.server.ts` and `src/lib/donations/cod-provider.server.test.ts`.
- Modify `src/lib/donations/providers.server.ts`, `src/lib/donations/providers.server.test.ts`, and `src/lib/donations/config.server.ts` only where the new provider seam requires it.

### 3.1 Write failing client/adapter tests

- Mock `fetch` and assert every request is a POST to the environment-derived `/v1/service` endpoint with JSON content type, a UUID-like `request_uuid`, a Unix-second string `request_time`, the exact service name, configured merchant ID, and encrypted `parameters`.
- Decrypt the captured request with the test AES key and assert `create_order` sends:

  ```ts
  {
    order_ref,
    segment_id,
    amount: cents / 100,
    currency: "HKD",
    subject,
    wallet: "ALIPAYHK",
    return_url,
    payment_solution: "WAP" | "PC2MOBILE",
  }
  ```

  `order_ref` must contain only COD-allowed characters, be stable for the internal payment ID, and be no longer than 64 characters. The subject must be bounded and bilingual without donor PII.
- Feed an encrypted success response containing `url`, `alipay_order_string`, and `out_trade_no`; assert WAP and PC2MOBILE compose a server-owned hosted URL without exposing provider payloads to the browser. Store `out_trade_no` as the provider reference.
- Test `refresh_transaction_status` request parameters (`out_trade_no`, `segment_id`, `request_details: true`) and map `paid`, `not_exists`, `new`, `expired`, `canceled`, and `failed` to typed internal results.
- Test malformed envelopes, invalid decrypted JSON, COD `success: false` errors, non-2xx responses, timeout/abort, and missing required success fields. Assert create-order transport ambiguity is surfaced without an automatic retry.

Run:

```text
bun test src/lib/donations/cod-client.server.test.ts src/lib/donations/cod-provider.server.test.ts src/lib/donations/providers.server.test.ts
```

### 3.2 Implement the client and adapter

- `cod-client.server.ts` owns request UUID/time generation, JSON serialization, crypto envelope construction, bounded `fetch` timeout, response envelope validation/decryption, and safe internal error categories. It must expose only focused `createOrder` and `refreshTransactionStatus` operations and must not accept raw browser input.
- Use the PDF service names `create_order` and `refresh_transaction_status`. For `create_order`, use `payment_solution: "WAP"` or `"PC2MOBILE"`, `wallet: "ALIPAYHK"`, `currency: "HKD"`, a bounded `timeout` of at least the documented 5 minutes, and the configured segment ID.
- `cod-provider.server.ts` converts `amountCents` to an exact two-decimal number, builds the stable order reference, passes the validated checkout experience, and returns `{ providerRef: out_trade_no, url }`. Keep return URLs limited to the internal donation ID and a pending marker.
- Extend `PaymentProviders` and `createPaymentProviders()` with `createCodAlipayHkCheckout` while leaving PayPal functions unchanged. Change Stripe Checkout to `payment_method_types: ["card"]`; add a regression assertion that Alipay is no longer sent to Stripe.

### 3.3 Verify this task

- `bun test src/lib/donations/cod-client.server.test.ts src/lib/donations/cod-provider.server.test.ts src/lib/donations/providers.server.test.ts`
- `bun run typecheck`
- `git diff --check`

## Task 4: Wire the donation API and donor experience

**Files:**

- Modify `src/routes/api/donations.ts` only if response/input plumbing needs an explicit change.
- Modify `src/routes/donate.tsx`.
- Modify `src/lib/donations/publicStatus.ts`, `src/lib/donations/publicStatus.test.ts`, and `src/routes/donate.test.tsx`.
- Add `src/lib/donations/checkoutExperience.ts` and `src/lib/donations/checkoutExperience.test.ts` if extracting viewport classification keeps the route testable.

### 4.1 Write failing UI/status tests

- Add a route test that the selector presents Card, AlipayHK, FPS, PayMe, and PayPal; the card label no longer promises Alipay; and the Alipay option sends `method: "alipayhk"` with `checkoutExperience`.
- Test mobile classification as `wap` and desktop classification as `desktop_qr` without relying on a real browser viewport in unit tests.
- Test redirect handling for `provider: "cod"` and the pending return marker. A return URL must never directly record success.
- Change polling tests to cover the new bounded window: default 10-second delay and 90 attempts (15 minutes), terminal success/failure/refunded behavior, and no extra request after the window. Keep unit tests fast by passing `attempts` and `delayMs: 0`.
- Test that success analytics still fires only after the status loader returns `succeeded`, while pending timeout shows the bilingual pending/unavailable state in an accessible live region.

Run:

```text
bun test src/lib/donations/publicStatus.test.ts src/lib/donations/checkoutExperience.test.ts src/routes/donate.test.tsx
```

### 4.2 Implement the route and copy changes

- Add the dedicated AlipayHK method and bilingual copy for redirecting, waiting, confirmed, still-pending-after-window, and temporary checkout failure states.
- Derive `checkoutExperience` from the client viewport at submit time (`wap` for mobile, `desktop_qr` otherwise), send it with the existing donation payload, and leave all payment authority on the server.
- Update the redirect result type and snapshot handling so `cod` is a supported processor. On return, accept only the pending marker and start the status poll; the existing status endpoint remains the source of truth.
- Set `pollDonationSucceeded` defaults to 90 attempts and 10,000 ms. Preserve a hard maximum and immediate stop on `succeeded`, `failed`, or `refunded`.
- Keep payment labels, status announcements, and errors bilingual and generic. Do not render COD order references, signatures, or response payloads.

### 4.3 Verify this task

- `bun test src/lib/donations/publicStatus.test.ts src/lib/donations/checkoutExperience.test.ts src/routes/donate.test.tsx`
- `bun run typecheck`
- Run the route's existing accessibility assertions and inspect the diff for provider payload logging.

## Task 5: Add signed COD notifications and pending status refresh

**Files:**

- Add `src/lib/donations/cod-webhook.server.ts` and `src/lib/donations/cod-webhook.server.test.ts`.
- Add `src/lib/donations/cod-status.server.ts` and `src/lib/donations/cod-status.server.test.ts`.
- Add `src/routes/api/webhooks/cod.ts` and `src/routes/api/webhooks/-cod.test.ts`.
- Modify `src/lib/donations/publicStatus.server.ts`, `src/lib/donations/publicStatus.server.test.ts`, `src/lib/donations/supabase.server.ts`, and `src/routes/api/donations/$donationId/status.ts`.
- Modify `src/lib/donations/reconcile.server.ts` only to expose the typed `cod` provider path or a narrowly scoped helper needed by the new route.

### 5.1 Write failing notification/status tests

- Build test-only RSA-signed notification envelopes with the PDF's exact outer fields: `data` (the original JSON string), `signature` (base64), and `algorithm: "rsa-sha256"`.
- Assert the parser verifies the signature before parsing/trusting `data`; altered bytes, invalid algorithm, invalid base64, malformed JSON, wrong notification key, and missing required fields perform no database mutation.
- For payment data, assert exact validation of `transaction_id`, `amount`, `currency: "HKD"`, `merchant_id`, `segment_id`, `out_trade_no`, `type: "payment"`, `status: "paid"`, and optional `wallet: "ALIPAYHK"`. Reject mismatched merchant/segment/wallet/currency/type/status, unmapped provider references, and amount mismatches without crediting.
- For refund data, use the PDF fields (`transaction_id`, negative `amount`, `currency`, `merchant_id`, `segment_id`, `out_trade_no`, `out_return_no`, `type: "refund"`, `status: "paid"`). Full refund enters the existing refund lifecycle; partial refund creates a manual-review audit and does not void the whole receipt.
- Assert valid payment, valid duplicate, verified-but-unmapped, and transient processing outcomes return exactly plain `success`, while invalid signatures/malformed envelopes return a non-success response and database errors return 500 for retry.
- Test `refreshPendingCodDonation` selects only a pending `cod` payment, calls `refresh_transaction_status`, reconciles a `paid` response through the same idempotent function using a stable synthetic event ID, and leaves `not_exists`/unpaid/transport errors pending.
- Extend public-status tests with an optional `refreshPendingCod` callback and assert it runs after UUID validation and before `findStatus`. A callback error must be swallowed by the route's existing error policy without inventing a terminal status.

Run:

```text
bun test src/lib/donations/cod-webhook.server.test.ts src/routes/api/webhooks/-cod.test.ts src/lib/donations/cod-status.server.test.ts src/lib/donations/publicStatus.server.test.ts
```

### 5.2 Implement the notification parser, route, and refresh seam

- `cod-webhook.server.ts` keeps the received `data` string byte-for-byte intact, verifies RSA-SHA256 with the configured COD notification public key, then parses JSON. It validates the configured merchant and segment, wallet/currency, type/status, amount in cents, and provider reference before returning a typed payment/refund action. It must not import React or read browser state.
- `src/routes/api/webhooks/cod.ts` applies the existing webhook rate-limit pattern, reads the raw body, extracts the outer envelope, delegates verification/validation, then calls `reconcileProviderPayment` or `refundProviderPayment` with `provider: "cod"`, `providerRef: out_trade_no`, and a stable event ID such as `transaction_id:type:status:amount`. Keep acknowledged responses exactly `new Response("success")` with no JSON wrapper.
- Valid but permanently inconsistent events should be safely audited and acknowledged. Only transient database/internal failures should return 500. Never log decrypted data, signatures, donor information, or full provider responses.
- `cod-status.server.ts` queries the pending donation/payment join, instantiates the lazy COD client only when a matching pending `cod` payment exists, and maps `paid` to the existing reconciliation function. Use a deterministic refresh event ID derived from `out_trade_no`, status, and transaction ID so webhook-plus-refresh is idempotent.
- Extend `PublicDonationStatusRepository` with an optional `refreshPendingCod(donationId)` hook. `loadPublicDonationStatus` calls it only after the UUID check and before `findStatus`. `createSupabaseDonationStatusRepository` accepts the hook as a dependency, and the status route supplies `refreshPendingCodDonation` while retaining its current no-store response and 20-per-minute IP limit.
- A refresh timeout, `not_exists`, or non-paid result returns the current local status unchanged. The route must never mark a donation failed merely because COD could not be reached.

### 5.3 Verify this task

- `bun test src/lib/donations/cod-webhook.server.test.ts src/routes/api/webhooks/-cod.test.ts src/lib/donations/cod-status.server.test.ts src/lib/donations/publicStatus.server.test.ts`
- `bun test src/lib/donations/reconcile.server.test.ts src/lib/donations/reconcile.lifecycle.test.ts`
- `bun run typecheck`
- Inspect route responses and logs for exact acknowledgement/error behavior and secret-free diagnostics.

## Task 6: Documentation, runbook, and full verification

**Files:**

- Modify `.env.example` and `docs/donations-runbook.md`.
- Modify any generated route manifest only if the repository's normal build generates it; do not hand-edit generated files.
- Add or update focused tests only where the preceding tasks reveal a contract gap.

### 6.1 Write documentation checks first

- Add a documentation/config test only if the repository already tests `.env.example` or the runbook; otherwise use `rg` checks in the verification checklist.
- Assert no committed source, fixture, snapshot, or documentation contains the supplied merchant ID, segment ID, private key, AES secret, or notification key.
- Assert the runbook explicitly says sandbox-only, lists the six COD variables, distinguishes merchant private key from COD notification public key, documents the notification URL and status-refresh behavior, and calls out the explicit gate for a real sandbox smoke test.

### 6.2 Update the runbook and verify the complete flow

- Add COD sandbox setup to `docs/donations-runbook.md`: copy `.env.example`, install only sandbox values locally, configure the notification endpoint with COD, and never put secrets in `VITE_*` variables.
- Replace the old Stripe “Alipay/AlipayHK enabled” wording with card-only Stripe plus direct COD AlipayHK. Document WAP/mobile and PC2MOBILE/desktop QR behavior, pending confirmation, idempotent notifications, and full-vs-partial refund handling.
- Keep the real sandbox smoke test disabled by default and require explicit local credentials/network authorization. Production endpoint, key registration, webhook registration, deployment, and activation remain separate gates.
- Run the focused suites from Tasks 1–5, then the complete isolated suite and static checks:

  ```text
  bun run test
  bun run typecheck
  bun run lint
  bun run build
  ```

- Run mocked browser journeys at mobile and desktop viewports. Confirm card checkout has no Alipay payment type, AlipayHK produces the correct COD solution, the return remains pending until the local status is succeeded, and no provider secret/reference appears in browser output or analytics.
- Review `git diff --check`, `git status --short`, and the final changed-file list. Keep the implementation branch free of unrelated dirty-checkout files.

## Self-review checklist before handoff

- [ ] Every approved design decision in `docs/superpowers/specs/2026-08-16-cod-alipayhk-donation-design.md` has an implementation task or an explicit external gate.
- [ ] `alipayhk` is a donor method and `cod` is the only processor value for this flow.
- [ ] Stripe is card-only; PayPal, FPS, and PayMe behavior is unchanged.
- [ ] AES IVs are fresh, signatures cover the exact documented bytes, notification data is verified before parsing, and key roles are separate.
- [ ] Merchant/segment/wallet/currency/type/status/amount/provider-reference checks happen before reconciliation.
- [ ] Webhook and status-refresh paths share the existing idempotent lifecycle and do not create a new transaction table.
- [ ] Browser returns cannot mutate payment state; polling is bounded at 10 seconds for 15 minutes.
- [ ] Invalid or mismatched events do not credit; verified full refunds reverse through existing behavior; partial refunds require review.
- [ ] No supplied identifiers or secrets appear in source, tests, logs, snapshots, docs, or Git history.
- [ ] The plan contains no unresolved implementation placeholders or TODOs.
