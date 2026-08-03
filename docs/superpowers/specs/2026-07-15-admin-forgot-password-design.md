# Admin Forgot Password Flow

Date: 2026-07-15
Status: Approved design
Branch: `codex/admin-forgot-password`

## Purpose

Add a complete password-recovery flow for HKSCDA administrators starting from `/admin/login`. An administrator who no longer knows their password must be able to request a recovery email, follow the one-time link, set a new password, and return to the admin login without staff intervention.

## Product Decisions

1. The login page receives a visible `忘記密碼？` / `Forgot password?` action beside the password field.
2. Requesting a reset happens in the login card so the administrator keeps the email they already entered and can return to sign-in without changing routes.
3. The recovery email redirects to a dedicated `/admin/reset-password` page.
4. Both request and password-update states use the existing `AdminLanguageProvider` and language toggle.
5. A successful request always shows a neutral message, regardless of whether the email belongs to an account. This avoids exposing the administrator account list.
6. Supabase Auth sends the recovery email. No service-role key, database change, or custom Resend email is introduced.
7. A new password must contain at least eight characters and match its confirmation field before it is submitted.

## Architecture

### Shared auth-flow module

Create a small client-side module under `src/lib/admin/` that owns password-recovery operations and validation:

- Build the recovery redirect URL from `window.location.origin` and `/admin/reset-password`.
- Request a recovery email with `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
- Validate new-password length and confirmation.
- Update the authenticated recovery user with `supabase.auth.updateUser({ password })`.

The module accepts the minimum Supabase Auth interface it needs. This keeps provider calls testable without coupling tests to the singleton client.

### Login page

Extend `src/routes/admin/login.tsx` with two local modes:

- Sign-in mode keeps the current email/password form.
- Recovery-request mode shows the email field, explanatory copy, submit action, neutral success state, and a return-to-login action.

The reset action is a text button, not a new navigation item. Existing sign-in behavior remains unchanged.

### Reset-password route

Add `src/routes/admin/reset-password.tsx`. The route:

- Shows a loading state while Supabase restores the recovery session.
- Accepts both the documented `PASSWORD_RECOVERY` auth event and an already-restored valid session.
- Shows new-password and confirmation inputs when a session is available.
- Calls `updateUser` after client validation.
- Shows an expired/invalid-link state when no session can be restored.
- Returns the administrator to `/admin/login` after a successful password change.

TanStack Router will generate the route-tree entry during the normal build process.

## Data Flow

1. Administrator selects `忘記密碼？` / `Forgot password?` on `/admin/login`.
2. The browser calls `resetPasswordForEmail` with the entered email and the production-origin reset route.
3. Supabase sends its configured recovery email.
4. The administrator follows the one-time link to `/admin/reset-password` and Supabase restores a temporary authenticated session.
5. The page validates the two password fields and calls `updateUser`.
6. On success, the page signs out the temporary session and sends the administrator back to login with a success message.

## User-Facing Copy

The following concepts are added to `adminCopy.login` in Chinese and English:

- Forgot password
- Reset-password instructions
- Send reset link / sending state
- Neutral email-sent confirmation
- Return to login
- New password and confirm password
- Update password / updating state
- Password mismatch and minimum-length errors
- Invalid or expired recovery link
- Password-updated confirmation
- Generic provider failure

The Chinese version uses traditional Chinese suitable for Hong Kong. Error messages do not expose whether an email exists.

## Error Handling and Security

- Disable submit controls while a provider request is in flight.
- Trim and normalize the email before requesting a reset.
- Never display raw Supabase error messages on these public unauthenticated forms.
- Keep the request success response identical for known and unknown emails.
- Require a valid Supabase session before `updateUser` can succeed.
- Sign out the temporary recovery session after a successful password update.
- Do not add service-role credentials or privileged server endpoints.
- Treat expired links, missing sessions, provider failures, and password validation as separate UI states.

## Production Configuration

Supabase Auth URL Configuration must allow:

`https://hkscda.vercel.app/admin/reset-password`

Local development may also allow the matching localhost reset route. The deployed flow is not complete until the production redirect URL is present in the project's Supabase Redirect URLs list.

## Testing

Use test-driven development for the auth-flow module and route behavior:

- Request uses a normalized email and the correct reset redirect URL.
- Provider errors map to safe public copy.
- Request success remains neutral.
- Password validation rejects short and mismatched values.
- Password update calls `updateUser` only after validation.
- Login page exposes the forgot-password action in both languages.
- Reset route renders valid-session, invalid-link, success, and error states.
- Existing admin login tests and auth-access tests remain green.
- Production build completes and generates the reset route.

## Out of Scope

- Administrator self-service email changes.
- Custom recovery email templates or custom SMTP/Resend delivery.
- Database migrations.
- Password history, MFA enrollment, or organization-wide password policy changes.
- Resetting another administrator's password from Access Management.
