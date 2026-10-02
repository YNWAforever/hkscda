revoke insert, update on public.supporter from public, anon, authenticated;
do $$
declare v_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
  from pg_attribute where attrelid='public.supporter'::regclass
    and attnum>0 and not attisdropped and attname<>'crm_assignee_user_id';
  execute format('grant insert (%s), update (%s) on public.supporter to authenticated',
    v_columns, v_columns);
end $$;

