# PR #151 sequential verification — 2026-09-30 (Hong Kong)

Integrated checkout e3f8e1782ccd263c4e940c85f2c2d0e38fe1dbc8 incorporates repaired #150 ce1242a1b91d2de9c19861a833308d981410b45d. No merge conflicts or new migration. Historical evidence and screenshots are preserved; new screenshots use t16-*-sequential-* names.

## Reproduced repair

The coverage read checked total count against its requested maximum but did not check returned rows against count. A lower PostgREST row cap could therefore produce incomplete coverage. Two synthetic regressions (policy and activity result truncation) failed: 2 pass / 2 fail, exit 1. The read now rejects any count/row-length mismatch, preserving the existing handler behavior of unknown coverage. Focused coverage/API/empty-state suites: 17 pass / 0 fail / 32 assertions, exit 0.

## Actual current verification

- bun test --isolate --timeout 30000, loopback API 52321 unavailable and no DB URL configured: exit 0, 2856 pass / 150 skip / 0 fail, 8773 assertions, 495 files, 27.47 seconds. Local Docker is blocked by WSL startup timeout (see #150 record). Skipped DB scenarios are not current passes; fresh remote isolated DB/RLS CI remains a merge gate.
- bun run typecheck exit 0; bun run lint exit 0 (52 warnings); bun run build exit 0 with synthetic keys and loopback 54329. Generated route tree unchanged.
- node scripts/verify-volunteer-coverage.mjs with the committed volunteer-coverage.vite.ts loopback fixture on 56548: exit 0. Public and staff actual components at 390/768/1366 widths, 200% CSS zoom at 768; zero browser errors and zero horizontal overflow. Keyboard search and Enter-to-clear, retry action and existing email link verified. All API responses use synthetic data. Fixture server stopped afterward. These are component journeys, not real-role full-route UAT.
- Production read-only catalog: volunteer_policy_version and volunteer_activity plus every selected column exist. No session or policy row was changed, generated, approved or published.

Rollback reverts application code only. The display cannot authorize bookings or publish sessions. Approved live timetable/capacity/newcomer quota and real volunteer/staff identity UAT remain external gates. Current production payments and new notification scheduling remain disabled.

## Predecessor

#149 merged as 020e03eeb1b7a54cce908babc5ec3bd271d370a5; deployment dpl_EKYWWZHRiqAuZyuZvBD2FYffGk9M READY. #149 main CI 36598019572 and #150 PR CI 36598202959 are pending final jobs at this observation. No downstream merge occurs before all five jobs and steps are green.
