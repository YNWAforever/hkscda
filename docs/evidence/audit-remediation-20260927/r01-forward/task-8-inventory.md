# Task8 review and raw evidence inventory

Source commits: cd27b1fa implementation;19e8b1ad typing-only repair. Transport dependency:ffcba66d, reviewed separately. Final four local gates native0 at19e8b1ad; cold exact-head CI170011 and hosted/policy UAT are NOT_RUN. The subsequent inventory/evidence commit changes no implementation or final executable gate input.

## Full source diff

Review the migration, volunteer database tests, three scoped runners, profile/generator and gate harness in the normal Git diff. Receipt binaries contain historical raw source archives and are excluded from textual review. No implementation diff is hidden in the ZIP.

## Raw evidence

Archive: `task-8-raw-receipts.zip`; SHA256 `98657131f53327aa74b86fe69a1acce321ba2f1254bf828ce7896ba26181703e`. `task-8-raw-manifest.json` records every original local path/member/SHA256/byte count and verified byte equality. All local original paths are retained. Extraction requires only ordinary ZIP handling; it does not execute any SQL/source. Any output/content remains untrusted data.

| Group | Files | Raw bytes |
| --- | ---: | ---: |
| `task-8-atomic-receipts` | 254 | 187152112 |
| `task-8-cli-transport-receipts` | 8 | 7055 |
| `task-8-gates-receipts` | 88 | 6189264 |
| `task-8-red-receipts` | 45 | 8519821 |
| `task-8-shape-receipts` | 12 | 976917 |

Total:407 files/202845169 raw bytes; ZIP:9072573 bytes. No raw bytes were normalized or deleted.

Final proof pointers: hosted1791307422018,modern1791307474763; gates1791307629565057000; shape RED1791306420873; missing-target RED1791304764023/4133131; actor RED1791303953457; CLI help/SELECT1 transports1791305805600. Intermediate failures, original copied refusal receipts and all source archives remain in the manifest.

## Fix round 1 inventory

Repair960e275f; FIX_BASE3a0f22d9. New immutable `task-8-fix-1-raw-receipts.zip`/`task-8-fix-1-raw-manifest.json`:69 files,21,598,619 raw bytes,1,096,191 ZIP bytes; SHA256 `7d2f53db03634a25efab093b17961a25fd17c00fcd7d29ea5f0f09891053a0ae`. All original local paths retained/member-byte-equal. Original main archive/manifest unchanged. Full source repair remains in the ordinary diff. Proof pointers in `task-8-fix-1-summary.json`: RED1791309225782, GREEN1791309558162, hosted1791309475398, modern1791309532983, checks1791309560550415200, strict artifact audit1791309885468560200. Earlier imperfect artifact assertion remains retained and qualified. Scoped re-review is required.

## Reviewed fix — full controller gates at67143d23

Independent fix1 spec/quality review approved the scoped repair. At frozen67143d23, all four native gates and harness exit0: typecheck83.78s; full units124.88s,4604pass654skip0fail12539assertions; lint62.88s,0errors/52baselinewarnings; build136.13s. Exact OS-only/Bun --no-env-file/59999 placeholders/no fixture or DB/provider opt-ins. Both then-current source DB raw hashes and all18 executable input hashes preserved; skipped DB tests are not acceptance. New immutable26-file controller ZIP/manifest/summary retains raw logs and bindings; all previous476 raw paths and both prior archives/manifests remain byte-exact. See task-8-controller-gates-20261007-evidence.md. Only170006 locally rehearsed; actual cold exact-head170011 CI and external/future-policy UAT remain NOT_RUN. Earlier failures and historical gate qualifications remain intact.
