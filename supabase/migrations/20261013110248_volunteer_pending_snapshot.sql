-- One read-only projection for overview counts and every pending scope.
create function public.volunteer_pending_snapshot(p_actor uuid, p_scope text, p_page integer, p_page_size integer, p_as_of timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if not exists(select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id where a.auth_user_id=p_actor and a.role in('staff','admin') and a.status='active' and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=clock_timestamp())) then
  raise exception 'volunteer_forbidden' using errcode='42501';
 end if;
 if p_scope is null or p_scope not in('upcoming','overdue','all') or p_page is null or p_page not between 1 and 100000 or p_page_size is null or p_page_size not between 0 and 100 or p_as_of is null then
  raise exception 'invalid_pending_query' using errcode='22023';
 end if;
 return (
  with pending as materialized (
   select r.id,r.contact_name,a.id activity_id,a.title,a.starts_at
   from public.volunteer_registration r join public.volunteer_activity a on a.id=r.activity_id where r.status='pending'
  ), totals as (
   select count(*) filter(where starts_at>p_as_of) upcoming,count(*) filter(where starts_at<=p_as_of) overdue,count(*) total from pending
  ), page_rows as (
   select * from pending where p_scope='all' or (p_scope='upcoming' and starts_at>p_as_of) or (p_scope='overdue' and starts_at<=p_as_of)
   order by starts_at,id limit p_page_size offset (p_page-1)*p_page_size
  )
  select jsonb_build_object('counts',jsonb_build_object('upcoming',upcoming,'overdue',overdue,'total',total,'asOf',p_as_of),'registrations',(select coalesce(jsonb_agg(to_jsonb(r) order by r.starts_at,r.id),'[]'::jsonb) from page_rows r),'page',p_page,'pageSize',p_page_size) from totals
 );
end $$;
revoke all on function public.volunteer_pending_snapshot(uuid,text,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.volunteer_pending_snapshot(uuid,text,integer,integer,timestamptz) to service_role;
