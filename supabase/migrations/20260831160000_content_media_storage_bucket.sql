-- Provisions the content-media Storage bucket that
-- src/lib/content/repository.server.ts's mediaPublicUrl() already assumes
-- exists (it unconditionally calls
-- client.storage.from(row.storage_bucket).getPublicUrl(...)). Mirrors the
-- site-documents bucket's exact shape
-- (20260718100000_public_documents_and_donation_purpose.sql): a public
-- bucket, with no explicit storage.objects RLS policy needed. storage.objects
-- has row level security enabled by default with no permissive policy for
-- anon/authenticated, so direct writes are already denied for those roles;
-- uploads go through signed upload URLs, which Supabase Storage authorizes
-- via the URL's own token rather than storage.objects RLS, and are issued
-- only by the service-role client (src/lib/content/repository.server.ts's
-- createSignedUploadUrl, called from an admin-authenticated API route).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-media',
  'content-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
