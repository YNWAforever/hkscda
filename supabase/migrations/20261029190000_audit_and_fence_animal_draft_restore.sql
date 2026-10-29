-- BUG-22: animal draft save and version restore were unaudited, and restore had no fence.
--
-- animal_publication_command runs as service_role, so the log_animal_mutation trigger skips
-- it. Its 'save' branch (which can also create the animals row) and its 'copy' branch
-- (restore a published version into the draft) wrote no audit_log row. 'copy' also took no
-- expected_revision, so restoring an old version silently replaced another editor's newer
-- draft.
--
-- This redefinition is the 20260914164558 function with three changes:
--   * 'save' writes an animal.draft.save audit row (revision, and whether it created the
--     animal) in the same transaction;
--   * 'copy' requires a non-negative integer expected_revision (422 otherwise) and answers conflict when
--     the draft has moved on, the same fence 'save' uses;
--   * 'copy' writes an animal.draft.copy audit row (version id and revisions).
-- Every other branch, the signature, security definer, search_path and grants are unchanged.

create or replace function public.animal_publication_command(p_actor uuid,p_command jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare k text:=p_command->>'kind';aid uuid:=coalesce((p_command->>'animal_id')::uuid,gen_random_uuid());d public.animal_draft%rowtype;pv public.animal_publication_preview%rowtype;v public.animal_publication_version%rowtype;b jsonb:=p_command->'body';v_created boolean;begin
 if not exists(select 1 from public.admin_user a join auth.users u on u.id=a.auth_user_id where a.auth_user_id=p_actor and a.status='active' and a.role in ('staff','admin') and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=clock_timestamp()))then raise exception 'forbidden' using errcode='42501';end if;
 if k='read' then return jsonb_build_object('kind','read','draft',(select to_jsonb(x) from public.animal_draft x where id=aid),'versions',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc)from public.animal_publication_version x where animal_id=aid),'[]'::jsonb));end if;
 if k='save' then
  if jsonb_typeof(b)<>'object' or nullif(b->>'name','')is null or b->>'type' not in('cat','dog')or b->>'gender' not in('male','female')or b->>'status' not in('available','adopted','fostered')or b->>'publication_state' not in('draft','published','unpublished') or jsonb_typeof(coalesce(b->'gallery','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(b->'gallery','[]'::jsonb))>20 or exists(select 1 from jsonb_array_elements(coalesce(b->'gallery','[]'::jsonb)) g where g->>'review_status' not in('pending','approved','rejected') or (g->>'focal_x')::int not between 0 and 100 or (g->>'focal_y')::int not between 0 and 100 or nullif(btrim(g->>'source'),'') is null or nullif(btrim(g->>'alt_zh'),'') is null or ((g->>'url') is null and (g->>'draft_path') is null)) then raise exception 'invalid animal draft' using errcode='22023';end if;
  insert into public.animals(id,type,name,name_en,gender,age,age_en,description,description_en,notes,notes_en,status,image_url,adoption_eligible,sponsorship_eligible,publication_state,public_profile)values(aid,b->>'type',b->>'name',b->>'name_en',b->>'gender',b->>'age',b->>'age_en',b->>'description',b->>'description_en',b->>'notes',b->>'notes_en',b->>'status',b->>'image_url',coalesce((b->>'adoption_eligible')::boolean,false),coalesce((b->>'sponsorship_eligible')::boolean,false),'draft',b->'public_profile')on conflict(id)do nothing;v_created:=found;
  select*into d from public.animal_draft where id=aid for update;if found and d.revision<>(p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict');end if;
  insert into public.animal_draft(id,body,revision,updated_by)values(aid,b,1,p_actor)on conflict(id)do update set body=excluded.body,revision=animal_draft.revision+1,updated_by=p_actor,updated_at=clock_timestamp() returning*into d;
  -- BUG-22: service-role writes skip the animals trigger, so the save (and the animal row it may create) is audited here.
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)values(p_actor,'animal.draft.save','animal',aid::text,jsonb_build_object('revision',d.revision,'created',v_created));
  return jsonb_build_object('kind','saved','animal_id',aid,'revision',d.revision);
 end if;
 select*into d from public.animal_draft where id=aid for update;if not found then return jsonb_build_object('kind','not_found');end if;
 if k='preview' then insert into public.animal_publication_preview(animal_id,draft_revision,body,created_by)values(aid,d.revision,d.body,p_actor)returning*into pv;return jsonb_build_object('kind','preview','preview_id',pv.id,'revision',d.revision,'body',d.body);end if;
 if k='copy' then
  -- BUG-22: restoring a version replaces the whole draft, so it must name the revision it replaces.
  if coalesce(jsonb_typeof(p_command->'expected_revision'),'')<>'number' or p_command->>'expected_revision'!~'^[0-9]+$' then raise exception 'invalid animal draft' using errcode='22023';end if;
  if d.revision<>(p_command->>'expected_revision')::bigint then return jsonb_build_object('kind','conflict');end if;
  select*into v from public.animal_publication_version where id=(p_command->>'version_id')::uuid and animal_id=aid;if not found then return jsonb_build_object('kind','not_found');end if;update public.animal_draft set body=v.body,revision=revision+1,updated_by=p_actor,updated_at=clock_timestamp()where id=aid returning*into d;
  insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)values(p_actor,'animal.draft.copy','animal',aid::text,jsonb_build_object('version_id',v.id,'version_revision',v.revision,'revision',d.revision));
  return jsonb_build_object('kind','copied','revision',d.revision);
 end if;
 if k='publish' then select*into pv from public.animal_publication_preview where id=(p_command->>'preview_id')::uuid and animal_id=aid and created_by=p_actor and expires_at>clock_timestamp();if not found or pv.draft_revision<>d.revision then return jsonb_build_object('kind','conflict');end if;b:=case when nullif(p_command->>'published_image_url','') is not null then jsonb_set(pv.body,'{image_url}',to_jsonb(p_command->>'published_image_url')) else pv.body end;if p_command?'publication_gallery' then b:=jsonb_set(b,'{gallery}',p_command->'publication_gallery');end if;update public.animals set type=b->>'type',name=b->>'name',name_en=nullif(b->>'name_en',''),gender=b->>'gender',age=b->>'age',age_en=nullif(b->>'age_en',''),description=nullif(b->>'description',''),description_en=nullif(b->>'description_en',''),notes=nullif(b->>'notes',''),notes_en=nullif(b->>'notes_en',''),status=b->>'status',image_url=nullif(b->>'image_url',''),adoption_eligible=(b->>'adoption_eligible')::boolean,sponsorship_eligible=(b->>'sponsorship_eligible')::boolean,publication_state=b->>'publication_state',public_profile=b->'public_profile',gallery=coalesce(p_command->'published_gallery','[]'::jsonb),updated_at=clock_timestamp()where id=aid;insert into public.animal_publication_version(animal_id,body,revision,published_by,reason)values(aid,b,d.revision,p_actor,p_command->>'reason')returning*into v;delete from public.animal_publication_preview where animal_id=aid;insert into public.audit_log(actor_user_id,action,entity,entity_id,detail)values(p_actor,'animal.publish','animal',aid::text,jsonb_build_object('version_id',v.id,'revision',d.revision));return jsonb_build_object('kind','published','version_id',v.id);end if;raise exception 'invalid command' using errcode='22023';end $$;

-- Unchanged from 20260913073314: service_role only.
revoke all on function public.animal_publication_command(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.animal_publication_command(uuid,jsonb) to service_role;
