-- AUDIT R4 practice gap (2026-11-09 audit, "Not filed as bugs"): `site-documents` was a
-- public Storage bucket, so an uploaded but unpublished PDF could be fetched by anyone who
-- knew its (random-UUID) object path. The pages that link documents only ever link
-- *published* assets, but the object itself was readable independently of its row.
--
-- This makes the bucket private and adds the one controlled public reader. Every browser
-- link becomes /api/documents/<asset id> (src/lib/documents/downloadPath.ts): the route
-- calls public.read_public_document_asset, which returns the object only when the asset is
-- published AND referenced by a published surface, then redirects to a 60-second signed URL
-- (src/routes/api/documents/$assetId.ts). No page embeds a Storage URL any more.
--
-- Readers traced before changing anything: annual reports (src/routes/report/audit.tsx),
-- site document slots — sponsorship terms (src/lib/sponsorship/terms.server.ts), the
-- wedding gift-return plan (src/routes/donate.tsx), post-adoption guides
-- (src/lib/adoptionInformation/publicPage.server.ts) — and knowledge posts
-- (src/lib/knowledge/repository.server.ts) all read through service-role repositories and
-- render the controlled path. The supporter portal does not read this bucket. Admin upload
-- paths already use signed upload URLs (createSignedUploadUrl) and admin previews use
-- signed read URLs (src/lib/adoptionGuideReleases/repository.server.ts), so a private bucket
-- keeps both working; no storage.objects policy is needed for a signed URL. No rows are read
-- or rewritten, and no table grants change.
update storage.buckets
set public = false
where id = 'site-documents';

-- The single public eligibility decision. `security definer` + pinned empty search_path:
-- every reference is schema-qualified. service_role-only execute; browser roles cannot call
-- it directly, they go through the route.
create or replace function public.read_public_document_asset(p_asset_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'bucket_name', asset.bucket_name,
    'object_path', asset.object_path,
    'mime_type', asset.mime_type
  )
  from public.document_assets asset
  where asset.id = p_asset_id
    and asset.bucket_name = 'site-documents'
    and asset.mime_type = 'application/pdf'
    and asset.is_published
    and asset.object_path ~* '\.pdf$'
    and position('/' in asset.object_path) <> 1
    and position('..' in asset.object_path) = 0
    and position(pg_catalog.chr(92) in asset.object_path) = 0
    and (
      exists (
        select 1
        from public.site_document_slots slot
        where slot.document_asset_id = asset.id
          and slot.is_published
      )
      or exists (
        select 1
        from public.knowledge_posts post
        where post.is_published
          and asset.id in (
            post.document_asset_id,
            post.zh_hk_document_asset_id,
            post.en_document_asset_id
          )
      )
      or exists (
        select 1
        from public.annual_reports report
        where report.document_asset_id = asset.id
          and report.is_published
      )
    )
$$;

revoke all on function public.read_public_document_asset(uuid) from public, anon, authenticated;
grant execute on function public.read_public_document_asset(uuid) to service_role;
