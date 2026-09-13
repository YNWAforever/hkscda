-- Verified Resend events are immutable facts, separate from send-job retries.
-- Read projections also resolve callbacks received before a sender saves its ID.
create table public.mail_delivery_event (
 event_id text primary key check(length(event_id) between 1 and 200),
 provider_message_id text not null check(length(provider_message_id) between 1 and 200),
 event_type text not null check(event_type in ('email.delivered','email.bounced','email.failed','email.complained','email.delivery_delayed')),
 occurred_at timestamptz not null,
 body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
 received_at timestamptz not null default clock_timestamp()
);
alter table public.mail_delivery_event enable row level security;
revoke all on public.mail_delivery_event from public,anon,authenticated,service_role;
grant select on public.mail_delivery_event to service_role;
create index mail_delivery_message_idx on public.mail_delivery_event(provider_message_id,occurred_at desc);
create function private.reject_mail_delivery_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$begin raise exception 'mail_delivery_evidence_immutable' using errcode='42501';end$$;
create trigger mail_delivery_immutable before update or delete or truncate on public.mail_delivery_event for each statement execute function private.reject_mail_delivery_mutation();
revoke all on function private.reject_mail_delivery_mutation() from public,anon,authenticated,service_role;
create function public.record_mail_delivery_event(p_event_id text,p_message_id text,p_type text,p_occurred_at timestamptz,p_body_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.mail_delivery_event%rowtype; inserted integer;
begin
 insert into public.mail_delivery_event(event_id,provider_message_id,event_type,occurred_at,body_hash) values(p_event_id,p_message_id,p_type,p_occurred_at,p_body_hash) on conflict(event_id) do nothing;
 get diagnostics inserted=row_count;
 select * into strict prior from public.mail_delivery_event where event_id=p_event_id;
 if prior.provider_message_id is distinct from p_message_id or prior.event_type is distinct from p_type or prior.occurred_at is distinct from p_occurred_at or prior.body_hash is distinct from p_body_hash then raise exception 'mail_delivery_event_conflict' using errcode='23505';end if;
 if inserted=1 then insert into public.audit_log(action,entity,entity_id,detail) values('notification.delivery_event','mail_delivery_event',p_event_id,jsonb_build_object('provider','resend','providerMessageId',p_message_id,'type',p_type,'occurredAt',p_occurred_at));end if;
 return jsonb_build_object('replayed',inserted=0);
end$$;
revoke all on function public.record_mail_delivery_event(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.record_mail_delivery_event(text,text,text,timestamptz,text) to service_role;
-- Delayed evidence never erases a terminal result; event time orders terminal
-- results regardless of arrival order. All earlier facts remain queryable.
create view public.mail_delivery_latest as
 select distinct on(provider_message_id) provider_message_id,event_id,replace(event_type,'email.','') state,occurred_at
 from public.mail_delivery_event
 order by provider_message_id,(event_type<>'email.delivery_delayed') desc,occurred_at desc,
 case event_type when 'email.complained' then 4 when 'email.bounced' then 3 when 'email.failed' then 2 when 'email.delivered' then 1 else 0 end desc,event_id;
create view public.sponsorship_delivery_status as
 select o.*,e.state delivery_state,e.occurred_at delivery_observed_at
 from public.sponsorship_delivery_outbox o left join public.mail_delivery_latest e on e.provider_message_id=o.provider_message_id;
create view public.message_delivery_status as
 select m.id,m.supporter_id,m.channel,m.template_id,case when e.state='delivered' then 'delivered' else m.status end status,m.payload||jsonb_build_object('deliveryState',e.state,'deliveryObservedAt',e.occurred_at) payload,m.sent_at,m.created_at,m.updated_at,e.state delivery_state,e.occurred_at delivery_observed_at
 from public.message m left join public.mail_delivery_latest e on e.provider_message_id=m.payload->>'providerMessageId';
revoke all on public.mail_delivery_latest,public.sponsorship_delivery_status,public.message_delivery_status from public,anon,authenticated,service_role;
grant select on public.mail_delivery_latest,public.sponsorship_delivery_status,public.message_delivery_status to service_role;
-- Preserve the current task command and its newer promotion-task behavior.
-- Only enrich the notification read projection; do not alter retry commands.
do $projection$
declare source text; enriched text;
begin
 select pg_get_functiondef(p.oid) into strict source from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='volunteer_task_command';
 enriched:=replace(source,'payload->>''profile_id'' profile_id from public.volunteer_operation_outbox where kind in',
 'payload->>''profile_id'' profile_id,delivery_state from (select o.*,e.state delivery_state from public.volunteer_operation_outbox o left join public.mail_delivery_latest e on e.provider_message_id=o.payload->>''providerMessageId'') delivery_rows where kind in');
 if enriched=source then raise exception 'unreviewed_volunteer_notification_projection';end if;
 execute enriched;
end $projection$;