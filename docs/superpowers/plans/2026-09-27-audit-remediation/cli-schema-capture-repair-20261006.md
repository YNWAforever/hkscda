# R01 CLI schema-capture repair specification and execution record

Scope: fix pinned CLI2.118.0 one-row array decoding in the test-only capture helper; reject alternate/malformed payloads before any restore. Preserve catalog stability, schema-only guard, executable admission, SQL, raw comparator and clone ownership/cleanup.

Executed: native56616 reproducer failed before clone; pure regression20436/1; minimal decoder repair; independent review with no findings; post-format47pass/381assertions; full typecheck/lint/units/build native0; original unchanged diagnostic47336/0 on a new owned zero-data missing170006 clone. Source4684e14b20784f4dd8fa8f665613463255a92f37; [complete commands, SHA/pins and evidence](../../../evidence/audit-remediation-20260927/cli-schema-capture-followup-20261006.md).

Next required gate: publish focused stacked draft against #197 and verify exact-head CI. Main merge remains held on the actual #183 finance ACL RED; Task1 five-column and Task8 full-scope source approvals remain pending after automatic review rejection. All14 production forward migrations remain DO_NOT_APPLY. No provider action, production migration or feature activation is part of this repair. Code rollback is a reviewed source revert; typed170011/full hosted and provider UAT are NOT_RUN.

Publication executed: #198 stacked draft, initial published7b1eac3fb9acc8d046e47f974bf1cbc4db97ed34; source/evidence commits and push native0. Exact latest-head CI remains pending at this documentation capture; main merge and production admission remain held.
