-- FAQ search gaps: one row per (Hong Kong day, language, confidence, topic) with
-- a running count. A "topic" is the sanitised phrase the help search could not
-- answer well. The raw query, IP address, user agent and page path are never
-- stored here, and neither is the time of a search: only the topic, its
-- language and the Hong Kong date, with a count, so the report can show staff
-- which questions are missing from the FAQ.

create table public.faq_search_gap (
  day date not null,
  language text not null check (language in ('zh-HK', 'en')),
  confidence text not null check (confidence in ('none', 'low')),
  topic text not null check (char_length(topic) between 1 and 80),
  search_count integer not null default 1 check (search_count > 0),
  primary key (day, language, confidence, topic)
);

-- RLS on with no policies: the table is reachable only through the three
-- functions below (owner privileges) and the service role.
alter table public.faq_search_gap enable row level security;

revoke all on table public.faq_search_gap from public, anon, authenticated;
grant select, insert, update, delete on table public.faq_search_gap to service_role;

-- Retention: keep 90 Hong Kong days. Returns the number of rows deleted.
create or replace function public.purge_faq_search_gaps()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
  v_deleted integer;
begin
  delete from public.faq_search_gap g
  where g.day < v_today - 90;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_faq_search_gaps() from public, anon, authenticated;
grant execute on function public.purge_faq_search_gaps() to service_role;

-- Count one miss for today. Expired rows are purged on every write, so the
-- table stays bounded without a scheduled job.
create or replace function public.record_faq_search_gap(
  p_topic text,
  p_language text,
  p_confidence text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
begin
  perform public.purge_faq_search_gaps();

  insert into public.faq_search_gap as g (day, language, confidence, topic)
  values (v_today, p_language, p_confidence, p_topic)
  on conflict (day, language, confidence, topic) do update
    set search_count = g.search_count + 1;
end;
$$;

revoke all on function public.record_faq_search_gap(text, text, text) from public, anon, authenticated;
grant execute on function public.record_faq_search_gap(text, text, text) to service_role;

-- Report: topics summed over the last p_days Hong Kong days (today included),
-- most-searched first. Every column is qualified with `g.` because the
-- RETURNS TABLE column names are also plpgsql variables, so a bare `topic` or
-- `language` would be ambiguous.
create or replace function public.list_faq_search_gaps(
  p_days integer,
  p_limit integer
)
returns table (
  topic text,
  language text,
  confidence text,
  search_count bigint,
  last_seen_day date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Hong_Kong')::date;
begin
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'p_days must be between 1 and 90' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'p_limit must be between 1 and 500' using errcode = '22023';
  end if;

  return query
  select g.topic,
         g.language,
         g.confidence,
         sum(g.search_count)::bigint,
         max(g.day)
  from public.faq_search_gap g
  where g.day > v_today - p_days
  group by g.topic, g.language, g.confidence
  order by sum(g.search_count) desc, max(g.day) desc, g.topic, g.language, g.confidence
  limit p_limit;
end;
$$;

revoke all on function public.list_faq_search_gaps(integer, integer) from public, anon, authenticated;
grant execute on function public.list_faq_search_gaps(integer, integer) to service_role;
