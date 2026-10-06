create or replace function public.enforce_editorial_review() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare k text; eid uuid; rev text;
begin
 if tg_table_name='animal_publication_version' then
  if new.body->>'publication_state'<>'published' then return new;end if;
  k:='animal';eid:=new.animal_id;rev:=new.revision::text;
 else
  if new.status<>'published' then return new;end if;
  k:='content';eid:=new.id;rev:=new.published_revision_id::text;
 end if;
 if not exists(select 1 from public.editorial_content_review where entity_kind=k and entity_id=eid and revision_key=rev and classification='approved') then raise exception '此版本尚未核實為可發布內容，請先完成內容來源審核' using errcode='22023';end if;
 return new;
end $$;
revoke all on function public.enforce_editorial_review() from public,anon,authenticated;
