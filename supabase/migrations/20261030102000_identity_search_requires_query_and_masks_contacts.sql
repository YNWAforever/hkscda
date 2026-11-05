-- BUG-37: staff could read the whole supporter directory through the manual-intake
-- identity search.
--
-- search_manual_case_identity (latest: 20261002045253) matched every supporter when the
-- query was empty (`n.value = ''`), and returned each one's name, email and phone, 25 a
-- page: donors, sponsors and volunteers included, though staff have no supporters area.
--
-- Redefined from 20261002045253 so that:
--   * an empty query matches nothing, and a query shorter than 3 characters (after trim)
--     matches only an exact email or phone (digits compared without spaces or symbols);
--   * a substring of an email or phone matches only adopters; a supporter who is not an
--     adopter is found by name substring or by their exact email or phone;
--   * a supporter with no adopter_profile comes back with email and phone masked
--     (a***@example.com, ****5678) and 'contactMasked': true, so the screen does not copy
--     them into the case.
-- The service also requires q (at least 3 characters) before calling it.
-- Signature, language sql, stable, security invoker, search_path = '' (every reference
-- schema-qualified) and grants (service_role only) are unchanged.

create or replace function public.search_manual_case_identity(
  p_query text,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  with needle as (
    select
      lower(btrim(coalesce(p_query, ''))) as value,
      regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g') as digits
  ),
  candidates as materialized (
    select
      case when ap.id is null then 'supporter' else 'adopter' end as kind,
      s.id as supporter_id,
      ap.id as adopter_profile_id,
      coalesce(
        nullif(btrim(ap.name_english), ''),
        nullif(btrim(ap.name_chinese), ''),
        nullif(btrim(s.name), ''),
        coalesce(ap.id, s.id)::text
      ) as display_name,
      ap.id is null as contact_masked,
      case
        when ap.id is not null or s.email is null then s.email::text
        else left(s.email::text, 1) || '***@' || split_part(s.email::text, '@', 2)
      end as email,
      case
        when ap.id is not null or s.phone is null then s.phone
        when char_length(s.phone) > 4
          then repeat('*', char_length(s.phone) - 4) || right(s.phone, 4)
        else '****'
      end as phone,
      coalesce(ap.is_blacklisted, false) as is_blacklisted
    from public.supporter s
    left join public.adopter_profile ap on ap.supporter_id = s.id
    cross join needle n
    where s.deleted_at is null
      and n.value <> ''
      and (
        -- An exact email or phone, at any length.
        lower(coalesce(s.email::text, '')) = n.value
        or coalesce(s.phone, '') = n.value
        or (
          n.digits <> ''
          and regexp_replace(coalesce(s.phone, ''), '[^0-9]', '', 'g') = n.digits
        )
        -- A substring, from 3 characters.
        or (
          char_length(n.value) >= 3
          and (
            strpos(lower(coalesce(ap.name_english, '')), n.value) > 0
            or strpos(lower(coalesce(ap.name_chinese, '')), n.value) > 0
            or strpos(lower(coalesce(ap.address, '')), n.value) > 0
            or strpos(lower(coalesce(s.name, '')), n.value) > 0
            or (
              ap.id is not null
              and (
                strpos(lower(coalesce(s.email::text, '')), n.value) > 0
                or strpos(lower(coalesce(s.phone, '')), n.value) > 0
              )
            )
          )
        )
      )
  ),
  page_rows as (
    select *
    from candidates
    order by lower(display_name), supporter_id
    limit least(greatest(coalesce(p_page_size, 10), 1), 25)
    offset (greatest(coalesce(p_page, 1), 1)::bigint - 1)
      * least(greatest(coalesce(p_page_size, 10), 1), 25)
  )
  select jsonb_build_object(
    'total', (select count(*) from candidates),
    'candidates', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'kind', kind,
            'supporterId', supporter_id,
            'adopterProfileId', adopter_profile_id,
            'displayName', display_name,
            'email', email,
            'phone', phone,
            'contactMasked', contact_masked,
            'isBlacklisted', is_blacklisted,
            'latestCaseAt', null
          )
          order by lower(display_name), supporter_id
        )
        from page_rows
      ),
      '[]'::jsonb
    )
  );
$function$;

revoke all on function public.search_manual_case_identity(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_manual_case_identity(text, integer, integer)
  to service_role;
