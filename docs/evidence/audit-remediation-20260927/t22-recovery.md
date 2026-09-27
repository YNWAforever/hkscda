# T22 / CRM-01 recovery slice

Draft PR #156, source 3b5941b2b37860f0cfdc33cfe20a8c9072e19346, stacked on #155. Code-complete for recovery only; CRM-01 remains partial. No schema migration, deployment or operational activation.

The existing Supabase Auth email OTP is used instead of introducing a second token store. The public recovery API checks bounded JSON, a server-side Turnstile challenge, and fail-closed production Upstash limits for hashed client IP and normalized email. Any valid email returns the same 202/no-store body. Provider errors are logged without an email address and retain the generic response. The page accepts an email code or Auth magic-link session and exposes no records. No membership lookup or client-supplied supporter ID occurs in this PR.

Local Supabase config now specifies 900-second OTP expiry. Hosted Auth expiry and redirect allowlist are separate release checks; the local file is not proof of production configuration. OTP replay/expiry and email delivery in a provider sandbox or email test sink are not-run because the dedicated disposable stack has no mail sink. No real email was sent.

Red tests first failed for missing service, route and UI. Focused supporter/route tests: 9 pass, 4 gated skips. Full isolated suite: 2,836 pass, 87 skip, 0 fail, 8,713 assertions. Typecheck, lint, build each exit 0; lint emitted 52 existing warnings. The preceding full-suite attempt had one CI fixture HTTP test timeout under load, fixed on #155 by extending that test timeout to 20 seconds; the full suite then passed.

Next PR must verify the bearer token against Supabase Auth on each read, reject banned/unconfirmed identities, resolve only authoritative links, return bounded summaries and signed receipt access, and clear local query cache on sign-out. Historical records with uncertain identity remain staff-assisted. No production notification, preview or main merge is authorized.
