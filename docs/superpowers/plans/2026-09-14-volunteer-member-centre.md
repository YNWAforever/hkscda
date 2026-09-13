# Volunteer Member Centre Implementation Plan

> Use superpowers:subagent-driven-development for independent implementation and review; continuous execution is authorized.

**Goal:** Implement the approved full volunteer centre.
**Architecture:** Preserve existing policy command orchestration, extract auth/session/record presentation; enrich actor-owned history in the server repository.
**Tech Stack:** Existing TanStack Start, React, TypeScript, Supabase, Bun.

## Global constraints

No new auth provider, no policy bypass, no production mutation or live messages. Preserve canonical IDs, immutable attendance, brand tokens, legacy entry points and unrelated work.

- [x] Task 1: Progressive email sign-in. Update VerifiedEmailSignIn with tests, resend/edit/busy/error states and CAPTCHA reset; reuse it from PolicySignup. Agent owns auth component only.
- [x] Task 2: Actor-scoped history metadata. Extend booking types/repository and tests; attach minimal owned activity metadata to all retained registrations, not public future feed. Agent owns backend files only.
- [x] Task 3: Member shell and session browsing. Parent owns PolicySignup, extracted presentation helpers, volunteer route and scoped CSS. Preserve existing command handlers, add section navigation, session cards/filters and confirmation feedback.
- [x] Task 4: Bookings and service records. Parent uses enriched fields for date/status/attendance, cancel confirmation and existing reschedule link. Replace duplicate legacy form prominence with explicit secondary section.
- [x] Task 5: Review integration, run targeted/full isolated tests, typecheck/lint/build and synthetic browser role/mobile checks. Fix findings, write evidence and commit explicit paths. Keep release gated.
