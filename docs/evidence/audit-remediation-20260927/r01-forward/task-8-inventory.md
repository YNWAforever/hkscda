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
