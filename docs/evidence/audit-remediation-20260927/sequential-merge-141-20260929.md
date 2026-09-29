# PR #141 sequential verification — 2026-09-29

Tested source tree f19dbbf9ce90e6966c2802ddf927ee126c97c735 includes updated predecessor #140 at 964255a. This slice requires no database migration.

- `bun test --isolate`, local checkout DB 57322 and RLS API 52321: exit 0; 2837 pass, 83 skip, 0 fail, 8666 assertions across 479 files.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0; 53 warnings, zero errors.
- `bun run build` using loopback fixture 54329 and placeholder credentials: exit 0. Generated route tree unchanged.
- `node scripts/verify-draft-mobile.mjs` against built preview 127.0.0.1:5183 and synthetic fixture 54329: exit 0. 390x844 sponsorship: default-off opt-in, v2 storage, explicit resume, opt-out clears; adoption: keyboard opt-in, v2 storage, photo re-selection, opt-out clears. Both report errors: []. Existing draft-qa screenshot files were refreshed; one PNG changed. No final submission, upload, provider action or email.

The last legacy draft parser bridge is removed; both forms now use explicit opt-in, expiry and safe field selection. Full successful real-content journeys and provider sandbox UAT remain not-run. Shared-device guidance remains to clear drafts after use.

#138 merged as df6e7c8b2f0fba904ab6b8ea50dbbd63bd67b4a1 after five green CI jobs (36506641915); production dpl_DhbVcNCawsvRPwFrWp83w2hARFds is READY. Its post-merge CI is still pending at this record. #139 and #140 are awaiting their sequential merge gates.

This new #141 head needs its own remote CI before merging after #140. Rollback is code-only and restores the old automatic draft behavior, which cannot safely read v2 envelopes. Preserve approved payment disablement and disabled delivery scheduling.
