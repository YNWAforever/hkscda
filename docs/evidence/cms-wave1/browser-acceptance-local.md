# CMS actual local browser acceptance

**Final result: PASS at 2026-09-05T19:20:39Z.** The complete real Auth/UI/API/Storage journey passed all11 scenario checks with zero browser JavaScript errors. The final run exited0 and removed its exact synthetic fixtures. Database/API were then released to root for the separate restore rehearsal. See `browser/result.json`, `browser/restored-draft.png`, and `browser/published-story.png`. Earlier failures below explain the red/green corrections and are superseded by this executed result.

Target: isolated Vite `http://127.0.0.1:55430`, Supabase API/Storage `http://127.0.0.1:55321`, disposable database port55322. The server child environment contains only Windows runtime variables and the local Supabase browser/server variables, with an empty Vite env directory. No email/payment provider credentials. Synthetic staff/Auth fixtures and passwords remain in process memory; cleanup removes exact owned objects, content, audit, admin and Auth records.

## Login finding and correction

The first two real browser attempts remained on `/admin/login`; one observed native GET navigation to `/admin/login?` before hydration. Server markup enabled the submit button before React attached handlers. Inputs have no name attributes, and the observed native query contained no credentials. Root authorized a scoped login correction: stable `useSyncExternalStore` server/initial hydration snapshot false disables login and password-reset submit until the mounted client is ready.

Red: login SSR assertion 2 pass, 1 fail (submit lacked disabled). Green: 3 pass, 7 assertions. Root independently reviewed the change without another source blocker. A third browser attempt confirmed React form properties but still stayed on login, so that is not a successful authenticated browser acceptance. All three runs cleaned their synthetic fixtures. The harness now waits for enabled submit before filling and captures only auth status codes and visible errors, to distinguish controlled-input hydration timing from real authentication failure.

## Initial pending checkpoint (superseded)

CMS end-to-end browser acceptance is pending. `scripts/verify-content-publishing.mjs` covers versioned profile/main saves, private upload/finalize retry, selected revision publication/public read, two-editor conflict with dirty preservation, failed reload, internal media exclusion, old public copy retention, actual short signed-URL expiry, and restore as new draft. Planned coverage is not execution evidence. `browser/result.json` records the most recent executed attempt.

Actual SQL/Storage acceptance is recorded separately in `database-storage-acceptance-local.md`; the browser login blocker does not invalidate those executed transactions, and those transactions do not substitute for this user journey.

## Isolated transport prerequisite

Both CMS and independent CRM browser attempts failed because production document CSP permits hosted HTTPS Supabase but excludes loopback HTTP55321. Node Auth succeeded for the same disposable account. A read-only browser GET to local Auth settings returned Failed to fetch. The transformed browser module contained the correct local API and anon key and did not contain the service key (boolean-only verification). Root authorized the harness to append ONLY the exact API origin `http://127.0.0.1:55321` to document `connect-src` and `img-src`, guarded by exact app55430/API55321 targets. It preserves every other directive and fetches real document/API responses. This isolated transport accommodation is not production CSP acceptance. Actual JavaScript-disabled browser verifies post-fix login submit disabled:true; focused login lint exit0.

Chromium also required `local-network-access` permission scoped to app origin55430. CRM independently verified a read-only Auth health request returned200 after granting that origin-scoped permission together with the narrow CSP adjustment. The CMS harness applies both accommodations only behind its exact-port guard. Neither changes application source or production network policy.

## Actual protected navigation failure

After both local transport accommodations, browser authentication returned200. Direct navigation to `/admin/content/:id` then redirected back to `/admin/login`, and the editor never became available. The harness preserves document redirects (`route.fetch({maxRedirects:0})`), so this result is distinct from a login credential failure. All synthetic fixtures were cleaned. CRM independently observed protected-route hydration mismatches and owns root-authorized `ssr:false` on existing guarded admin route boundaries; CMS waits for that source repair before retrying.

## Final executed acceptance

The final actual browser run covers all11 checks in `browser/result.json`: real staff login and direct editor navigation; dirty profile guard/versioned save; private upload with injected finalization503 followed by one-session retry; explicit saved revision publication and anonymous public rendering; draft save preserving published content; two editors producing real409 with retained input and comparison; failed reload and cancelled discard preserving input followed by successful recovery; signed private preview denied after an actual2100ms expiry wait; internal update/media excluded through publication while old public copy stays reachable; and selected revision comparison/restore producing a draft without moving the public pointer.

Two subsequent harness-only mismatches were corrected without application changes: creation HTTP201 is a successful2xx response (expected409/503 remain exact), and implicit select labels include option text, so semantic `getByLabel` matching does not demand exact text. The shared Field wraps its select correctly; no positional selector or accessibility bypass was used.

The final fixture cleanup removed private uploads, prepared public copies, publication prepare/cache rows, the content item and cascading revisions/children, actor audit rows, admin row, and Auth user. Credentials were never persisted. Final screenshots contain synthetic content only. No production migration, object mutation, push, or deployment occurred.
