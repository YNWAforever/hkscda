# Turnstile lifecycle and caller recovery (2026-09-06)

Isolated real React/browser fixture reproduced stale verified parent tokens after language rerender, unmount and remount. Expiry and explicit reset already cleared tokens. Authorized widget cleanup now clears the current parent token and callbacks from cancelled widgets cannot restore an old token or clear a newer token.

`node scripts/verify-turnstile-behavior.mjs` rebuilds only its isolated synthetic fixture from current source, binds numeric loopback, blocks non-loopback requests and stubs the provider. Seven scenarios pass: expiry, reset, language, removed verification callback, unmount, remount, and removed expiry/error callbacks preserving a fresh token. It waits for React state commits before checking values and rejects console/page errors. No real provider or submission.

`bun test --isolate src/components/site/turnstileCallerRecovery.test.ts src/components/site/turnstileScript.test.ts`: 6 pass, 42 assertions. The five recovery tests parse and execute each current production submit callback with stubbed transports, observe every state setter, verify one failed submission attempt, retained supplied values, token clearing, reset increment and visible-error state; setters for entered fields are forbidden. Covers donation, volunteer registration, group enquiry, sponsorship pledge and adoption application.

Limits: these callback fixtures do not establish full browser rendered-field preservation, wizard navigation, file selection, photos/proof upload partial failures, or actual Turnstile integration. Root's prior donation browser flow provides separate evidence; no full submit-failure browser flows for volunteer/group/sponsorship/adoption were executed by this subtask. No real posts. Targeted ESLint has zero errors and the existing widget mixed-export React refresh warning.
Final full typecheck exited 0 after the lifecycle fix and five caller regression tests.

## Rendered protected-form recovery follow-up

`node scripts/verify-protected-forms.mjs` now rebuilds a dedicated production-component fixture and runs Playwright on numeric loopback. The real GroupEnquiryForm, VolunteerPage, PledgeWizard and ApplicationWizard render with real React state, validation, widget and upload helpers. Only router context, shortlist and Supabase storage transport are replaced at bundle time; synthetic activity/target/submission responses are intercepted in the browser. External requests are blocked. No application build, credentials, real messages or real submissions.

Fresh run: all four scenarios pass, zero uncaught browser errors. Screenshots and `protected-forms-result.json` are beside this report.

- Group enquiry: organisation, contact, email, phone, participant count/profile, preferred dates and notes unchanged after first HTTP 503 and fresh-token second HTTP 503.
- Volunteer: contact fields, declared age, notes and consent controls unchanged after two failed submits; each retry requires a fresh token.
- Sponsorship: selected proof file, reference, amount/date, contact, notes and consent/terms retained when fake storage fails; no final pledge POST occurs until upload succeeds. After upload succeeds, HTTP 503 and another fresh-token retry retain the same rendered values/file. Two final attempts use different tokens.
- Adoption: valid text draft is restored, applicant name edited through the rendered input, and two real synthetic File objects selected. Fake storage fails on the second upload and no final application POST occurs. Navigating back to photos and contact then forward to review preserves both photo names and edited contact; widget remount requires fresh verification. Subsequent two HTTP 503 final attempts carry the edited name, both photos and different tokens.

Acceptance is rendered-state/file preservation and local retry behavior. It does not prove storage object cleanup, server-side idempotency, real provider acceptance, integration with a deployed router or schema, or survival of file selection across a full page refresh (the adoption UI explicitly says files must be reselected after refresh). No new production source changes were needed in this follow-up.
