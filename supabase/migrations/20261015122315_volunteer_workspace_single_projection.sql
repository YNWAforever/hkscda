-- Reuse the same eligibility projection for the total and page. The previous
-- two calls both computed registration counts and policy eligibility for every
-- matching activity, even though the browser only displays one page.
-- Patch only this branch so subsequent authorization/mutation fixes survive.
do $migration$
declare
  definition text := pg_get_functiondef('public.volunteer_bulk_command(uuid,jsonb)'::regprocedure);
  old_branch text := $old$  select count(*) into n from public.volunteer_activity_workspace_rows(p_command->'filter');
  select coalesce(jsonb_agg(item),'[]') into items from(select item from public.volunteer_activity_workspace_rows(p_command->'filter') order by case when p_command#>>'{filter,sort}'='desc' then item->>'starts_at' end desc,case when coalesce(p_command#>>'{filter,sort}','asc')='asc' then item->>'starts_at' end,item->>'id' limit 25 offset greatest(coalesce((p_command->>'page')::int,1)-1,0)*25)x;$old$;
  new_branch text := $new$  with workspace as materialized (
   select item from public.volunteer_activity_workspace_rows(p_command->'filter')
  )
  select (select count(*) from workspace),
   (select coalesce(jsonb_agg(item),'[]') from (
    select item from workspace
    order by case when p_command#>>'{filter,sort}'='desc' then item->>'starts_at' end desc,
     case when coalesce(p_command#>>'{filter,sort}','asc')='asc' then item->>'starts_at' end,
     item->>'id'
    limit 25 offset greatest(coalesce((p_command->>'page')::int,1)-1,0)*25
   ) page_rows)
  into n,items;$new$;
begin
  if (length(definition) - length(replace(definition, old_branch, ''))) <> length(old_branch) then
    raise exception 'Expected exactly one unmodified volunteer workspace list branch';
  end if;
  execute replace(definition, old_branch, new_branch);
end
$migration$;
