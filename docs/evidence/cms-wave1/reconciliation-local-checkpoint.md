# Content media reconciliation local acceptance

Target: disposable Supabase API `http://127.0.0.1:55321` and database `postgresql://postgres:postgres@127.0.0.1:55322/postgres`. The service key was read from the ignored local startup JSON into process memory. No production endpoint, credential, object or migration was used.

## Red evidence

- `reconciliation-red.txt`: the existing regression failed because finalized upload sessions and current `content_media` references were not protected.
- `reconciliation-local-red.txt`: the local apply implementation did not exist.
- `reconciliation-local-dryrun-red.txt`: the first local runner required apply and could not perform a fresh count-only dry-run.
- The first actual fixture setup failed before reconciliation because its synthetic `content_public_asset` omitted required `source_bucket`. The next diagnostic showed the synthetic revision snapshots had been encoded as JSON strings instead of JSON objects. Both failures were fixture defects; exact cleanup after each run left no `reconcile-*` rows or objects.

## Green evidence

`reconciliation-local-actual.txt` records 1 pass, 0 failures and 17 assertions against real local Storage and PostgreSQL. The fixture uploaded eight objects. Apply deleted the single old unreferenced private object. It preserved and downloaded seven objects protected by: current `content_media`; one revision path present in both authoring and public snapshots; an active upload session; an expired but finalized upload session; the 24-hour grace period; a `content_public_asset` private source; and its public copy.

After the test's exact cleanup, a database check returned `{"items":0,"objects":0,"admins":0}` for the `reconcile-*` fixture namespace.

Focused unit result: 6 pass, 0 fail, 16 assertions. Actual integration result: 1 pass, 0 fail, 17 assertions. ESLint and `bunx tsc --noEmit --pretty false` exited zero.

The offline inventory command remains count-only and rejects apply. The separate local command supports fresh count-only dry-run with `--local-maintenance`; deletion additionally requires `--apply`. Apply is fixed to ports 55321/55322, limits candidates to 100, holds the requested six SHARE table locks through Storage removal, sets 5-second lock, 55-second statement and 60-second idle transaction limits, and bounds each of the two possible Storage removal requests to 10 seconds.
