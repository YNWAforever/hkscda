# Release slice 05 — Hong Kong receipt dates and font bytes (T06 / R10 / R11)

Branch `codex/audit-receipt-date-font-20260927`, stacked on draft PR #137. Base SHA `97280b1`. No production payment, email, receipt issue or content mutation was performed; all PDFs use synthetic data.

## Changes

- `formatReceiptDate` uses explicit `Asia/Hong_Kong` date parts. It fixes UTC/US runtime display at Hong Kong midnight and cross-year without changing the existing receipt-number tax-year allocation rule.
- The Noto Sans HK font is fetched once per process with a shared promise; failure clears the promise so later requests retry. Every PDF still creates its own `PDFDocument` and embeds its own font object. `subset:false` stays in place.
- `scripts/benchmark-receipts.ts` provides a reproducible 1–100 receipt synthetic benchmark and retains a sample PDF under `output/pdf/` for visual inspection.

## Verification

- Red baseline: with `TZ=UTC`, `toLocaleDateString("zh-HK")` rendered 26/9/2026 for the 27/9/2026 Hong Kong date. The new date test failed before implementation and passes after. Parallel font load and failure-retry tests failed before the module existed and pass after.
- Focused PDF/date/font suite: 6 pass, 0 fail, 19 expectations, exit 0. Supported rare Han `龘`, long mixed-script wrapping, Chinese signatory, one-page A4, midnight and year-end covered.
- Same-host 100-PDF benchmark: baseline 103,335 ms, 100 font fetches, 4,338,654-byte sample; after 104,233 ms, 1 fetch, 4,338,654-byte sample. No latency or file-size improvement claimed. Metrics and UTC-runtime before/after PNG renders are in `receipt-qa/`. Visual inspection found date corrected with no visible clipping. Bundled font lacks `𠮷` (U+20BB7); size and broader glyph coverage remain open.
- `bun run typecheck`: exit 0. `bun run lint`: exit 0 with 52 existing warnings. `bun run build`: exit 0. `bun test --isolate` against the dedicated loopback Supabase rehearsal: 2,822 pass, 86 skip, 0 fail across 477 files; exit 0. Remote CI: pending PR.

## Rollback and handoff

This code has no migration. Reverting the HKT formatter would reintroduce a wrong receipt date for non-Hong Kong runtimes; keep the date fix when changing the font strategy. PDF objects must never be cached across requests. A future font choice needs ownership/licensing approval and a rendered rare-glyph, 100-PDF, byte-size and memory rehearsal. Staff should verify receipt issue/void and numbering policy in the isolated sandbox before any release. The stacked financial schema and PR release gates still apply.
