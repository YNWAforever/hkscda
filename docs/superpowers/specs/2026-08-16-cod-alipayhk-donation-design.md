# COD AlipayHK Donation Gateway Design

**Date:** 2026-08-16
**Status:** Design and written specification approved; implementation plan in progress
**Source protocol:** Acquire TMS API for merchants v2.7.1 (2024-12-11), supplied out of band

## Summary

HKSCDA will replace the Alipay option currently offered through Stripe Checkout with a direct COD AlipayHK integration. Stripe remains available for cards, PayPal remains unchanged, and the existing FPS and PayMe manual flows remain unchanged.

The COD integration extends the existing donation and payment lifecycle rather than creating a second transaction subsystem. Mobile donors use COD's WAP experience, desktop donors use COD's hosted PC-to-mobile QR experience, and only verified COD notifications or status responses may mark a donation paid.

The first reviewable release is sandbox-only. The code and configuration shape may support a later production switch, but production credentials, webhook registration, live payment testing, deployment, and activation are separate approval gates.

## Decisions

- COD replaces Stripe as the processor for Alipay.
- The initial wallet is AlipayHK only (`ALIPAYHK`).
- Mobile checkout uses `WAP`.
- Desktop checkout uses `PC2MOBILE` and COD's hosted QR experience.
- COD reuses the current donation, payment, webhook-event, reconciliation, receipt, message, and audit lifecycle.
- Webhooks are the primary confirmation mechanism; provider status refresh is the recovery mechanism.
- No refund-initiation UI or API is included. Verified full-refund notifications are supported; partial refunds require manual review.
- No merchant identifiers, private keys, AES secrets, or environment-specific notification keys are committed.

## Goals

1. Let donors choose a clear, dedicated AlipayHK payment method.
2. Preserve server-owned payment confirmation and idempotent receipt issuance.
3. Keep COD cryptography isolated from donation business logic.
4. Recover safely when notifications are delayed or missed.
5. Make sandbox verification possible without production access.
6. Keep the change reviewable and consistent with the existing Stripe and PayPal boundaries.

## Non-goals

- Mainland Alipay (`ALIPAYCN`).
- Recurring Alipay donations.
- In-app Alipay SDK checkout.
- Merchant-initiated refunds or partial-refund automation.
- A new COD transaction table or standalone payment state machine.
- Production configuration, live charging, deployment, or webhook registration.
- Changes to PayPal, FPS, or PayMe behavior.

## Domain and persistence model

The donor-facing method and processor identity are intentionally distinct:

- Donation method: `alipayhk`
- Payment provider: `cod`
- Webhook-event provider: `cod`

This prevents the UI's wallet name from being confused with the contracted gateway and leaves room for another COD wallet later without renaming stored processor data.

A forward-only Supabase migration will:

1. Extend the `donation.method` check constraint with `alipayhk`.
2. Extend the `payment.provider` check constraint with `cod`.
3. Extend the `webhook_event.provider` check constraint with `cod`.
4. Preserve the existing unique `(provider, provider_ref)` index.

No existing rows are rewritten. The migration must fail closed if an expected constraint cannot be replaced safely.

## Component boundaries

### COD configuration

The existing server configuration layer gains a lazy `getCodConfig()` reader. It is invoked only by COD order, refresh, or notification paths so unrelated builds and payment methods do not require COD credentials.

Expected environment variables use empty placeholders in `.env.example`:

- `COD_ENV=sandbox|production`
- `COD_MERCHANT_ID`
- `COD_SEGMENT_ID`
- `COD_AES_SECRET_BASE64`
- `COD_PRIVATE_KEY_BASE64`
- `COD_NOTIFICATION_PUBLIC_KEY_BASE64`

The API base is derived from `COD_ENV`; callers cannot provide an arbitrary gateway URL. Sandbox is the configured deployment target for this release. Key material is base64-encoded for reliable environment-variable transport, decoded only on the server, and never re-serialized into logs. Configuration validation requires a 16- or 32-byte AES key, derives the matching documented cipher suite from that length, parses both decoded PEM keys, and rejects unsupported environments before making a network request.

### COD cryptography module

`cod-crypto.server.ts` owns protocol primitives only:

- AES-CBC encryption and decryption with PKCS#7 padding.
- A fresh cryptographically random 16-byte IV for every request.
- RSA-SHA256 PKCS#1 v1.5 signing of the exact binary `IV || ciphertext` sequence.
- RSA-SHA256 verification of the exact notification `data` bytes.
- Base64 encoding and strict decoding for the envelope fields.

The module accepts explicit inputs and returns typed byte/string results. It does not read environment variables, call COD, write logs, or know about donations.

### COD API client

`cod-client.server.ts` owns the `/v1/service` protocol:

- Build the generic request with `request_uuid`, Unix-second `request_time`, service name, merchant ID, and parameters.
- Encrypt and sign outgoing requests through the crypto module.
- POST only to the environment-mapped COD endpoint.
- Decrypt responses with the configured AES secret.
- Validate response shape before returning typed results.
- Normalize COD business errors into safe internal error categories.

The client exposes focused operations for `create_order` and `refresh_transaction_status`. It never accepts raw browser input.

### COD payment adapter

The existing payment-provider interface gains a COD AlipayHK operation. The adapter maps a validated donation checkout request into COD parameters:

- A stable `order_ref` derived from the internal payment ID and kept within COD's length limit.
- `segment_id` from server configuration.
- HKD amount derived from integer cents with exactly two decimal places.
- A bounded bilingual donation subject.
- Wallet fixed to `ALIPAYHK`.
- Solution fixed to `WAP` or `PC2MOBILE` from a validated presentation hint.
- A return URL containing only the donation ID and a pending status marker.

The adapter composes COD's returned `url` and `alipay_order_string` on the server according to the selected solution. It returns the final hosted checkout URL plus `out_trade_no`, which becomes `payment.provider_ref`.

### Notification route

`POST /api/webhooks/cod` owns transport parsing and acknowledgement. It keeps the received `data` string intact until signature verification succeeds, then parses the verified JSON and delegates to the existing reconciliation lifecycle.

### Status refresh service

A small server service queries COD only when the donation is still pending and its payment provider is `cod`. The public donation-status route invokes this service under its no-store and rate-limit boundary before returning the latest local status.

The browser polls no faster than once every 10 seconds for at most 15 minutes. The existing per-IP status rate limit caps abusive or multi-tab refresh traffic. A refresh failure leaves the donation pending and returns the current local status; it never creates a false failure or success.

## Checkout flow

1. The donor chooses **AlipayHK**.
2. The browser supplies a validated presentation hint: `wap` for mobile or `desktop_qr` for desktop. This hint changes only the COD solution and has no payment authority.
3. `POST /api/donations` validates the donation and presentation hint.
4. The existing service creates the supporter, consent, pending donation, and pending payment records.
5. The COD adapter creates the encrypted and signed sandbox order.
6. On a valid COD response, the service stores `out_trade_no` as the provider reference.
7. The API returns a redirect result containing the donation ID and COD-hosted checkout URL.
8. Mobile donors enter COD's WAP flow; desktop donors see COD's hosted QR flow.
9. COD returns the donor to `/donate` with a pending marker. The return never changes payment state.
10. The browser polls the public donation-status endpoint until the local donation becomes succeeded or the 15-minute checkout window ends.

If order creation fails before a checkout URL reaches the donor, the existing failed-checkout compensation removes the pending payment/donation rows. An accepted order whose response is lost cannot be paid because no checkout URL reached the donor; its stable `order_ref` remains an unpaid provider-side artifact.

## Notification and reconciliation flow

The route accepts the documented notification envelope containing `data`, `signature`, and `algorithm`.

Before any payment mutation it must:

1. Require the expected RSA-SHA256 algorithm.
2. Verify the signature over the exact received `data` bytes with COD's notification public key.
3. Parse `data` only after verification.
4. Require the configured merchant ID and segment ID.
5. Require wallet `ALIPAYHK` and currency `HKD`.
6. Resolve the payment by provider `cod` and `out_trade_no`.
7. For a payment event, require type `payment`, status `paid`, and an amount equal to the stored integer-cent amount.
8. For a refund event, require the documented refund type/status, bind it to the same provider transaction, and determine whether the verified refunded amount is full or partial before choosing automatic reversal or manual review.

The existing webhook reservation and reconciliation functions remain authoritative. A stable event identity is derived from COD's transaction identity, event type, and terminal status so duplicate deliveries are acknowledged without repeating receipts, messages, or audits.

Responses follow these rules:

- Valid and processed: plain `success`.
- Valid duplicate: plain `success`.
- Valid but permanently inconsistent or unmapped: create a safe audit/manual-review record and return plain `success` to prevent futile retry storms.
- Invalid signature or malformed unverified content: non-success response with no database mutation.
- Transient database or internal processing failure: server error so COD retries.

Verified full-refund notifications enter the existing refund lifecycle and void eligible receipts according to current policy. Partial refunds create a manual-review audit and do not automatically reverse the full donation.

## Status refresh and delayed confirmation

`refresh_transaction_status` is a recovery confirmation path, not an independent local state machine. It uses the stored `out_trade_no` and validated merchant context.

- `paid`: enter the same idempotent reconciliation function with a stable synthetic refresh-event identity.
- Not found or still unpaid: keep the donation pending.
- Invalid, mismatched, or unverifiable response: keep the donation pending and record a safe operational error.
- Transport error: keep the donation pending and allow a later poll or webhook to recover.

Only a verified provider result can issue the acknowledgement email, mark the donation succeeded, or issue a tax receipt.

## Donor experience

The payment selector becomes:

- Card
- AlipayHK
- FPS
- PayMe
- PayPal

Stripe Checkout changes from `card + alipay` to card-only. AlipayHK uses COD exclusively.

The donate page adds bilingual states for:

- Redirecting to AlipayHK.
- Waiting for payment confirmation.
- Confirmed payment.
- Confirmation still pending after the checkout window.
- Checkout creation temporarily unavailable.

Status changes use an accessible live region. Analytics may record checkout start and confirmed success but must not include COD references or encrypted/provider payloads. Success analytics fire only after the public status endpoint reports a verified succeeded donation.

## Error handling and observability

- Invalid donation or presentation input is rejected before provider work.
- Missing or malformed configuration fails closed before network access.
- Donors receive generic bilingual errors without COD codes, payloads, or identifiers.
- Logs may contain a request UUID, safe internal category, HTTP status, and COD error code where non-sensitive.
- Logs must never contain AES secrets, private keys, signatures, decrypted envelopes, donor data, or full provider responses.
- Valid notification mismatches create structured audit entries for manual review.
- Pending status is preserved whenever the system cannot prove a terminal state.
- Outbound COD calls use a bounded timeout. `create_order` is not blindly retried after an ambiguous transport failure; status refresh is retried only through a later rate-limited poll.

## Security requirements

- COD secrets remain in server-only variables and never use the `VITE_` prefix.
- Actual merchant and segment identifiers remain environment configuration rather than committed defaults.
- The merchant private key and COD notification public key are separate trust roles.
- Every request uses a fresh IV; IV reuse is a test failure.
- The notification signature is verified before JSON parsing or field trust.
- Amount, currency, wallet, merchant, segment, type, status, and provider reference are all bound before reconciliation.
- Browser return parameters never authorize payment state.
- Production activation requires an explicit later review of endpoint, key registration, notification URL, and secret placement.

## Testing strategy

### Cryptography tests

- Known AES-CBC encrypt/decrypt vectors.
- Fresh-IV behavior and invalid IV length.
- RSA signing and verification with test-only keys.
- Exact `IV || ciphertext` signing order.
- Exact notification `data` byte verification.
- Wrong key, altered bytes, invalid base64, malformed PEM, and invalid AES length rejection.

### Client and adapter tests

- Sandbox endpoint and envelope shape.
- Unique request UUID and Unix-second timestamp.
- WAP and PC2MOBILE parameter mapping.
- Fixed `ALIPAYHK` and exact HKD amount conversion.
- Server-side hosted URL composition.
- Decrypted success, COD business error, malformed response, and transport failure.
- Status refresh mapping for paid, unpaid, and not-found results.

### Service and reconciliation tests

- Stripe requests cards only.
- `alipayhk` selects COD and no other provider.
- Failed order creation follows checkout compensation.
- COD provider reference is persisted.
- Valid notification reconciles once.
- Duplicate notification and refresh-after-webhook remain idempotent.
- Invalid signatures and all merchant/amount/wallet mismatches perform no credit mutation.
- Full refunds use existing reversal behavior; partial refunds require review.

### Route, UI, and migration tests

- Notification response is exactly plain `success` for acknowledged events.
- Status responses are no-store and rate limited.
- Bilingual payment labels and pending states render accessibly.
- Mobile selects WAP and desktop selects hosted QR.
- Success analytics wait for verified local success.
- Database constraints accept `alipayhk` and `cod` while preserving existing values.
- Migration policy tests continue to pass.

### Browser and sandbox verification

Automated browser journeys use a mocked COD service at mobile and desktop viewports. A real sandbox smoke test is disabled by default and requires locally installed credentials plus explicit network authorization. It must not be part of ordinary CI and must never use production values.

## Delivery sequence

### 1. CI isolation change

Ship a separate, minimal change before relying on the suite as an Alipay gate:

- Change the package test script to `bun test --parallel` so each test file has an isolated global.
- Make CI call the package test script.
- Verify the full pre-Alipay suite, typecheck, lint, and build.

This addresses the latent `mock.module()` cross-file contamination exposed by PR #56 without mixing infrastructure work into that content PR.

### 2. PR #56 review correction

Keep the partner-content PR separate. Its seven partner logos match the official homepage, but its assertion that none of the prior media names appear on HKSCDA's site must be corrected because the official association profile documents several media interviews. The PR should either intentionally remove the homepage press strip with accurate rationale or use the verified media history.

### 3. AlipayHK implementation

Create the migration, COD modules, provider integration, notification/status paths, donor UI changes, documentation, and tests in one focused branch based on current `main` after the CI isolation change lands.

## Acceptance criteria

- Card checkout uses Stripe without Alipay.
- AlipayHK uses COD exclusively.
- Mobile and desktop receive the correct COD-hosted experience.
- No browser return can mark a donation paid.
- Valid notifications and refresh responses reconcile exactly once.
- Mismatched or invalid provider data never credits a donation.
- Confirmed donations continue through existing acknowledgement and receipt behavior.
- No actual merchant identifiers or secrets appear in source, fixtures, logs, snapshots, or Git history.
- All new tests pass with the isolated full suite.
- Typecheck, lint, build, migration tests, and mocked browser verification pass.
- Real sandbox verification remains explicitly gated; no production request or deployment occurs.

## External gates

The following are known later actions, not unresolved design decisions:

1. Restore authenticated local GitHub access before pushing review branches.
2. Confirm the supplied merchant, segment, AES, and RSA credentials are enabled for COD's sandbox environment.
3. Install those sandbox credentials in an approved local or preview environment without committing them.
4. Confirm the corresponding merchant public key is registered with COD and register the sandbox notification URL.
5. Explicitly authorize and run the real sandbox smoke test.
6. Conduct a separate production-readiness review before any production configuration, webhook registration, live charge, or deployment.
