-- Operational follow-up is separate from provider delivery evidence.
create table public.volunteer_task_completion (
 outbox_id uuid primary key references public.volunteer_operation_outbox(id), actor_user_id uuid not null references auth.users(id),
 reason text not null check(length(trim(reason)) between 1 and 1000), completed_at timestamptz not null default clock_timestamp()
);
alter table public.volunteer_task_completion enable row level security;
revoke all on public.volunteer_task_completion from public,anon,authenticated,service_role;
grant select on public.volunteer_task_completion to service_role;
create trigger immutable_task_completion before update or delete on public.volunteer_task_completion for each row execute function public.volunteer_immutable_fact();
create function public.volunteer_policy_contact_tasks() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.starts_at>clock_timestamp() and (old.starts_at,old.ends_at,old.status,old.policy_version_id) is distinct from(new.starts_at,new.ends_at,new.status,new.policy_version_id) then
 insert into public.volunteer_operation_outbox(dedup_key,kind,payload)
 select 'session-change:'||new.id||':'||new.updated_at||':'||r.id,'volunteer_policy_contact',jsonb_build_object('activity_id',new.id,'registration_id',r.id,'before',jsonb_build_object('starts_at',old.starts_at,'ends_at',old.ends_at,'status',old.status,'policy_version_id',old.policy_version_id),'after',jsonb_build_object('starts_at',new.starts_at,'ends_at',new.ends_at,'status',new.status,'policy_version_id',new.policy_version_id)) from public.volunteer_registration r where r.activity_id=new.id and r.status in('approved','pending','waitlisted') on conflict(dedup_key) do nothing;
 end if;return new;
end $$;
create trigger volunteer_policy_contact_followup after update on public.volunteer_activity for each row execute function public.volunteer_policy_contact_tasks();
create function public.volunteer_task_command(p_actor uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare task public.volunteer_operation_outbox%rowtype; prior public.volunteer_task_completion%rowtype;
begin
 if not exists(select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id where a.auth_user_id=p_actor and a.role in('staff','admin') and a.status='active' and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=clock_timestamp())) then raise exception 'volunteer_forbidden' using errcode='42501';end if;
 if p_command->>'action'='list' then
 return jsonb_build_object('tasks',(select coalesce(jsonb_agg(x order by created_at desc),'[]') from(select o.id,o.kind,o.created_at,o.payload,r.id registration_id,r.contact_name,coalesce(a.id,(o.payload->>'activity_id')::uuid) activity_id,a.title,a.starts_at from public.volunteer_operation_outbox o left join public.volunteer_registration r on r.id=(o.payload->>'registration_id')::uuid left join public.volunteer_activity a on a.id=coalesce(r.activity_id,(o.payload->>'activity_id')::uuid) where o.kind in('volunteer_booking_changed','volunteer_qualification_review','volunteer_operation_changed','volunteer_policy_contact') and not exists(select 1 from public.volunteer_task_completion c where c.outbox_id=o.id) order by o.created_at desc limit 500)x),
 'notifications',(select coalesce(jsonb_agg(x order by created_at desc),'[]') from(select id,kind,status,last_error,attempts,created_at,payload->>'profile_id' profile_id from public.volunteer_operation_outbox where kind in('volunteer_monthly_assessment_notification','volunteer_policy_reminder') order by created_at desc limit 100)x),
 'pending',(select coalesce(jsonb_agg(x order by starts_at),'[]') from(select r.id,r.contact_name,a.id activity_id,a.title,a.starts_at from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id where r.status='pending' and a.starts_at>clock_timestamp() order by a.starts_at limit 200)x));
 elsif p_command->>'action'='retry' then return jsonb_build_object('kind',case when public.retry_volunteer_operation_outbox(p_actor,(p_command->>'id')::uuid) then 'retried' else 'conflict' end);
 elsif p_command->>'action'='complete' then
 if length(trim(coalesce(p_command->>'reason',''))) not between 1 and 1000 then raise exception 'task_reason_required' using errcode='22023';end if;
 select * into task from public.volunteer_operation_outbox where id=(p_command->>'id')::uuid for update;
 if not found or task.kind not in('volunteer_booking_changed','volunteer_qualification_review','volunteer_operation_changed','volunteer_policy_contact') then return jsonb_build_object('kind','not_found');end if;
 select * into prior from public.volunteer_task_completion where outbox_id=task.id;
 if found then return jsonb_build_object('kind',case when prior.reason=trim(p_command->>'reason') then 'completed' else 'conflict' end);end if;
 insert into public.volunteer_task_completion(outbox_id,actor_user_id,reason) values(task.id,p_actor,trim(p_command->>'reason'));
 insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_task.completed','volunteer_operation_outbox',task.id::text,jsonb_build_object('reason',trim(p_command->>'reason')));
 return jsonb_build_object('kind','completed');
 end if;raise exception 'invalid_task_command' using errcode='22023';
end $$;
revoke all on function public.volunteer_task_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_task_command(uuid,jsonb) to service_role;
