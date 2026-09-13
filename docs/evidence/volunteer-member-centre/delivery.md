# Volunteer member centre delivery — 2026-09-14

Approved full-centre design implemented on feat/volunteer-member-centre from main 0a0ddf5. No production data, policy publication, messages or deployment performed.

## Delivered

- Mobile-first HKSCDA centre with session browsing, my bookings and service records. Existing general event registration remains an expandable secondary journey; an empty generic registration form is no longer shown without an activity. Group/reschedule, token-status and independent internship routes preserved.
- Progressive email/code login, edit email, resend cooldown, focused errors, autocomplete and challenge reset. Supabase verifies actual sessions; verified email remains distinct from staff-verified volunteer profile.
- First profile claim and pending verification remain available when no sessions are published. Authenticated profile and history errors remain errors, never fabricated new identities or zero history.
- Canonical shelter, Hong Kong date and keyword filters; session cards show full start/end dates, location, live capacity/window summaries. Confirmation retains role/remarks/current terms and authoritative atomic/idempotent policy commands.
- Booking outcome clearly distinguishes approved, pending and waitlisted. Personal records include minimal activity metadata even for past/unpublished sessions, read through actor-owned FK joins. Cancellation requires confirmation; rescheduling uses existing workflow.
- Service records distinguish booking status and verified attendance, show known history coverage/credentials, and disclose the 100-record display limit. No estimated hours or invented attendance.
- Unknown/load-failed and genuinely empty session feeds have different recovery states. Terms scrolling is keyboard-focusable; layout respects reduced motion and existing brand tokens.

## Verification

- Full isolated suite: **2,380 pass, 0 fail, 0 skip**, 7,745 assertions across 398 files.
- TypeScript and production build passed. Lint: 0 errors, existing React refresh warnings retained.
- [Browser evidence](browser.json): progressive OTP UI, actual API/DB profile claim and pending→verified transition, eligible session booking, full activity metadata, service record and cancellation confirmation; mail failure and unavailable/empty feed recovery.
- 390px and 1440px: no horizontal overflow; no serious/critical axe violations; no page errors.
- OTP send/verify were intercepted in the browser with a valid isolated synthetic session. No email was sent; this is not a live mail delivery or redirect-provider configuration test.
- Repository tests cover actor filtering, past/unpublished metadata, stripped internal fields and errors. Component/helper tests cover history wording, local dates, end times and empty/loading states.
- Independent review found missing end times; fixed and reviewed again with no remaining serious findings. Existing policy capacity/concurrency tests remain green.

## Review and activation

Local preview: http://127.0.0.1:56336/volunteer. Review branch automatic Vercel deployment disabled. No migration is added. Production must already have the previously approved volunteer policy schema. Administrators still need to publish actual policies/sessions; the centre does not create them automatically.

Merge/deploy require existing explicit release approval. Original checkout edits and the unrelated untracked production-repair-20260914.md note were preserved. Raw screenshots remain local under the existing evidence ignore convention; their hashes are recorded alongside this document.
