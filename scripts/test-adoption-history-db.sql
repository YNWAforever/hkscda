-- Run ONLY inside supabase_db_hkscda-audit-remediation-20260927.
-- All synthetic revisions are rolled back before the script exits.
\set ON_ERROR_STOP on
select count(*) as before_count from public.adoption_instruction_revisions where page_key = 'adoption-instructions';
begin;
insert into public.adoption_instruction_revisions
  (page_key, revision_number, state, content, version)
select 'adoption-instructions', numbers.n, 'archived', seed.content, 1
from generate_series(2, 1002) as numbers(n)
cross join (
  select content from public.adoption_instruction_revisions
  where page_key = 'adoption-instructions' and revision_number = 1
) seed
on conflict (page_key, revision_number) do nothing;
select count(*) as in_transaction_count
from public.adoption_instruction_revisions where page_key = 'adoption-instructions';
select
  (select octet_length(coalesce(json_agg(t)::text, '[]')) from (
    select id, page_key, revision_number, state, content, source_revision_id,
      version, created_by, updated_by, published_by, published_at, created_at, updated_at
    from public.adoption_instruction_revisions
    where page_key = 'adoption-instructions'
    order by revision_number desc, id desc limit 1000
  ) t) as legacy_history_bytes,
  (select octet_length(coalesce(json_agg(t)::text, '[]')) from (
    select id, page_key, revision_number, state, source_revision_id,
      version, created_by, updated_by, published_by, published_at, created_at, updated_at
    from public.adoption_instruction_revisions
    where page_key = 'adoption-instructions'
    order by revision_number desc, id desc limit 26
  ) t) as summary_page_bytes;
explain (analyze, buffers)
select id, page_key, revision_number, state, content, source_revision_id,
  version, created_by, updated_by, published_by, published_at, created_at, updated_at
from public.adoption_instruction_revisions
where page_key = 'adoption-instructions'
order by revision_number desc, id desc limit 1000;
explain (analyze, buffers)
select id, page_key, revision_number, state, source_revision_id,
  version, created_by, updated_by, published_by, published_at, created_at, updated_at
from public.adoption_instruction_revisions
where page_key = 'adoption-instructions'
order by revision_number desc, id desc limit 26;
rollback;
select count(*) as after_rollback_count
from public.adoption_instruction_revisions where page_key = 'adoption-instructions';
