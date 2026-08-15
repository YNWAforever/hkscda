# Task 3: COD encrypted client and AlipayHK provider adapter

## Scope delivered

- Added the server-only encrypted COD client with `create_order` and
  `refresh_transaction_status` operations.
- Added the AlipayHK checkout adapter, stable COD-safe order references,
  fixed bilingual subject, server-owned pending return URL, and documented
  WAP/PC2MOBILE hosted URL composition.
- Replaced the temporary COD checkout stub in the payment-provider factory.
- Restricted Stripe Checkout payment methods to cards.

## TDD evidence

### RED

The initial focused test run failed as intended because the requested modules
and Stripe payment-method export did not exist:

```text
Cannot find module './cod-client.server'
Cannot find module './cod-provider.server'
Export named 'stripeCheckoutPaymentMethodTypes' not found
```

### GREEN

After the smallest implementation, the focused command passed:

```text
bun test src/lib/donations/cod-client.server.test.ts src/lib/donations/cod-provider.server.test.ts src/lib/donations/providers.server.test.ts
16 pass, 0 fail
```

The suite covers encrypted outgoing create/status requests, protocol fields,
AES-decrypted responses, all documented status values, COD business and HTTP
errors, malformed envelopes/JSON, timeout classification, no automatic retry,
stable order references, WAP/PC2MOBILE URL composition, HTTPS enforcement,
and Stripe's card-only regression.

## Files changed

- `src/lib/donations/cod-client.server.ts`
- `src/lib/donations/cod-client.server.test.ts`
- `src/lib/donations/cod-provider.server.ts`
- `src/lib/donations/cod-provider.server.test.ts`
- `src/lib/donations/providers.server.ts`
- `src/lib/donations/providers.server.test.ts`

## Verification and review

- `git diff --check` passed.
- Secret scan of the task files found no supplied merchant/segment IDs, PEM
  private-key blocks, AES secret values, or logging calls.
- `bun run typecheck` and `bun x --no-install tsc --noEmit` could not run
  because this isolated worktree has no local `tsc` binary. No dependency was
  installed; the coordinator should rerun typecheck in a checkout with the
  existing project dependencies before merge.

## Concerns

- No live COD endpoint, provider credentials, or sandbox request was used.
- The remaining typecheck is an environment verification gate, not a known
  source failure.
