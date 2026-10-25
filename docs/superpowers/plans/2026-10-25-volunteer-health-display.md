# Volunteer job diagnostic display

Original requirement Step 3.4 asks for useful zh-HK health messages, timestamps and an error code. This continuation uses only existing runtime-run result metadata; it adds no schema, role permission or execution path.

- [x] Prove that safe diagnostic codes/stages are projected for admin only, and raw result/provider text never reaches a response.
- [x] Keep unknown diagnostics unknown, preserve degraded/healthy semantics, and omit old resolved errors when healthy.
- [x] Add last-success/last-failure labels and a truthful repeated-failure/stale explanation, with bilingual copy; show only the sanitized diagnostic fields.
- [x] Verify actual overview authorization selects result metadata only for admin; staff retains the existing public health fields.
- [x] Run related unit/browser tests and relevant final gates; preserve the previous commits and evidence.

No production DB/Auth, real job runs, external sends, schema changes, denied GitHub retries or deployment to an unverified backend. Hourly admin rerun remains a separate required but blocked audited-command design. Hosted root cause remains unproven.

Local verification: 7,304 pass / 727 skip / 0 fail (8,031 tests, 840 files), typecheck and changed lint pass without warnings. The full run preceded only the final break-all class for long technical codes; that final styling change passed the 19 related render tests, final build and real built-CSS layout checks at 320/390/1280px. Initial document-width-only layout checking missed local text overflow; the strengthened paragraph-width check failed at 322px inside 254px and passed after the fix. No product logic changed after the full suite. Review had no Critical/Important finding; suggested UI branches are now covered.
