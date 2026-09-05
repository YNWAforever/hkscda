# Authenticated CRM browser acceptance

Target: isolated app `http://127.0.0.1:55430`, Supabase API `http://127.0.0.1:55321`, disposable database55322. Script: `scripts/verify-crm-authenticated.mjs`. Explicit `CRM_TEST_ALLOW_LOCAL_FIXTURES=1` required. Credentials are generated in memory; local Supabase keys read from the ignored bootstrap output. No provider credentials are present in the app server.

The browser requires two disclosed local transport accommodations: document response CSP appends only the exact API origin to `connect-src`/`img-src`; Playwright grants `local-network-access` only to the exact app origin. All other CSP directives remain intact; no authentication/API/database responses are mocked. Production CSP already permits the hosted Supabase HTTPS domain.

Initial real runs exposed local CSP and Chromium loopback permission restrictions before authentication. The same synthetic credentials succeeded against the local Auth API outside the browser. A read-only browser Auth health request returned200 after the scoped prerequisites. Failed runs cleaned their exact synthetic fixtures. Captured red logs retain sanitized status/error diagnostics.

The journey creates and edits a synthetic supporter through actual treasurer UI, persists consent, creates a succeeded manual gift without receipt issuance, retries acknowledgement delivery in the dialog and after page reload, downloads filtered supporter/donation CSVs, and checks staff page/API denial. No receipt PDF or sequence is allocated in this journey; receipt allocation has separate database acceptance. Provider absence must leave acknowledgement delivery retryable, with one donation/payment and no sent message.

Final result and completion status are recorded in `result.json` by the completed run. Do not treat this preparation note or earlier login failure as a passing journey.

SSR repair evidence: the fourth CRM run passed all seven named journey checks but failed the page-error gate. Its initial document-header adapter followed server redirects internally; this rendered the returned login HTML at the protected URL and exposed five hydration mismatches. Those five errors are **not an unqualified production error count**. The CMS harness independently preserved redirects and reproduced the actual protected deep-link redirect to login after successful browser authentication. Both originate in running a localStorage session guard during SSR. The adapter now uses `maxRedirects: 0` so the green run must preserve real redirect semantics.

The focused repair adds `ssr: false` to the28 existing protected page routes with `beforeLoad`, leaving login/reset-password SSR and API authorization intact. The AST contract reads actual createFileRoute options: before repair it failed on all28; after repair2 tests/6 assertions pass. Full typecheck and admin route lint pass. Final browser acceptance remains gated until the rerun completes.

## Final result

Final run passed (exit0):7 actual browser/backend checks, zero page errors, with real redirects preserved. Direct protected navigation and reload remained authenticated. Manual gift delivery stayed retryable without provider credentials, and both retries retained exactly one donation/payment with no sent message. Filtered supporter/donation CSVs each contained exactly one synthetic data row. Staff page/API access was denied; mutation audits persisted. Exact synthetic supporter/finance/job/message/audit/admin/Auth cleanup completed. See `result.json`, `run.log`, and `gift-pending.png`.

Verification: route AST contract2pass/0fail/6assertions, full TypeScript check exit0, admin-route/newtest lint exit0. No production API, provider message, payment, receipt sequence, or storage asset was used by this CRM journey.
