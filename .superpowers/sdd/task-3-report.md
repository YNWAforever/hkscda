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

### Follow-up review RED/GREEN

The focused suite then failed as intended for two review regressions: an
injected request ID of `a` was accepted, and a gateway URL ending in
`#fragment` produced a malformed composed checkout URL.

The follow-up implementation requires an RFC-4122-shaped request UUID and
rejects any hosted URL with a fragment before appending the preserved order
string. The focused command is now green again:

```text
bun test src/lib/donations/cod-client.server.test.ts src/lib/donations/cod-provider.server.test.ts src/lib/donations/providers.server.test.ts
18 pass, 0 fail
```

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
- The isolated worktree has no local `tsc`, so verification used the existing
  repository dependency fallback without installing anything:

  ```text
  C:\\Users\\laich\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe C:\\Users\\laich\\Documents\\HKCSDA\\HKCSDA\\hkscda\\node_modules\\typescript\\bin\\tsc --noEmit
  ```

  This completed successfully with no diagnostics.
- The same existing dependency fallback ran Prettier `--check` successfully
  for all six Task 3 source and test files.

## Concerns

- No live COD endpoint, provider credentials, or sandbox request was used.
- No known Task 3 verification blockers remain.
