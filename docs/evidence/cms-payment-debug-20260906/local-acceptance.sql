set role service_role;
do $$ declare authoring jsonb; published jsonb; supporters jsonb; begin
 authoring := public.read_content_admin_summaries('{}'::jsonb);
 published := public.read_published_content_snapshots('{}'::jsonb);
 supporters := public.crm_read_supporters('{}'::jsonb,0,25,false);
 if (authoring->>'total')::int<>7 then raise exception 'CMS count mismatch'; end if;
 if (published->>'total')::int<>7 then raise exception 'Public count mismatch'; end if;
 if published::text like '%REPAIR_PRIVATE_SENTINEL%' then raise exception 'Internal update leaked'; end if;
 if (supporters->>'total')::int<>1 then raise exception 'CRM count mismatch'; end if;
 if (select count(*) from public.payment_public_config where state='draft' and not is_publicly_visible and published_at is null)<>5 then raise exception 'Draft payment config mismatch'; end if;
 if (select count(*) from public.payment_public_config where state='published')<>0 then raise exception 'Payment method unexpectedly published'; end if;
 if (select count(*) from public.story_update where visibility='internal')<>1 then raise exception 'Internal source changed'; end if;
 if exists(select 1 from public.content_item where published_at<>'2026-08-01T00:00:00Z') then raise exception 'Publication timestamp changed'; end if;
 if has_table_privilege('anon','public.payment_public_config','SELECT') or has_function_privilege('anon','public.read_content_admin_summaries(jsonb)','EXECUTE') then raise exception 'Anonymous admin access'; end if;
 raise notice 'PASS: CMS=7, public=7, CRM=1, internal retained and excluded, dates preserved, five draft methods, zero published methods, anon denied';
end $$;
reset role;
do $$ begin
 if (select public from storage.buckets where id='content-media-private') is distinct from false then raise exception 'Private bucket missing or public'; end if;
 if (select count(*) from public.content_revision where is_published)<>7 then raise exception 'Published revision mismatch'; end if;
 raise notice 'PASS: private bucket and seven immutable published revisions';
end $$;