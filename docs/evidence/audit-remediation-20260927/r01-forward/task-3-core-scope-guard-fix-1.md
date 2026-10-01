# R01 guard review: Fix Round 1

Parent: `63a705318d8ca9a92e3223149f677275cd3f5b1c`. Independent scoped review found one Important: the whitespace-dependent dynamic execution fence refused `EXECUTE 'SELECT 1'` but accepted `EXECUTE('SELECT 1')` and `EXECUTE/*comment*/'SELECT 1'`. Both the global function classification and the own-scope exception used this fence.

Watched focused RED: `bun test supabase/rls-tests/helpers/productionSchemaClone.test.ts --timeout 30000`, exit 1, 32 pass / 1 fail / 331 assertions. The minimal fix rejects any standalone `EXECUTE` keyword conservatively. It covers parenthesized, block-comment, newline and line-comment spellings under both absent and exact own config, without parsing SQL or adding an allowlist. Same command GREEN: exit 0, 33 pass / 0 fail / 338 assertions.

All prior native, operator, transitive callee, config and network checks remain. No schema, grants, roles, source data or production actions changed. Original guard receipts retain their original executable hashes; this fix does not relabel those runs. Actual new helper acceptance is bound by subsequent hosted/modern trigger and Task 3 composition rehearsals, including real animal generated expressions. Full composition gates and scoped re-review remain separate.

The adjacent binding packages actual SHA256/Git blobs and full-log hashes. No DB process was active during this edit or pure test run. Standalone actual guard DB runs were not repeated: the actual path is unchanged and the new conservative fence only closes the independently reproduced spelling risk. Shared trigger and eight-object application changes are excluded from this commit.
