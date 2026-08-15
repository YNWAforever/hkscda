# Task 1 Report: COD AlipayHK domain and database contracts

## Status

DONE_WITH_CONCERNS

## Implementation

- Added forward-only migration `20260720100000_cod_alipayhk_payment_support.sql`.
  It widens the existing donation method, payment provider, and webhook provider
  checks with `alipayhk` and `cod`, without changing existing rows or indexes.
- Added the donor-facing `alipayhk` method, `CheckoutExperience`,
  `PaymentProvider`, and `OnlinePaymentProvider` contract unions.
- Added `checkoutExperience` request parsing with a `desktop_qr` default and a
  strict `wap | desktop_qr` allow-list.
- Mapped AlipayHK donations to stored processor `cod`, including an explicit
  COD checkout branch and `cod` redirect result.
- Extended reconciliation webhook arguments to accept only online processors,
  now including `cod`.
- Added a temporary checked COD checkout factory method that rejects until the
  encrypted COD adapter is implemented by the next task. It prevents an
  AlipayHK request from silently falling through to Stripe or PayPal.

## Files changed

- `supabase/migrations/20260720100000_cod_alipayhk_payment_support.sql`
- `src/lib/donations/contracts.ts`
- `src/lib/donations/domain.ts`
- `src/lib/donations/service.ts`
- `src/lib/donations/reconcile.server.ts`
- `src/lib/donations/providers.server.ts`
- `src/lib/supabaseMigrations.test.ts`
- `src/lib/donations/domain.test.ts`
- `src/lib/donations/service.test.ts`

## RED evidence

Command:

```text
bun test src/lib/supabaseMigrations.test.ts src/lib/donations/domain.test.ts src/lib/donations/service.test.ts
```

Before implementation it produced three expected failures:

1. The migration file did not exist (`ENOENT`).
2. `donationRequestSchema` rejected `method: "alipayhk"` as an unsupported enum value.
3. The AlipayHK service test failed at the same pre-provider validation boundary.

## GREEN evidence

Command:

```text
bun test src/lib/supabaseMigrations.test.ts src/lib/donations/domain.test.ts src/lib/donations/service.test.ts
```

Result: `37 pass, 0 fail, 256 expect() calls`.

The test coverage now proves that:

- the migration recreates each expected check and has no destructive row rewrite;
- `alipayhk` parses, defaults to `desktop_qr`, accepts `wap`, and rejects an
  unsupported checkout hint;
- existing Stripe, PayPal, FPS, PayMe, and legacy manual provider values remain
  represented by the typed contracts;
- an AlipayHK request stores `provider: "cod"`, invokes only the COD checkout
  provider with the parsed experience, and returns `provider: "cod"`.

## Typecheck and diff verification

- `bun run typecheck` cannot locate `tsc` because this isolated worktree has no
  local `node_modules/.bin`; it exits with `bun: command not found: tsc`.
- The same configured check passed with the repository's installed compiler:
  `bun ../../node_modules/typescript/bin/tsc --noEmit --pretty false`
  (`typecheck-exit=0`).
- `git diff --check` passed (`diff-check-exit=0`).

## Self-review

- The donor-facing `alipayhk` value is never reused as a stored payment or
  webhook provider. It maps to `cod` before the payment row is written.
- The migration preserves all legacy check values and does not contain a
  `delete` statement for donation, payment, or webhook event data.
- Checkout experience is validated at request parsing and is deliberately not
  persisted.
- No credentials, supplied identifiers, secret material, or live provider calls
  were added.

## Concerns

1. The isolated worktree lacks its own dependency bin directory, so the package
   script form of typecheck remains environment-blocked even though the local
   repository TypeScript compiler completes successfully.
2. `createCodAlipayHkCheckout` currently rejects by design. The encrypted COD
   adapter task must replace that guarded placeholder before AlipayHK is exposed
   in a deployed donation flow.
