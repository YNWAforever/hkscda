-- Run only in the disposable adoption_cms_20260926 database after the migration.
-- All fixtures and mutations roll back. No existing application database is used.
\set ON_ERROR_STOP on
begin;
do $$ begin
 if current_database() <> 'adoption_cms_20260926' then raise exception 'Disposable database required'; end if;
 if (select count(*) from public.adoption_instruction_pages) <> 1 then raise exception 'Singleton missing'; end if;
 if (select count(*) from public.adoption_instruction_revisions) <> 1 then raise exception 'Unexpected seed count'; end if;
 if exists(select 1 from public.adoption_instruction_pages where draft_revision_id is not null) then raise exception 'Unexpected draft'; end if;
 if exists(select 1 from pg_class where oid in ('public.adoption_instruction_pages'::regclass,'public.adoption_instruction_revisions'::regclass,'public.adoption_instruction_publish_requests'::regclass) and not relrowsecurity) then raise exception 'Missing RLS'; end if;
 if has_table_privilege('anon','public.adoption_instruction_revisions','select') or has_table_privilege('authenticated','public.adoption_instruction_pages','update') or has_function_privilege('authenticated','public.publish_adoption_instruction_page(integer,uuid,text)','execute') then raise exception 'Public access leak'; end if;
end $$;
insert into public.admin_user(auth_user_id,email,role,status) values
 ('11111111-1111-4111-8111-111111111111','cms-staff@example.test','staff','active'),
 ('22222222-2222-4222-8222-222222222222','cms-admin@example.test','admin','active');
set local role service_role;
do $$
declare
 staff uuid := '11111111-1111-4111-8111-111111111111';
 administrator uuid := '22222222-2222-4222-8222-222222222222';
 original uuid; content jsonb; draft jsonb; changed jsonb; published jsonb; replay jsonb; restored jsonb; pversion integer;
begin
 select id, r.content into original, content from public.adoption_instruction_revisions r where state='published';
 if content#>>'{hero,title}' <> '領養需知' then raise exception 'Seed copy changed'; end if;
 if private.is_valid_adoption_instruction_content('{}') or private.is_valid_adoption_instruction_content('null') or private.is_valid_adoption_instruction_content(content #- '{care,cat,title}') or private.is_valid_adoption_instruction_content(jsonb_set(content,'{hero,title}','123')) then raise exception 'Invalid content accepted'; end if;
 draft := public.ensure_adoption_instruction_draft(1,staff);
 changed := jsonb_set(content,'{hero,title}','"驗證草稿"');
 draft := public.update_adoption_instruction_draft((draft->>'version')::integer,changed,staff);
 if (select r.content#>>'{hero,title}' from public.adoption_instruction_revisions r where state='published') <> '領養需知' then raise exception 'Draft leaked'; end if;
 begin perform public.publish_adoption_instruction_page((draft->>'version')::integer,staff,'publish-local-check-01'); raise exception 'Staff published'; exception when insufficient_privilege then null; end;
 begin perform public.update_adoption_instruction_draft((draft->>'version')::integer - 1,content,staff); raise exception 'Stale save succeeded'; exception when serialization_failure then null; end;
 published := public.publish_adoption_instruction_page((draft->>'version')::integer,administrator,'publish-local-check-01');
 replay := public.publish_adoption_instruction_page((draft->>'version')::integer,administrator,'publish-local-check-01');
 if published <> replay then raise exception 'Publish replay changed'; end if;
 if (select count(*) from public.audit_log where action='adoption_instruction.publish') <> 1 then raise exception 'Duplicate publish audit'; end if;
 begin perform public.publish_adoption_instruction_page((draft->>'version')::integer + 1,administrator,'publish-local-check-01'); raise exception 'Reused key accepted wrong version'; exception when serialization_failure then null; end;
 select version into pversion from public.adoption_instruction_pages;
 restored := public.restore_adoption_instruction_revision(original,pversion,administrator);
 if restored#>>'{content,hero,title}' <> '領養需知' then raise exception 'Wrong restored content'; end if;
 if (select r.content#>>'{hero,title}' from public.adoption_instruction_revisions r where state='published') <> '驗證草稿' then raise exception 'Restore changed public content'; end if;
 if (select count(*) from public.adoption_instruction_revisions) <> 3 then raise exception 'History lost'; end if;
 begin perform public.update_adoption_instruction_draft((draft->>'version')::integer,content,staff); raise exception 'Stale prior revision overwrote new draft'; exception when serialization_failure then null; end;
 if (select count(*) from public.audit_log where action like 'adoption_instruction.%') <> 4 then raise exception 'Audit count mismatch'; end if;
 raise notice 'PASS: seed, strict validation, RLS, staff save, draft isolation, stale save, admin publish, idempotency, restore, history and cross-revision concurrency';
end $$;
rollback;
