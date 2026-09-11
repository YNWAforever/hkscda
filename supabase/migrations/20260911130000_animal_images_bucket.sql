-- Provisions the animal-images Storage bucket.
--
-- src/components/admin/AnimalForm.tsx has always called
-- client.storage.from("animal-images"), but no migration ever created that
-- bucket: it exists in the production project only, created by hand through the
-- dashboard. A freshly migrated database has seven buckets and none of them is
-- animal-images, so on a clean installation -- including the local rehearsal
-- stack and CI -- every animal photo upload fails against a bucket that is not
-- there. This closes that fresh-install gap.
--
-- `on conflict (id) do nothing`, deliberately differing from
-- 20260831160000_content_media_storage_bucket.sql's `do update`. That bucket was
-- created by its own migration, so restating its settings is harmless. This one
-- predates any migration and already holds real animal photographs in
-- production with settings chosen by hand; overwriting public,
-- file_size_limit or allowed_mime_types from here could silently narrow what
-- production already accepts, or change the visibility of live images. Creating
-- it only when absent makes a clean install work without touching the existing
-- bucket at all.
--
-- Public bucket, following the same model as content-media and site-documents:
-- reads are public, and no explicit storage.objects policy is added.
-- storage.objects has row level security enabled with no permissive policy for
-- anon/authenticated, so direct browser writes are denied; uploads go through
-- signed upload URLs, which Supabase Storage authorizes via the URL's own token
-- rather than storage.objects RLS, and which are issued only by the
-- service-role client from an admin-authenticated API route
-- (src/routes/api/admin/animals/photo-upload-url.ts).
--
-- The 8 MiB limit and the JPEG/PNG/WebP allowlist match content-media. Animal
-- photographs are the same kind of asset and are served through the same public
-- derivative path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'animal-images',
  'animal-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
