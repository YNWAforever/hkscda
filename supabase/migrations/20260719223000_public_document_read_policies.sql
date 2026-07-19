grant select on public.document_assets to anon, authenticated;
grant select on public.site_document_slots to anon, authenticated;
grant select on public.annual_reports to anon, authenticated;

drop policy if exists "public can read published document assets" on public.document_assets;
create policy "public can read published document assets"
  on public.document_assets for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "public can read published document slots" on public.site_document_slots;
create policy "public can read published document slots"
  on public.site_document_slots for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "public can read published annual reports" on public.annual_reports;
create policy "public can read published annual reports"
  on public.annual_reports for select
  to anon, authenticated
  using (is_published = true);