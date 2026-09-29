\set ON_ERROR_STOP on
begin;

-- An unversioned terms PDF must fail even before slot publication.
do $$
begin
  begin
    insert into public.document_assets
      (id, kind, title, language, object_path, byte_size, checksum_sha256, is_published)
    values
      ('aaaaaaaa-0000-4000-8000-000000000001', 'sponsorship_terms', 'invalid', 'zh-HK', 'sponsorship_terms/invalid.pdf', 100, null, false);
    raise exception 'an unversioned sponsorship terms PDF was accepted';
  exception when check_violation then null;
  end;
end $$;

insert into public.document_assets
  (id, kind, title, language, object_path, byte_size, checksum_sha256, is_published)
values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'sponsorship_terms', 'Published synthetic terms', 'zh-HK', 'sponsorship_terms/published-synthetic.pdf', 100, repeat('a', 64), true),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'sponsorship_terms', 'Draft synthetic terms', 'zh-HK', 'sponsorship_terms/draft-synthetic.pdf', 100, repeat('b', 64), false);
insert into public.site_document_slots
  (id, slot_key, language, document_asset_id, is_published)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'sponsorship_terms', 'zh-HK', 'aaaaaaaa-0000-4000-8000-000000000002', true);

select 1 / case when
  has_table_privilege('anon', 'public.document_assets', 'SELECT') and
  not has_table_privilege('anon', 'public.document_assets', 'INSERT') and
  has_table_privilege('anon', 'public.site_document_slots', 'SELECT') and
  not has_table_privilege('anon', 'public.site_document_slots', 'UPDATE') and
  (select relrowsecurity from pg_class where oid = 'public.document_assets'::regclass) and
  (select relrowsecurity from pg_class where oid = 'public.site_document_slots'::regclass)
then 1 else 0 end as grants_rls_check;

set local role anon;
select 1 / case when
  (select count(*) from public.document_assets where id = 'aaaaaaaa-0000-4000-8000-000000000002') = 1 and
  (select count(*) from public.document_assets where id = 'aaaaaaaa-0000-4000-8000-000000000003') = 0 and
  (select count(*) from public.site_document_slots where id = 'bbbbbbbb-0000-4000-8000-000000000001') = 1
then 1 else 0 end as public_visibility_check;
reset role;
rollback;
