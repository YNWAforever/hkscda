# PR #143 sequential verification — 2026-09-29

Tested merge source 78c520f includes predecessor #142 at aaf9bce and retains this PR's CMS unsaved-change guard. Resolved only the task-progress documentation conflict by retaining both completed slices. No database migration is introduced by #143.

- `bun test --isolate`, local DB 57322 and RLS API 52321: exit 0; 2852 pass, 83 skip, 0 fail, 8705 assertions across 483 files.
- `bun run typecheck`: exit 0.
- `bun run lint`: exit 0; 53 warnings, zero errors.
- `bun run build` against fixture 127.0.0.1:54329 with placeholder keys: exit 0; route tree unchanged.
- `node scripts/verify-adoption-unsaved.mjs`, synthetic Vite fixture 127.0.0.1:56541, 390x844 Chromium: exit 0. Tab/route cancel, failed save, successful save, 409 comparison, discard latest server version and keyboard Escape. Staff API responses are intercepted; no real admin mutation or content publication occurred. Original failure reproduction is retained in t10-cms-unsaved.md.

Fresh remote CI must pass before merging in order after #142. #142's production migration approval and approved terms publication remain separate gates. This PR does not authorize either. Authenticated staff UAT against a real test identity remains not-run. Rollback is code-only and restores the old unsaved-change loss risk.
