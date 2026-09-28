# T06 / R11 synthetic receipt benchmark, 2026-09-28 HKT

Status: **partial**. The Hong Kong receipt date and process-level single-flight/retryable font-byte loader are already implemented in focused PR #138. This rehearsal measures the remaining font cost; it does not change receipt code or close the 4.34 MB PDF-size/CPU subitem.

Both versions ran sequentially on the same Windows x64 host with Bun 1.3.14, the same local `NotoSansHK-Regular.ttf`, synthetic donor `陳美琪 Ada Chan 王小明`, HK$200, Hong Kong date 1/1/2027, and a mocked local font `fetch`. Before: pre-T06 source `97280b1fd8670045fc62b5c33530065c0e7aaede` (#137). After: combined source freeze `9130cb846d7a876e0c867c1dddd1fcc33aa0c6ce` (includes #138). The same benchmark script generated 100 documents per run; the CPU follow-up added only `process.cpuUsage` counters to an ignored copy of that script. No real donor, provider, email, payment, production DB or network font transfer was used.

| 100-document run | Source | Wall ms | User CPU ms | System CPU ms | Font fetches | First PDF bytes | Total PDF bytes |
|---|---|---:|---:|---:|---:|---:|---:|
| First before | `97280b1` | 67,189 | not measured | not measured | 100 | 4,338,655 | 433,865,420 |
| First after | `9130cb8` | 66,851 | not measured | not measured | 1 | 4,338,654 | 433,865,417 |
| CPU before | `97280b1` | 65,073 | 59,422 | 5,297 | 100 | 4,338,655 | 433,865,455 |
| CPU after | `9130cb8` | 67,821 | 58,297 | 6,141 | 1 | 4,338,654 | 433,865,422 |

The loader removes 99 repeated mock fetch calls per 100 receipts. The first paired wall result differs by only 338 ms; the second after run is 2,748 ms slower. Combined user+system CPU differs by 281 ms (64,719 before, 64,438 after). These runs do not establish a material PDF generation CPU or wall-time gain. The one-byte sample difference and approximately 4.34 MB document size confirm no meaningful size reduction. Do not set `subset: true`: current tests and source comments record missing CJK glyphs with that embed mode.

Poppler rendered each first-run sample as one A4 page. The before/after PNGs were byte-identical with SHA-256 `f2a5955ef9755bae31deb5fe8a56062792d36d38b598fea54c544e2a24ea5b1f`; visual inspection found no clipping or overlap in the synthetic name, amount, date or signature. `pdfplumber` extracted identical text from both PDFs, including `陳美琪`, `HK$200` and `1/1/2027`. `bun test --isolate src/lib/donations/receipt-pdf.server.test.ts src/lib/donations/receiptFont.server.test.ts` exited 0: six pass/19 assertions, including year-end Hong Kong date, an uncommon Han glyph, long mixed-script wrapping, shared font load and retry after failure.

The sample does not prove every rare glyph in a real donor name. A licensed smaller font, proven CJK-safe subsetting, or an accepted size exception remains needed before closing R11. Actual receipt delivery, hosted browser checks, representative production-size batch recovery and live resource limits are not-run. Existing successful payments must remain committed if PDF generation or delivery fails.
