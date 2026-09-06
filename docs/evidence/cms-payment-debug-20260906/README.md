# CMS and payment-settings incident — 2026-09-06

Status: production failure confirmed; remediation not yet applied. Investigation branch codex/cms-payment-debug-20260906, based on current main 8449d30429414ed3bcfda8f01997e51343f09ec7. Original completion branch and worktree evidence preserved.

## Executed read-only evidence

- User reports https://hkscda.vercel.app/admin/payment-methods stays at `載入付款方式設定中...`.
- GitHub PR107 was merged at 2026-09-05T20:09:52Z. All listed CI checks passed. Vercel production alias resolves to deployment dpl_7yZtK6Pf8Qo2Vgs1ovQKvVci1ig1, source 8449d30429414ed3bcfda8f01997e51343f09ec7, READY.
- Vercel production logs at 20:34–20:40Z: GET /api/admin/content ->500, PGRST202: `public.read_content_admin_summaries(p_filters)` absent from schema cache.
- Logs at 20:33Z: GET /api/admin/supporters ->500, PGRST202: `public.crm_read_supporters(p_export,p_filters,p_limit,p_offset)` absent from schema cache.
- Aggregate current-deployment errors at 20:44Z: payment-methods14, supporters7, content6.
- GET /api/admin/payment-methods repeatedly returned500 at 20:33–20:43Z. GET /api/admin/payments returned200 at20:32:58Z. This identifies the settings API; it does not establish a provider/transaction failure.
- Payment repository lists public.payment_public_config. Its generic error mapping omits the original provider details, so missing payment schema is a hypothesis, not a confirmed diagnosis.
- Public GET /donate returned200; that alone does not prove its payment configurations or checkout work.
- Connected Supabase account lists only unrelated projects. Read-only migration-history query against the documented HKSCDA ref iihqjzilgawhfdhdevam was denied by the service. No production SQL executed.
- Browser connector twice failed to initialize due local runtime/ACL errors; no browser reproduction or authenticated page inspection claimed.

## Root-cause boundary

CMS/CRM: deployed application calls RPCs unavailable to its PostgREST schema cache. Matching committed migrations are 20260905162615 and 20260905163559, dependent on the earlier candidate migrations. Missing migrations, mismatched target, cache state and grants must be distinguished by metadata inspection. Do not add legacy read fallbacks that remove privacy/identity protections.

Payment settings: confirmed server500, underlying database/auth/composition cause not yet available. Migration 20260831120000 defines its tables, columns and RPCs and predates the seven latest migrations; therefore checking only the latest seven is insufficient.

Frontend: default React Query retries can retain the loading view while retrying. Source has a terminal error view. Indefinite loading has not been independently reproduced; no speculative frontend fix made.

## Concrete next step and conditional repair

Run schema-preflight.sql read-only through access to the correct project; it lists all52 expected migration versions, relevant RPC existence/service-role privileges and payment table/column metadata without business rows. Query is prepared, not yet executed against that project. Compare the application's actual database project binding without exposing keys.

If migrations are absent, prepare the exact missing ordered migration set, review backfill/duplicate preflights and current backup, then obtain explicit production migration approval. If schema exists, inspect cache/exposure/grants and prepare the smallest matching repair. A cache reload or grant change is still a production mutation requiring approval under this task's restrictions. Existing release/rollback proposal remains applicable; do not blindly roll back to main before PR107.

After authorized repair: repeat metadata checks, then authenticated GET content/supporters/payment-methods must return200 with valid envelopes; refresh the reported page and verify loading resolves. Read-only payment-settings recovery does not authorize publishing methods, activating providers or creating transactions.

No application code, production schema/data/assets, provider settings or deployments changed during this investigation. Debug branch has not been pushed.
## Follow-up after reconnection
Access restored; missing schema confirmed. See repair-proposal.md and production-schema-preflight.json for the executed read-only findings and locally verified repair proposal. No production repair executed.

## Approved production repair completed
Migration 20260906062155 applied after explicit approval. See production-repair-result.md and production-after.json. Earlier no-production-change statements above describe the pre-approval investigation.
