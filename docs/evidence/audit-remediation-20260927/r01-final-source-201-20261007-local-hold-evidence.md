# Current local pre-stage hold · PR #201

Source ae0abf38443a93be6a9d7a34fbc8e24ec4fd60de, tree e5e5d5abe4da492b14b9a00fef6882fee4ef313c. Both wrapper commands exited **1** before typecheck/test/lint/build; all four commands **NOT_RUN**. These are local preservation failures, not CI or application test results. Fresh final-head CI and its native19 gate remain mandatory.

| Stage | UTC start | Environment | Probe exit | Wrapper exit | Result |
| --- | --- | --- | --- | --- | --- |
| Original | 2026-10-07T01:00:54.455713Z | Windows/Bun1.3.14/Node24.18/Python3.14.6; readonly57322/postgres | 1 | 1 | ConnectionClosed; no source hash obtained |
| Readiness retry | 2026-10-07T01:06:42.019316Z | Same source/env/argv/hash contract; readonly57322/postgres | 0 | 1 | Full source hash ace0b822ce94d1fc0a234e79d2341b349c63038b93b8b40ff1bf9cd7b0c6faa7 differs from saved f5b51515bcf790adf7928168478ef94eabbf7331a84420fe744ab7f04e75028b |

Actual wrapper commands: `C:/Python314/python.exe .superpowers/sdd/sequential-merge-20261006/task8-current-local-gates-20261007.py` and `C:/Python314/python.exe .superpowers/sdd/sequential-merge-20261006/task8-current-local-gates-ready-20261007.py`. Version probes exited0; original modern probe stderr561bytes SHA099bb0563e6174db8b7021fcddceb3d6906339d4eee0097bf2fbc19f198ee9bc; retry stdout65bytes SHA6c7b2219f58431dabd4a817c78983a5bc286492f963e325d2eaf9a3386539fe7.

The fixed floor is2,147,483,648bytes. Actual free before each stage29,051,949,056 and28,602,863,616bytes; floor met. Earlier below-floor stages and relay wording remain preserved history. Subsequent read-only Docker metadata observed recently-running containers and reachable57322 after a failed connection; root did not restart WSL/Docker or mutate DB. External readiness/capacity/source changes are **UNKNOWN** in attribution. No new baseline, normalization, reset, repair or reseed. No probe of original55321/55322. Template52322 hash and all four commands were not reached.

Children used OS-only inherited keys, `bun --no-env-file`, generic and LOCAL Supabase placeholders at127.0.0.1:59999 with dummy keys; no CI/GITHUB/provider/fixture opt-ins. The readonly `localSourceState` probe allows only owned modern57322 and template52322 paths and scans full raw state including managed Realtime, native catalog, rows and sequences. No scoped exclusions or synthetic rebaseline. Both receipts freeze2,081 shipping RAW files at the declared source. Retry changes metadata provenance only; original harness preserved.

[Raw ZIP](r01-final-source-201-20261007-local-hold-receipts.zip) and [byte/hash/argv/env manifest](r01-final-source-201-20261007-local-hold-manifest.json) retain every original stream, harness, pointer, frozen-source list and receipt. ZIP member equality verified. All15 new SQL remainDO_NOT_APPLY; source review approval does not admit formal migrations, historical553 preservation or external UAT.
