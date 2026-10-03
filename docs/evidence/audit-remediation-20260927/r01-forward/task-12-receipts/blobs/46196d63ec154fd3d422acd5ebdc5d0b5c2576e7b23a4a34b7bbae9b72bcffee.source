create table public.volunteer_shelter_definition (
 key text primary key check(key~'^[a-z][a-z0-9_-]{0,79}$' and key not in('all','common')),
 label text not null check(length(trim(label)) between 1 and 150),timezone text not null,location text not null,
 revision bigint not null default 1,updated_by uuid references auth.users(id),updated_at timestamptz not null default clock_timestamp()
);
insert into public.volunteer_shelter_definition(key,label,timezone,location) values('cat','貓舍','Asia/Hong_Kong','貓舍'),('dog','狗舍','Asia/Hong_Kong','狗舍'),('adoption','領養日','Asia/Hong_Kong','領養日場地');
alter table public.volunteer_credential_definition add column revision bigint not null default 1,add column updated_by uuid references auth.users(id),add column updated_at timestamptz not null default clock_timestamp();
create table public.volunteer_policy_source_version (
 id uuid primary key default gen_random_uuid(),scope_key text not null,revision bigint not null,body jsonb not null,effective_body jsonb not null,provenance jsonb not null,
 published_by uuid not null references auth.users(id),reason text not null,created_at timestamptz not null default clock_timestamp(),unique(scope_key,revision)
);
create table public.volunteer_policy_source (
 scope_key text primary key,current_version_id uuid not null references public.volunteer_policy_source_version(id),revision bigint not null
);
create table public.volunteer_policy_source_preview (
 id uuid primary key default gen_random_uuid(),actor_user_id uuid not null references auth.users(id),scope_key text not null,expected_revision bigint not null,
 template_key text not null,draft_revision bigint not null,body jsonb not null,effective_body jsonb not null,provenance jsonb not null,source_revisions jsonb not null,expires_at timestamptz not null
);
alter table public.volunteer_policy_version add column provenance jsonb not null default '{}';
alter table public.volunteer_shelter_definition enable row level security;
alter table public.volunteer_policy_source enable row level security;
alter table public.volunteer_policy_source_version enable row level security;
alter table public.volunteer_policy_source_preview enable row level security;
revoke all on public.volunteer_shelter_definition,public.volunteer_policy_source,public.volunteer_policy_source_version,public.volunteer_policy_source_preview from public,anon,authenticated,service_role;
grant select on public.volunteer_shelter_definition,public.volunteer_policy_source,public.volunteer_policy_source_version,public.volunteer_policy_source_preview to service_role;
create trigger immutable_source_version before update or delete on public.volunteer_policy_source_version for each row execute function public.volunteer_immutable_fact();

create function public.volunteer_resolve_source_node(p_value jsonb,p_parent jsonb,p_path text,p_label text,p_parent_sources jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare k text;item jsonb;parent_item jsonb;part jsonb;output jsonb;sources jsonb:='{}';i integer:=0;begin
 if p_value='{"state":"inherit"}'::jsonb then
  return jsonb_build_object('value',coalesce(p_parent,jsonb_build_object('state','unresolved','reason','Inherited source missing')),'sources',jsonb_build_object(p_path,coalesce(p_parent_sources->>p_path,'inherited'))||coalesce((select jsonb_object_agg(key,value) from jsonb_each(p_parent_sources) where key like p_path||'.%'),'{}'::jsonb));
 end if;
 if jsonb_typeof(p_value)='object' and not(p_value?'state') then
  output:='{}';for k,item in select key,value from jsonb_each(p_value) loop
   part:=public.volunteer_resolve_source_node(item,p_parent->k,case when p_path='' then k else p_path||'.'||k end,p_label,p_parent_sources);
   output:=output||jsonb_build_object(k,part->'value');sources:=sources||(part->'sources');
  end loop;
 elsif jsonb_typeof(p_value)='array' then
  output:='[]';for item in select value from jsonb_array_elements(p_value) loop
   if jsonb_typeof(item)='object' and item?'key' then select value into parent_item from jsonb_array_elements(case when jsonb_typeof(p_parent)='array' then p_parent else '[]'::jsonb end) where value->>'key'=item->>'key';else parent_item:=p_parent->i;end if;
   part:=public.volunteer_resolve_source_node(item,parent_item,p_path||'.'||i::text,p_label,p_parent_sources);output:=output||jsonb_build_array(part->'value');sources:=sources||(part->'sources');i:=i+1;
  end loop;
  if i=0 then sources:=jsonb_build_object(p_path,p_label);end if;
 else output:=p_value;sources:=jsonb_build_object(p_path,p_label);
 end if;
 return jsonb_build_object('value',output,'sources',sources);
end $$;
create function public.volunteer_apply_source_fields(p_body jsonb,p_parent jsonb,p_label text,p_parent_sources jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare candidate jsonb:=p_body-'inheritance';path text;begin
 for path in select chosen.value from jsonb_array_elements_text(coalesce(p_body->'inheritance','[]'::jsonb)) chosen where not exists(select 1 from jsonb_array_elements_text(coalesce(p_body->'inheritance','[]'::jsonb)) ancestor where chosen.value like ancestor.value||'.%') order by length(chosen.value) loop
  candidate:=jsonb_set(candidate,string_to_array(path,'.'),'{"state":"inherit"}'::jsonb,true);
 end loop;
 return public.volunteer_resolve_source_node(candidate,p_parent,'',p_label,p_parent_sources);
end $$;
create function public.volunteer_resolve_policy(p_body jsonb,p_source_scope text default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare common_row public.volunteer_policy_source_version%rowtype;shelter_row public.volunteer_policy_source_version%rowtype;parent jsonb;resolved jsonb;revisions jsonb:='{}';begin
 select v.* into common_row from public.volunteer_policy_source s join public.volunteer_policy_source_version v on v.id=s.current_version_id where s.scope_key='common';
 if p_source_scope='common' then parent:=jsonb_build_object('value',null,'sources','{}'::jsonb);
 else
  parent:=public.volunteer_apply_source_fields(coalesce(common_row.body,'{}'::jsonb),null,'common','{}');
  revisions:=jsonb_build_object('common',common_row.id);
  if p_source_scope is null then
   select v.* into shelter_row from public.volunteer_policy_source s join public.volunteer_policy_source_version v on v.id=s.current_version_id where s.scope_key=p_body->>'shelter';
   if shelter_row.id is not null then parent:=public.volunteer_apply_source_fields(shelter_row.body,parent->'value','shelter',parent->'sources');end if;
   revisions:=revisions||jsonb_build_object('shelter',shelter_row.id);
  end if;
 end if;
 resolved:=public.volunteer_apply_source_fields(p_body,parent->'value',coalesce(p_source_scope,'template'),parent->'sources');
 return jsonb_build_object('body',resolved->'value','provenance',resolved->'sources','source_revisions',revisions);
end $$;
revoke all on function public.volunteer_resolve_source_node(jsonb,jsonb,text,text,jsonb),public.volunteer_apply_source_fields(jsonb,jsonb,text,jsonb),public.volunteer_resolve_policy(jsonb,text) from public,anon,authenticated,service_role;

create function public.volunteer_validate_policy_references(p jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare credential_key text;begin
 if not exists(select 1 from public.volunteer_shelter_definition where key=p->>'shelter') then return '["unknown_shelter"]'::jsonb;end if;
 for credential_key in select distinct value#>>'{}' from jsonb_path_query(p,'$.**.credentials.keys[*]') value loop
  if not exists(select 1 from public.volunteer_credential_definition where key=credential_key) then return jsonb_build_array('unknown_credential:'||credential_key);end if;
 end loop;
 return '[]'::jsonb;
end $$;
revoke all on function public.volunteer_validate_policy_references(jsonb) from public,anon,authenticated,service_role;

create function public.volunteer_policy_source_command(p_actor uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=p_command->>'action';stamp timestamptz;kind text;registry_key text;new_id uuid;current_revision bigint;d public.volunteer_policy_draft%rowtype;preview public.volunteer_policy_source_preview%rowtype;prior public.volunteer_command_result%rowtype;resolved jsonb;issues jsonb;result jsonb;hash text:=md5(p_command::text);begin
 perform public.volunteer_policy_admin(p_actor);perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));stamp:=clock_timestamp();
 if jsonb_typeof(p_command)<>'object' or exists(select 1 from jsonb_object_keys(p_command) k where k<>all(case action when 'list' then array['action'] when 'resolve' then array['action','body'] when 'registry_save' then array['action','kind','key','label','timezone','location','expected_revision','reason'] when 'preview_source' then array['action','scope_key','template_key','draft_revision','expected_revision'] when 'publish_source' then array['action','preview_id','idempotency_key','reason'] else array[]::text[] end)) then raise exception 'invalid_source_command' using errcode='22023';end if;

 if action='list' then
  return jsonb_build_object('shelters',(select coalesce(jsonb_agg(to_jsonb(s) order by s.key),'[]'::jsonb) from public.volunteer_shelter_definition s),'credentials',(select coalesce(jsonb_agg(to_jsonb(c) order by c.label),'[]'::jsonb) from public.volunteer_credential_definition c),'sources',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('body',v.body,'effective_body',v.effective_body)),'[]'::jsonb) from public.volunteer_policy_source s join public.volunteer_policy_source_version v on v.id=s.current_version_id),'drafts',(select coalesce(jsonb_agg(jsonb_build_object('template_key',x.template_key,'name',x.body->>'name','revision',x.revision)),'[]'::jsonb) from public.volunteer_policy_draft x));
 elsif action='resolve' then
  if jsonb_array_length(public.volunteer_validate_policy_shape(p_command->'body'))>0 then raise exception 'invalid_policy_structure' using errcode='22023';end if;
  return public.volunteer_resolve_policy(p_command->'body');
 elsif action='registry_save' then
  registry_key:=p_command->>'key';kind:=p_command->>'kind';
  if registry_key is null or registry_key!~'^[a-z][a-z0-9_-]{0,79}$' or registry_key in('all','common') or length(trim(coalesce(p_command->>'label',''))) not between 1 and 150 or length(trim(coalesce(p_command->>'reason','')))=0 then raise exception 'invalid_registry' using errcode='22023';end if;
  if kind='shelter' then
   if not exists(select 1 from pg_timezone_names where name=p_command->>'timezone') or length(trim(coalesce(p_command->>'location',''))) not between 1 and 200 then raise exception 'invalid_shelter_metadata' using errcode='22023';end if;
   select revision into current_revision from public.volunteer_shelter_definition where key=registry_key;
   if coalesce(current_revision,0) is distinct from (p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict');end if;
   insert into public.volunteer_shelter_definition(key,label,timezone,location,updated_by) values(registry_key,p_command->>'label',p_command->>'timezone',p_command->>'location',p_actor) on conflict(key) do update set label=excluded.label,timezone=excluded.timezone,location=excluded.location,revision=volunteer_shelter_definition.revision+1,updated_by=p_actor,updated_at=stamp;
  elsif kind='credential' then
   select revision into current_revision from public.volunteer_credential_definition where key=registry_key;
   if coalesce(current_revision,0) is distinct from (p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict');end if;
   insert into public.volunteer_credential_definition(key,label,updated_by) values(registry_key,p_command->>'label',p_actor) on conflict(key) do update set label=excluded.label,revision=volunteer_credential_definition.revision+1,updated_by=p_actor,updated_at=stamp;
  else raise exception 'invalid_registry_kind' using errcode='22023';end if;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_registry.saved',kind,registry_key,p_command-'action');return jsonb_build_object('kind','saved');
 elsif action='preview_source' then
  registry_key:=p_command->>'scope_key';
  if registry_key<>'common' and not exists(select 1 from public.volunteer_shelter_definition where key=registry_key) then raise exception 'unknown_shelter' using errcode='22023';end if;
  select revision into current_revision from public.volunteer_policy_source where scope_key=registry_key;
  if coalesce(current_revision,0) is distinct from (p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict');end if;
  select * into d from public.volunteer_policy_draft where template_key=p_command->>'template_key';
  if not found then return jsonb_build_object('kind','not_found');end if;
  if d.revision is distinct from (p_command->>'draft_revision')::bigint then return jsonb_build_object('kind','conflict');end if;
  resolved:=public.volunteer_resolve_policy(d.body,registry_key);issues:=public.volunteer_validate_policy(resolved->'body');
  if jsonb_array_length(issues)>0 then return jsonb_build_object('kind','invalid','issues',issues);end if;
  insert into public.volunteer_policy_source_preview(actor_user_id,scope_key,expected_revision,template_key,draft_revision,body,effective_body,provenance,source_revisions,expires_at) values(p_actor,registry_key,coalesce(current_revision,0),d.template_key,d.revision,d.body,resolved->'body',resolved->'provenance',resolved->'source_revisions',stamp+interval '5 minutes') returning id into new_id;
  return jsonb_build_object('kind','preview','preview_id',new_id,'effective_body',resolved->'body','provenance',resolved->'provenance','affected_templates',(select coalesce(jsonb_agg(jsonb_build_object('template_key',x.template_key,'name',x.body->>'name')),'[]'::jsonb) from public.volunteer_policy_draft x where (registry_key='common' or x.body->>'shelter'=registry_key) and (jsonb_array_length(coalesce(x.body->'inheritance','[]'::jsonb))>0 or jsonb_path_exists(x.body,'$.** ? (@.state == "inherit")'))),'notice','Existing published sessions retain immutable snapshots');
 elsif action='publish_source' then
  select * into prior from public.volunteer_command_result where actor_user_id=p_actor and operation='source_publish' and idempotency_key=(p_command->>'idempotency_key')::uuid;
  if found then if prior.payload_hash<>hash then return jsonb_build_object('kind','conflict');end if;return prior.result;end if;
  select * into preview from public.volunteer_policy_source_preview where id=(p_command->>'preview_id')::uuid and actor_user_id=p_actor;
  if not found then return jsonb_build_object('kind','not_found');end if;
  select revision into current_revision from public.volunteer_policy_source where scope_key=preview.scope_key;
  select * into d from public.volunteer_policy_draft where template_key=preview.template_key;
  resolved:=public.volunteer_resolve_policy(preview.body,preview.scope_key);
  if coalesce(current_revision,0)<>preview.expected_revision or d.revision<>preview.draft_revision or preview.expires_at<=stamp or resolved->'source_revisions'<>preview.source_revisions or resolved->'body'<>preview.effective_body then return jsonb_build_object('kind','conflict');end if;
  if length(trim(coalesce(p_command->>'reason','')))=0 then raise exception 'reason_required' using errcode='22023';end if;
  insert into public.volunteer_policy_source_version(scope_key,revision,body,effective_body,provenance,published_by,reason) values(preview.scope_key,preview.expected_revision+1,preview.body,preview.effective_body,preview.provenance,p_actor,p_command->>'reason') returning id into new_id;
  insert into public.volunteer_policy_source(scope_key,current_version_id,revision) values(preview.scope_key,new_id,preview.expected_revision+1) on conflict(scope_key) do update set current_version_id=excluded.current_version_id,revision=excluded.revision;
  result:=jsonb_build_object('kind','published','version_id',new_id,'revision',preview.expected_revision+1);
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_source.published','volunteer_policy_source',new_id::text,result||jsonb_build_object('reason',p_command->>'reason'));
  insert into public.volunteer_command_result(actor_user_id,operation,idempotency_key,payload_hash,result) values(p_actor,'source_publish',(p_command->>'idempotency_key')::uuid,hash,result);return result;
 end if;
 raise exception 'invalid_source_command' using errcode='22023';
end $$;
revoke all on function public.volunteer_policy_source_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.volunteer_policy_source_command(uuid,jsonb) to service_role;

create or replace function public.volunteer_validate_policy(p jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare issues jsonb:='[]'; r jsonb; total integer; reserved integer; minimum integer; key_name text;
begin
 issues:=public.volunteer_validate_policy_shape(p);
 if jsonb_array_length(issues)>0 then return issues; end if;
 issues:=issues||public.volunteer_validate_policy_references(p);
 issues:=issues||public.volunteer_validate_daily_policy(p);
 if jsonb_array_length(issues)>0 then return issues; end if;
 if jsonb_typeof(p)<>'object' or p->>'schema_version'<>'1' then return '["invalid_schema"]'::jsonb; end if;
 for key_name in select jsonb_object_keys(p) loop
 if not key_name=any(array['schema_version','template_key','name','shelter','timezone','schedule','capacity','eligibility','roles','tier_quotas','daily_limits','release_rules','booking','remarks','terms','source']) then issues:=issues||jsonb_build_array('unknown_field:'||key_name); end if; end loop;
 if jsonb_path_exists(p,'$.** ? (@.state == "unresolved" || @.state == "inherit")') then issues:=issues||'["unresolved_settings"]'::jsonb; end if;
 if p#>>'{capacity,volunteers,state}'<>'value' or (p#>>'{capacity,volunteers,value}')::integer<=0 then issues:=issues||'["invalid_capacity"]'::jsonb; end if;
 total:=(p#>>'{capacity,volunteers,value}')::integer;
 if p#>>'{schedule,start_time}'>=p#>>'{schedule,end_time}' then issues:=issues||'["invalid_time_range"]'::jsonb; end if;
 if not exists(select 1 from pg_timezone_names where name=p->>'timezone') then issues:=issues||'["invalid_timezone"]'::jsonb; end if;
 if jsonb_array_length(p#>'{eligibility,allowed_tiers}')=0 or not ((p#>'{eligibility,allowed_tiers}') <@ '["newcomer","regular","senior"]'::jsonb) then issues:=issues||'["invalid_tiers"]'::jsonb; end if;
 if (p#>>'{eligibility,min_age}')::integer<0 or (p#>>'{eligibility,min_age}')::integer>120 then issues:=issues||'["invalid_min_age"]'::jsonb; end if;
 if (p#>>'{remarks,max_length}')::integer<1 or (p#>>'{remarks,max_length}')::integer>5000 then issues:=issues||'["invalid_remarks"]'::jsonb; end if;
 select coalesce(sum((value->>'reserved')::integer),0),coalesce(sum((value->>'minimum')::integer),0) into reserved,minimum from jsonb_array_elements(p->'roles');
 if p#>>'{capacity,role_count_model}'='leader_in_assistants' then reserved:=reserved-coalesce((select (r->>'reserved')::integer from jsonb_array_elements(p->'roles') r where r->>'key'='leader'),0); minimum:=minimum-coalesce((select (r->>'minimum')::integer from jsonb_array_elements(p->'roles') r where r->>'key'='leader'),0); end if;
 if reserved>total or minimum>total then issues:=issues||'["impossible_core_capacity"]'::jsonb; end if;
 for r in select value from jsonb_array_elements(p->'roles') loop
 if (r->>'reserved')::integer<0 or (r->>'minimum')::integer<0 or (r#>>'{maximum,state}'='value' and ((r#>>'{maximum,value}')::integer<greatest((r->>'reserved')::integer,(r->>'minimum')::integer))) then issues:=issues||'["invalid_role_quota"]'::jsonb; end if;
 end loop;
 for r in select value from jsonb_array_elements(p->'release_rules') loop
 if r#>>'{action,type}' not in ('release_reserved','relax_quota') or r#>>'{condition,operator}' not in ('lt','lte') or (r->>'within_hours')::integer<0 or (r#>>'{condition,threshold}')::integer<0 then issues:=issues||'["invalid_release"]'::jsonb; end if;
 if r#>>'{action,type}'='release_reserved' and not exists(select 1 from jsonb_array_elements(p->'roles') pool where pool->>'key'=r#>>'{action,pool}' and (pool->>'reserved')::integer>=(r#>>'{action,quantity}')::integer and (r#>>'{action,quantity}')::integer>=0) then issues:=issues||'["invalid_release_pool"]'::jsonb; end if;
 end loop;
 return issues;
exception when others then return '["invalid_policy_value"]'::jsonb;
end $$;

create or replace function public.volunteer_policy_command(p_actor uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=p_command->>'action'; d public.volunteer_policy_draft%rowtype; prev public.volunteer_policy_preview%rowtype;
 version_row public.volunteer_policy_version%rowtype; command_row public.volunteer_command_result%rowtype;
 body jsonb; manifest jsonb; issues jsonb; result jsonb; current_clock timestamptz; new_id uuid; template text; starts timestamptz; ends timestamptz;
 effective timestamptz; until_time timestamptz; target uuid; ids jsonb; payload_hash text:=md5(p_command::text); q jsonb; daily_key text; existing_daily jsonb; resolution jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 perform public.volunteer_policy_admin(p_actor);
 current_clock:=clock_timestamp();
 if action in ('publish','generate') then
  select * into command_row from public.volunteer_command_result where actor_user_id=p_actor and operation=action and idempotency_key=(p_command->>'idempotency_key')::uuid;
  if found then if command_row.payload_hash<>payload_hash then return jsonb_build_object('kind','conflict','reason','idempotency_payload_changed'); end if; return command_row.result; end if;
 end if;
 if action='list' then
  return jsonb_build_object('drafts',(select coalesce(jsonb_agg(to_jsonb(x) order by template_key),'[]') from public.volunteer_policy_draft x),
   'versions',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]') from public.volunteer_policy_version x),
   'activities',(select coalesce(jsonb_agg(to_jsonb(x) order by starts_at),'[]') from (select a.id,a.title,a.starts_at,a.ends_at,a.capacity,a.policy_version_id,a.policy_revision,a.template_key,a.shelter_key,
   coalesce((select sum(participant_count) from public.volunteer_registration where activity_id=a.id and status='approved'),0) approved_participants,
   coalesce((select sum(participant_count) from public.volunteer_registration where activity_id=a.id and status='waitlisted'),0) waitlisted_participants from public.volunteer_activity a where a.starts_at>current_clock order by a.starts_at limit 500) x));
 elsif action in ('save','copy') then
  body:=p_command->'body'; template:=p_command->>'template_key';
  if action='copy' then select * into version_row from public.volunteer_policy_version where id=(p_command->>'version_id')::uuid; if not found then return jsonb_build_object('kind','not_found'); end if; body:=version_row.body; template:=version_row.template_key; end if;
  if body->>'template_key' is distinct from template or body->>'schema_version'<>'1' then raise exception 'invalid_policy' using errcode='22023'; end if;
  if jsonb_array_length(public.volunteer_validate_policy_shape(body))>0 then raise exception 'invalid_policy_structure' using errcode='22023';end if;
  select * into d from public.volunteer_policy_draft where template_key=template for update;
  if coalesce(d.revision,0) is distinct from (p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict','current',to_jsonb(d)); end if;
  insert into public.volunteer_policy_draft(template_key,body,revision,updated_by) values(template,body,1,p_actor)
  on conflict(template_key) do update set body=excluded.body,revision=volunteer_policy_draft.revision+1,updated_by=p_actor,updated_at=current_clock returning * into d;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_policy.draft_saved','volunteer_policy',template,jsonb_build_object('revision',d.revision));
  return jsonb_build_object('kind','saved','draft',to_jsonb(d));
 elsif action='preview' then
  select * into d from public.volunteer_policy_draft where template_key=p_command->>'template_key' for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  if d.revision is distinct from (p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict','current',to_jsonb(d)); end if;
  resolution:=public.volunteer_resolve_policy(d.body);body:=resolution->'body';
  issues:=public.volunteer_validate_policy(body);
  if jsonb_array_length(issues)>0 then return jsonb_build_object('kind','invalid','issues',issues); end if;
  effective:=(p_command->>'effective_from')::timestamptz; until_time:=(p_command->>'effective_until')::timestamptz;
  if effective<current_clock or (until_time is not null and until_time<=effective) then return jsonb_build_object('kind','invalid','issues','["invalid_effective_range"]'::jsonb); end if;
  ids:=p_command->'activity_ids';
  if jsonb_array_length(ids)>100 or (select count(distinct value) from jsonb_array_elements_text(ids))<>jsonb_array_length(ids) then raise exception 'invalid_targets' using errcode='22023'; end if;
  manifest:=public.volunteer_policy_manifest(ids,body,current_clock);
  if jsonb_array_length(manifest)<>jsonb_array_length(ids) then return jsonb_build_object('kind','invalid','issues','["missing_activity"]'::jsonb); end if;
  if exists(select 1 from jsonb_array_elements(manifest) m where jsonb_array_length(m->'conflicts')>0) then return jsonb_build_object('kind','invalid','manifest',manifest,'issues','["session_conflicts"]'::jsonb); end if;
  if exists(select 1 from public.volunteer_activity where id in(select value::uuid from jsonb_array_elements_text(ids)) and (starts_at<effective or (until_time is not null and starts_at>=until_time) or (template_key is not null and template_key<>d.template_key))) then return jsonb_build_object('kind','invalid','issues','["target_outside_scope"]'::jsonb); end if;
  insert into public.volunteer_policy_preview(actor_user_id,template_key,draft_revision,candidate,manifest,fingerprint,expires_at) values(p_actor,d.template_key,d.revision,jsonb_build_object('body',body,'provenance',resolution->'provenance','source_revisions',resolution->'source_revisions','effective_from',effective,'effective_until',until_time,'activity_ids',ids),manifest,public.volunteer_policy_fingerprint(manifest),current_clock+interval '5 minutes') returning id into new_id;
  return jsonb_build_object('kind','preview','preview_id',new_id,'candidate',body,'provenance',resolution->'provenance','manifest',manifest,'issues',issues,'previous',(select pv.body from public.volunteer_policy_version pv where pv.template_key=d.template_key order by pv.created_at desc limit 1));
 elsif action='publish' then
  select * into prev from public.volunteer_policy_preview where id=(p_command->>'preview_id')::uuid and actor_user_id=p_actor for update;
  if not found then return jsonb_build_object('kind','not_found'); end if;
  select * into d from public.volunteer_policy_draft where template_key=prev.template_key for update;
  resolution:=public.volunteer_resolve_policy(d.body);
  if resolution->'source_revisions' is distinct from prev.candidate->'source_revisions' or resolution->'body' is distinct from prev.candidate->'body' then return jsonb_build_object('kind','conflict','reason','source_changed');end if;
  body:=prev.candidate->'body'; ids:=prev.candidate->'activity_ids'; effective:=(prev.candidate->>'effective_from')::timestamptz; until_time:=(prev.candidate->>'effective_until')::timestamptz;
  manifest:=public.volunteer_policy_manifest(ids,body,current_clock);
  if d.revision<>prev.draft_revision or prev.expires_at<=current_clock or public.volunteer_policy_fingerprint(manifest)<>prev.fingerprint then return jsonb_build_object('kind','conflict','current',to_jsonb(d),'manifest',manifest); end if;
  issues:=public.volunteer_validate_policy(body);
  if jsonb_array_length(issues)>0 or effective<current_clock then return jsonb_build_object('kind','invalid','issues',issues); end if;
  if length(trim(coalesce(p_command->>'reason','')))=0 then raise exception 'publication_reason_required' using errcode='22023'; end if;
  -- A new schedule closes a previous open interval prospectively; version contents never change.
  if exists(select 1 from public.volunteer_policy_schedule where template_key=d.template_key and effective_from>effective and (until_time is null or effective_from<until_time)) then return jsonb_build_object('kind','invalid','issues','["future_schedule_overlap"]'::jsonb); end if;
  insert into public.volunteer_policy_version(template_key,body,content_hash,effective_from,effective_until,published_by,reason,provenance) values(d.template_key,body,md5(body::text),effective,until_time,p_actor,p_command->>'reason',jsonb_build_object('fields',prev.candidate->'provenance','source_revisions',prev.candidate->'source_revisions')) returning id into new_id;
  update public.volunteer_policy_schedule set effective_until=effective where template_key=d.template_key and effective_from<effective and (effective_until is null or effective_until>effective);
  insert into public.volunteer_policy_schedule(template_key,effective_from,effective_until,version_id) values(d.template_key,effective,until_time,new_id) on conflict(template_key,effective_from) do update set effective_until=excluded.effective_until,version_id=excluded.version_id;
  perform set_config('hkscda.policy_command','apply',true);
  for target in select value::uuid from jsonb_array_elements_text(ids) order by value loop
   update public.volunteer_activity set starts_at=((((starts_at at time zone (body->>'timezone'))::date)+(body#>>'{schedule,start_time}')::time) at time zone (body->>'timezone')),ends_at=((((starts_at at time zone (body->>'timezone'))::date)+(body#>>'{schedule,end_time}')::time) at time zone (body->>'timezone')),location=body#>>'{schedule,location}',policy_version_id=new_id,policy_revision=policy_revision+1,template_key=d.template_key,shelter_key=body->>'shelter',capacity=(body#>>'{capacity,volunteers,value}')::integer,min_age=(body#>>'{eligibility,min_age}')::integer,auto_approve=(body#>>'{booking,auto_approve}')::boolean,allow_waitlist=(body#>>'{booking,allow_waitlist}')::boolean where id=target;
  end loop;
  perform set_config('hkscda.policy_command','',true);
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_policy.published','volunteer_policy',new_id::text,jsonb_build_object('manifest',manifest,'reason',p_command->>'reason','hash',md5(body::text)));
  result:=jsonb_build_object('kind','published','version_id',new_id,'activity_ids',ids);
 elsif action='generate' then
  template:=p_command->>'template_key';
  select v.* into version_row from public.volunteer_policy_schedule s join public.volunteer_policy_version v on v.id=s.version_id
   where s.template_key=template and (((p_command->>'date')::date+(v.body#>>'{schedule,start_time}')::time) at time zone (v.body->>'timezone'))>=s.effective_from
   and (s.effective_until is null or (((p_command->>'date')::date+(v.body#>>'{schedule,start_time}')::time) at time zone (v.body->>'timezone'))<s.effective_until) order by s.effective_from desc limit 1;
  if not found then return jsonb_build_object('kind','invalid','issues','["no_published_policy_for_date"]'::jsonb); end if;
  body:=version_row.body; starts:=((p_command->>'date')::date+(body#>>'{schedule,start_time}')::time) at time zone (body->>'timezone'); ends:=((p_command->>'date')::date+(body#>>'{schedule,end_time}')::time) at time zone (body->>'timezone');
  if starts<=current_clock or not (body#>>'{schedule,enabled}')::boolean or not (body#>'{schedule,weekdays}' @> jsonb_build_array(extract(dow from starts at time zone (body->>'timezone'))::integer)) or body#>'{schedule,excluded_dates}' ? (p_command->>'date') then return jsonb_build_object('kind','invalid','issues','["date_closed"]'::jsonb); end if;
  if exists(select 1 from public.volunteer_activity where template_key=template and starts_at=starts) then return jsonb_build_object('kind','conflict','reason','session_already_generated'); end if;
  perform public.volunteer_bind_daily_policy(body,(p_command->>'date')::date);
  insert into public.volunteer_activity(type,title,starts_at,ends_at,location,capacity,min_age,auto_approve,allow_waitlist,status,registration_modes,policy_version_id,policy_revision,template_key,shelter_key)
   values('volunteer_shift',body->>'name',starts,ends,body#>>'{schedule,location}',(body#>>'{capacity,volunteers,value}')::integer,(body#>>'{eligibility,min_age}')::integer,(body#>>'{booking,auto_approve}')::boolean,(body#>>'{booking,allow_waitlist}')::boolean,'published',array['individual'],version_row.id,1,template,body->>'shelter') returning id into new_id;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'volunteer_activity.generated','volunteer_activity',new_id::text,jsonb_build_object('policy_version_id',version_row.id));
  result:=jsonb_build_object('kind','generated','activity_id',new_id);
 else raise exception 'invalid_policy_command' using errcode='22023'; end if;
 insert into public.volunteer_command_result(actor_user_id,operation,idempotency_key,payload_hash,result) values(p_actor,action,(p_command->>'idempotency_key')::uuid,payload_hash,result);
 return result;
end $$;

create or replace function public.volunteer_policy_simulation(p_actor uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare action text:=p_command->>'action';d public.volunteer_policy_draft%rowtype;a public.volunteer_activity%rowtype;v_id uuid;result jsonb;issues jsonb;simulated_at timestamptz;begin
 if not exists(select 1 from public.admin_user where auth_user_id=p_actor and status='active' and role='admin') then raise exception 'volunteer_forbidden' using errcode='42501';end if;
 if action='list' then
  if exists(select 1 from jsonb_object_keys(p_command) k where k<>'action') then raise exception 'invalid_simulation_command' using errcode='22023';end if;
  return jsonb_build_object('kind','listed','drafts',(select coalesce(jsonb_agg(jsonb_build_object('template_key',x.template_key,'name',x.body->>'name','revision',x.revision,'roles',case when jsonb_array_length(x.body->'roles')=0 then '[{"key":"volunteer","label":"一般義工"}]'::jsonb else x.body->'roles' end) order by x.template_key),'[]'::jsonb) from public.volunteer_policy_draft x),
   'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.display_name,'tier',x.tier) order by x.display_name),'[]'::jsonb) from public.volunteer_profile x where x.status='active' and x.verified_at is not null),
   'activities',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'starts_at',x.starts_at,'template_key',x.template_key) order by x.starts_at),'[]'::jsonb) from public.volunteer_activity x where x.policy_version_id is not null and x.starts_at>clock_timestamp() and x.status='published'));
 end if;
 if action<>'simulate' or exists(select 1 from jsonb_object_keys(p_command) k where k not in('action','template_key','draft_revision','activity_id','profile_id','role','simulation_time')) then raise exception 'invalid_simulation_command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('volunteer-domain',0));
 select * into d from public.volunteer_policy_draft where template_key=p_command->>'template_key';
 if not found then return jsonb_build_object('kind','not_found');end if;
 if d.revision is distinct from (p_command->>'draft_revision')::bigint then return jsonb_build_object('kind','conflict');end if;
 d.body:=public.volunteer_resolve_policy(d.body)->'body';
 issues:=public.volunteer_validate_policy(d.body);if jsonb_array_length(issues)>0 then return jsonb_build_object('kind','denied','reason','draft_not_ready','issues',issues);end if;
 select * into a from public.volunteer_activity where id=(p_command->>'activity_id')::uuid;
 if not found or a.policy_version_id is null then return jsonb_build_object('kind','not_found');end if;
 if a.shelter_key<>d.body->>'shelter' then return jsonb_build_object('kind','denied','reason','shelter_mismatch');end if;
 if not exists(select 1 from public.volunteer_profile where id=(p_command->>'profile_id')::uuid and status='active' and verified_at is not null) then return jsonb_build_object('kind','denied','reason','verified_profile_required');end if;
 simulated_at:=(p_command->>'simulation_time')::timestamptz;if simulated_at is null or not isfinite(simulated_at) then raise exception 'simulation_time_required' using errcode='22023';end if;
 begin
  insert into public.volunteer_policy_version(template_key,body,content_hash,effective_from,published_by,reason) values(d.template_key,d.body,md5(d.body::text),simulated_at,p_actor,'Rolled-back simulation') returning id into v_id;
  perform set_config('hkscda.policy_command','apply',true);
  update public.volunteer_activity set policy_version_id=v_id,template_key=d.template_key,policy_revision=policy_revision+1 where id=a.id;
  perform public.volunteer_bind_daily_policy(d.body,(a.starts_at at time zone (d.body->>'timezone'))::date);
  result:=public.volunteer_policy_evaluate(a.id,(p_command->>'profile_id')::uuid,p_command->>'role',simulated_at);
  raise exception 'rollback_simulation' using errcode='PZ002';
 exception when sqlstate 'PZ002' then null;
 when sqlstate '22023' then result:=jsonb_build_object('allowed',false,'reason',sqlerrm);
 end;
 return jsonb_build_object('kind','simulated','simulation_only',true,'simulation_time',simulated_at,'draft_revision',d.revision,'activity_id',a.id,'profile_id',p_command->>'profile_id','evaluation',result-'policy_version_id');
end $$;
