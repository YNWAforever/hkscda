## Catalog projection review — 2026-10-01

The original #170 pre/postflight receipts retain their actual fields and timestamps. Their338 prior function comparisons cover body hash, owner, config, return/signature/volatility and the captured PUBLIC/anon/authenticated/service-role EXECUTE flags. Scoped old table comparisons cover columns, constraints, triggers, RLS enabled and the captured table/column effective privileges, including MAINTAIN. Seven exact row-group hashes and empty new operation/result tables were compared.

Full normalized ACL entries/grant options, FORCE RLS and policy definitions were not included in that pre-170 projection. Their preservation is not retrospectively certified by a later read. Source SQL is the exact approved hash and alters only its named new objects. The independent review found this verification projection gap; remaining un-applied scopes will use the stronger pre/postflight projection including full ACLs and policies, plus index table/key/predicate assertions. Existing raw results are not relabelled or replaced; provider/hosted UAT remains not-run.

## Subsequent reviewed verification

#172/#173/#175 actually used the stronger projection, including normalized ACL grantors/options, FORCE RLS and policy definitions for the specified existing business tables and new objects. Index comparison preserves quoted literal/identifier case, casts and boolean grouping; only whitespace outside quoted tokens is ignored. Negative probes distinguish `pending` from `PENDING` and different boolean grouping. This does not certify unrelated schemas or behavioral/provider UAT.

## #178 inherited REFERENCES boundary

The actual pre-178 supporter baseline has authenticated table REFERENCES=true. Exact approved `20260928120000_crm_assignment_bulk.sql`, canonical SHA256 `941b203c92e4a4fb163917a230008d6b8d19161927916e406c8ef668a8c42f09`, revokes only client table INSERT/UPDATE and restores those privileges on the existing11 columns. The new owner column has no explicit client column grants: client INSERT/UPDATE is denied; inherited table REFERENCES is preserved. The checker originally incorrectly demanded REFERENCES=false. A metadata-only AST regression executing its actual branch failed(exit1), then passed(exit0) after requiring REFERENCES to equal the original table flag, with denied I/U and REFERENCES-drift negative probes. No production SQL was changed for this correction; #178 execution/acceptance is separately recorded after its turn.

Authenticated INSERT/UPDATE on the owner column are denied. Existing table-level REFERENCES remains inherited; no new REFERENCES grant is added. Earlier draft SHA256 `f848a5a3b955178b54c864cabd8611ada12ac63b9cbafba7b2eef8c9731f4297` matches commit `79838107c738854a28ac5a977b0e9fa6c3c6f5c2` dated `2026-09-30T10:03:05+08:00`. It is historical draft evidence, not the currently approved941b execution file.
