# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** — do not open a public issue.

1. Open the repository's **Security** tab and choose **Report a vulnerability**
   (<https://github.com/YNWAforever/hkscda/security/advisories/new>). Private vulnerability
   reporting is enabled, so the report and the fix can be coordinated before disclosure.
2. Include the affected page, API route or component, reproduction steps, impact, and any
   relevant request/response fragments.
3. Redact production personal data (supporter, adopter, donor, volunteer or applicant records).
   Use placeholders; if a real record is essential to the report, describe its shape instead.
4. Keep the report private until a fix is released and a disclosure date is agreed.

We aim to acknowledge a report within **3 business days**, triage it, and agree a disclosure
timeline with the reporter. Good-faith reports are welcome; automated scanner output without a
working proof of concept is usually not actionable on its own.

## Scope

In scope:

- The public site (`https://hkscda.vercel.app`, and `hkscda.com` once the cutover completes) and
  its API routes.
- The admin back office, authentication, password recovery and session handling.
- The Supabase schema, migrations, RLS policies and database functions in `supabase/migrations/`.
- Payment, email and background-job integrations as configured in this repository.

Out of scope (unless a concrete impact is demonstrated):

- Missing security headers or other items already documented as accepted residual risk in
  `docs/` (for example `style-src 'unsafe-inline'`).
- Denial of service through bulk traffic, social engineering, and physical attacks.
- Vulnerabilities in third-party providers (Supabase, Vercel, Stripe, Cloudflare, Resend) —
  report those to the provider. If the configuration in this repository is what makes the
  issue exploitable, it is in scope.

## Controls already in place

- Every table has RLS enabled; admin data is reached through role-gated API routes backed by a
  service-role client, not by browser table access.
- Admin session tokens are held in `HttpOnly; Secure; SameSite=Strict` cookies by a bounded
  session BFF; the browser keeps only a short-lived in-memory access token.
- CSP: nonce-based `script-src` with `'strict-dynamic'`; Trusted Types in Report-Only to surface
  DOM-XSS sinks. `style-src 'unsafe-inline'` is the documented remaining gap.
- Public form endpoints are rate limited and Turnstile-gated; admin mutations are audited.
- Repository security features: secret scanning with push protection, Dependabot alerts and
  security updates, CodeQL default setup, and private vulnerability reporting are enabled. CI runs
  with a read-only token and actions pinned to commit SHAs.

## Safe harbour

We will not pursue legal action or report good-faith security research that follows this policy,
stays within scope, and does not access, modify, or exfiltrate real user data. If you are unsure
whether an action is allowed, ask first through the private report.
