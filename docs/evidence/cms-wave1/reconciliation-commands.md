# Content media reconciliation commands

The existing offline command remains count-only and defaults to dry-run:

```powershell
bun scripts/reconcile-content-media.ts --inventory <authorized-inventory.json>
```

It never connects to Storage and rejects `--apply`.

The separate maintenance command is restricted to the disposable completion stack at API port 55321 and database port 55322. It reads the service key from the ignored local startup JSON into memory. Fresh inventory dry-run requires an explicit local-maintenance flag and prints counts only:

```powershell
bun --no-env-file scripts/content-media-reconciliation-local.ts --local-maintenance
```

Deletion additionally requires `--apply`:

```powershell
bun --no-env-file scripts/content-media-reconciliation-local.ts --local-maintenance --apply
```

Apply holds SHARE locks on the six CMS metadata tables while it reads fresh references and calls Storage removal. It protects current media, all authoring and public revision media, both source and public prepared assets, active or finalized upload sessions, and objects created within 24 hours. Each Storage request is bounded to ten seconds. More than 100 candidates aborts without deletion. The command rejects every API or database target other than the fixed loopback stack.

The actual Storage acceptance test is also opt-in and must run only while that disposable stack is exclusively allocated:

```powershell
$env:CONTENT_MEDIA_RECONCILIATION_LOCAL_TEST='1'
bun --no-env-file test scripts/content-media-reconciliation-local.integration.test.ts
```
