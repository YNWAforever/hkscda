-- Function behavioural parity after the 2026-11-10 stale-schema baseline.
--
-- The schema catch-up restored the missing objects, but five functions still ran older bodies.
-- Four of them have a clear newer repository definition that production never received; replace
-- them with the latest repository body (create or replace, so a fresh database built from the full
-- migration history is unaffected). Privileges are restated from the defining migrations.
--
-- Verified after apply: normalized bodies equal the latest repository definitions, and no rows or
-- table grants change.

-- record_sponsorship_payment_proof — latest repository definition (20260911180000_sponsorship_second_month.sql)
CREATE OR REPLACE FUNCTION public.record_sponsorship_payment_proof(p_pledge_id uuid, p_actor_user_id uuid, p_storage_path text, p_file_name text, p_file_type text, p_file_size integer, p_payment_method text, p_reference text, p_amount_cents integer, p_payment_date date, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
set search_path = public, pg_temp
AS $function$
declare
  v_pledge public.sponsorship_pledge%rowtype;
  v_proof_id uuid;
begin
  if not exists (
    select 1
    from public.admin_user
    where auth_user_id = p_actor_user_id
      and status = 'active'
      and role in ('staff', 'admin')
  ) then
    raise exception 'Actor % is not an active staff/admin user', p_actor_user_id
      using errcode = '42501';
  end if;

  select *
  into v_pledge
  from public.sponsorship_pledge
  where id = p_pledge_id
  for update;

  if not found then
    raise exception 'Sponsorship pledge not found';
  end if;

  if v_pledge.status not in ('pending_payment', 'needs_followup', 'active') then
    raise exception 'Sponsorship pledge is not eligible for a recorded payment';
  end if;

  insert into public.sponsorship_payment_proof (
    pledge_id,
    storage_path,
    file_name,
    file_type,
    file_size,
    payment_method,
    reference,
    amount_cents,
    payment_date,
    review_status,
    source
  ) values (
    p_pledge_id,
    p_storage_path,
    p_file_name,
    p_file_type,
    p_file_size,
    p_payment_method,
    p_reference,
    p_amount_cents,
    p_payment_date,
    'pending',
    'staff'
  )
  returning id into v_proof_id;

  -- An already-active sponsorship stays active while the new month's proof is
  -- reviewed. Moving it to 'provisional' would reopen a confirmed relationship,
  -- which the plan forbids: "While a pledge remains active, add payments for new
  -- months directly; do not reopen or duplicate the pledge."
  if v_pledge.status <> 'active' then
    update public.sponsorship_pledge
    set status = 'provisional'
    where id = p_pledge_id;
  end if;

  insert into public.audit_log (
    actor_user_id,
    action,
    entity,
    entity_id,
    detail
  ) values (
    p_actor_user_id,
    'sponsorship_pledge.proof_recorded',
    'sponsorship_pledge',
    p_pledge_id::text,
    jsonb_build_object(
      'proofId', v_proof_id,
      'paymentMethod', p_payment_method,
      'amountCents', p_amount_cents,
      'note', p_note
    )
  );

  return v_proof_id;
end;
$function$;
grant execute on function public.record_sponsorship_payment_proof(uuid, uuid, text, text, text, integer, text, text, integer, date, text) to service_role;

-- read_content_admin_summaries — latest repository definition (20260915120000_content_admin_filters.sql)
create or replace function public.read_content_admin_summaries(p_filters jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with filtered as (
 select item.* from public.content_item item
 where (p_filters->>'type' is null or item.type=p_filters->>'type')
 and (p_filters->>'status' is null or item.status=p_filters->>'status')
 and (p_filters->>'q' is null or strpos(lower(item.title||' '||coalesce(item.summary,'')),lower(p_filters->>'q'))>0)
 and (p_filters->>'publishedFrom' is null or item.published_at >= (p_filters->>'publishedFrom')::date)
 and (p_filters->>'publishedTo' is null or item.published_at < ((p_filters->>'publishedTo')::date + interval '1 day'))
 and (p_filters->>'mapVisibility' is null or exists (select 1 from public.rescue_story_profile p where p.content_item_id=item.id and p.show_on_map = ((p_filters->>'mapVisibility')='on')))
 and (p_filters->>'hasUpdate' is null or (case when (p_filters->>'hasUpdate')='yes' then exists (select 1 from public.story_update u where u.content_item_id=item.id) else not exists (select 1 from public.story_update u where u.content_item_id=item.id) end))
 and (p_filters->>'draftState' is null or exists (select 1 from public.recipient_notification_draft d where d.content_item_id=item.id and d.status=p_filters->>'draftState'))
 and ((p_filters->>'animalType' is null and p_filters->>'publicStatus' is null and p_filters->>'rescueRegion' is null) or exists(select 1 from public.rescue_story_profile profile where profile.content_item_id=item.id
 and (p_filters->>'animalType' is null or profile.animal_type=p_filters->>'animalType')
 and (p_filters->>'publicStatus' is null or profile.public_status=p_filters->>'publicStatus')
 and (p_filters->>'rescueRegion' is null or profile.rescue_region=p_filters->>'rescueRegion')))
 ), page as (
 select item.* from filtered item order by item.updated_at desc,item.id
 limit least(50,greatest(1,coalesce((p_filters->>'pageSize')::int,25)))
 offset (greatest(1,coalesce((p_filters->>'page')::int,1))-1)*least(50,greatest(1,coalesce((p_filters->>'pageSize')::int,25)))
 ), snapshots as (
 select item.id,item.updated_at,jsonb_build_object(
 'content',to_jsonb(item)-'body'-'seo_title'-'seo_description'-'og_title'-'og_description',
 'profile',(select to_jsonb(profile) from public.rescue_story_profile profile where profile.content_item_id=item.id),
 'updates',case when latest.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(latest)-'body') end,
 'media',case when cover.id is null then '[]'::jsonb else jsonb_build_array(to_jsonb(cover)) end
 ) as snapshot
 from page item
 left join lateral (select u.* from public.story_update u where u.content_item_id=item.id and u.is_authoring_active and u.visibility='public' order by u.occurred_at desc,u.id limit 1) latest on true
 left join lateral (select m.* from public.content_media m where m.content_item_id=item.id
 and (m.story_update_id is null or exists (select 1 from public.story_update u where u.id=m.story_update_id and u.content_item_id=item.id and u.is_authoring_active and u.visibility='public'))
 and (m.id=item.cover_media_id or m.is_cover)
 order by (m.id=item.cover_media_id) desc nulls last,m.sort_order,m.created_at,m.id limit 1) cover on true
 ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(snapshot order by updated_at desc,id) from snapshots),'[]'::jsonb))
$$;
revoke all on function public.read_content_admin_summaries(jsonb) from public,anon,authenticated;
grant execute on function public.read_content_admin_summaries(jsonb) to service_role;

-- claim_volunteer_operation_outbox — latest repository definition (20260926120000_volunteer_notification_exhausted_claim_recovery.sql)
create or replace function public.claim_volunteer_operation_outbox(
  p_limit integer,
  p_lease_until timestamptz
)
returns setof public.volunteer_operation_outbox
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.volunteer_operation_outbox o
  set status = 'failed',
      claimed_until = null,
      last_error = 'notification_attempts_exhausted'
  where o.kind in ('volunteer_monthly_assessment_notification', 'volunteer_policy_reminder')
    and (
      o.status = 'queued'
      or (o.status = 'claimed' and o.claimed_until < clock_timestamp())
    )
    and o.available_at <= clock_timestamp()
    and o.attempts - o.retry_attempt_base >= coalesce(
      (o.payload->>'max_attempts')::integer,
      (
        select (v.body#>>'{notifications,max_attempts}')::integer
        from public.volunteer_monthly_assessment a
        join public.volunteer_assessment_policy_version v on v.id = a.policy_version_id
        where a.id = (o.payload->>'assessment_id')::uuid
      ),
      1
    );

  return query
  update public.volunteer_operation_outbox o
  set status = 'claimed',
      attempts = o.attempts + 1,
      claimed_until = least(p_lease_until, clock_timestamp() + interval '10 minutes')
  where o.id in (
    select q.id
    from public.volunteer_operation_outbox q
    where q.kind in ('volunteer_monthly_assessment_notification', 'volunteer_policy_reminder')
      and (
        q.status in ('queued', 'failed')
        or (q.status = 'claimed' and q.claimed_until < clock_timestamp())
      )
      and q.available_at <= clock_timestamp()
      and q.attempts - q.retry_attempt_base < coalesce(
        (q.payload->>'max_attempts')::integer,
        (
          select (v.body#>>'{notifications,max_attempts}')::integer
          from public.volunteer_monthly_assessment a
          join public.volunteer_assessment_policy_version v on v.id = a.policy_version_id
          where a.id = (q.payload->>'assessment_id')::uuid
        ),
        1
      )
    order by q.available_at, q.id
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  returning o.*;
end;
$$;
revoke all on function public.claim_volunteer_operation_outbox(integer,timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_volunteer_operation_outbox(integer,timestamptz)
  to service_role;

-- volunteer_roster_attendance_result — latest repository definition (20261016092546_volunteer_roster_attendance_receipts.sql)
create or replace function public.volunteer_roster_attendance_result(p_operation public.volunteer_bulk_operation)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $function$
 select jsonb_build_object('kind','ready','operation',jsonb_build_object(
  'id',p_operation.id,'action','roster_attendance','created_at',p_operation.created_at,'expires_at',p_operation.expires_at,
  'activity_id',p_operation.input->>'activity_id','activity_title',p_operation.selection->0->>'title',
  'scope',jsonb_build_object('kind','page','page',(p_operation.input->>'page')::integer,'page_size',25,
   'selected_count',jsonb_array_length(p_operation.groups->0->'roster_rows')),
  'state',case when jsonb_typeof(p_operation.groups->0->'roster_results')='array' then 'completed'
   when p_operation.expires_at<clock_timestamp() then 'expired' else 'previewed' end,
  'rows',p_operation.groups->0->'roster_rows','results',p_operation.groups->0->'roster_results',
  'notifications','[]'::jsonb))
$function$;
revoke all on function public.volunteer_roster_attendance_result(public.volunteer_bulk_operation) from public,anon,authenticated,service_role;

-- BUG-53: one published adoption-guide release per species.
-- Production data audit before this migration: public.adoption_guide_releases has 0 rows, so no
-- duplicates can exist and the index is safe to add. The publish path already serialises per
-- species and archives older releases; this index makes the invariant explicit. If a published
-- duplicate ever appears on a future environment, the migration refuses and must be revisited.
create unique index if not exists adoption_guide_releases_one_published_per_species
  on public.adoption_guide_releases (species)
  where state = 'published';
