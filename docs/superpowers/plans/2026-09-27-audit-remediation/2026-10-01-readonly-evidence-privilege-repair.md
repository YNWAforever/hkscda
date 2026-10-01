# R01 implementation record: inherited readonly-table privileges

Implemented source `aca5822a124521d9e6acc94b171600ac344e9b97` from released main07e4c881. Production-default ACL modeling reproduced direct service writes on the duplicate archive and two already-deployed readonly tables. A new forward-only migration clamps table/column rights to service SELECT, precreates the empty archive for later owner archival, and preserves normal guarded RPC writers. Historical SQL/reports were preserved.

Actual RED3pass17fail; GREEN20pass110assertions. Whole-file rollback, catalog idempotency, later archival compatibility and original-stack/audit preservation passed. Local full suite3027pass127skip0fail; strictTS/lint/build passed after correcting owned-test formatting. Independent spec/quality review approved the exact source. [Detailed commands, scope, checksum, preflight, rollback and staff handoff](../../../evidence/audit-remediation-20260927/sequential-fix-r01-readonly-20261001.md).

Lifecycle: this focused repair code-complete=yes; isolated schema-ready=yes; deployed=no; operationally-enabled=no. Overall R01 remains partial: current production146requirements/92gaps/ledger98 and named migration approvals remain outstanding. No production DDL, payment/email, public preview or schedule activation occurred.
