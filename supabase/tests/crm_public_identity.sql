\set ON_ERROR_STOP on

\if :{?crm_test_target}
\else
  \echo 'Refusing CRM identity tests without -v crm_test_target=local'
  \quit 3
\endif
select :'crm_test_target' = 'local' as crm_target_is_local \gset
\if :crm_target_is_local
\else
  \echo 'Refusing CRM identity tests: crm_test_target must be local'
  \quit 3
\endif
select inet_server_addr() is null
  or inet_server_addr() << inet '127.0.0.0/8'
  or inet_server_addr() << inet '10.0.0.0/8'
  or inet_server_addr() << inet '172.16.0.0/12'
  or inet_server_addr() << inet '192.168.0.0/16'
  or inet_server_addr() = inet '::1' as crm_server_is_local \gset
\if :crm_server_is_local
\else
  \echo 'Refusing CRM identity tests against a public/remote database address'
  \quit 3
\endif


begin;

do $$
declare
  v_email citext := ('crm-identity-' || gen_random_uuid() || '@example.invalid')::citext;
  v_original_id uuid;
  v_result jsonb;
  v_count integer;
  v_row public.supporter%rowtype;
begin
  insert into public.supporter (name, email, phone, language, source, deleted_at)
  values ('Canonical Name', v_email, '11111111', 'zh-HK', 'admin', now())
  returning id into v_original_id;

  v_result := public.resolve_public_supporter_identity(jsonb_build_object(
    'name', 'Untrusted Replacement', 'email', upper(v_email::text),
    'phone', '99999999', 'language', 'en', 'source', 'donation_form'
  ));

  if v_result->>'supporterId' <> v_original_id::text or v_result->>'kind' <> 'existing' then
    raise exception 'existing identity did not resolve to canonical supporter';
  end if;
  select * into v_row from public.supporter where id = v_original_id;
  if v_row.name <> 'Canonical Name' or v_row.phone <> '11111111'
     or v_row.language <> 'zh-HK' or v_row.source <> 'admin' or v_row.deleted_at is null then
    raise exception 'public resolution changed canonical or deleted supporter data';
  end if;

  -- A sequential replay must return the same canonical row without mutation.
  perform public.resolve_public_supporter_identity(jsonb_build_object(
    'name', 'Second Claim', 'email', lower(v_email::text),
    'phone', null, 'language', 'en', 'source', 'volunteer_registration_form'
  ));
  select count(*) into v_count from public.supporter where email = v_email;
  if v_count <> 1 then
    raise exception 'competing identity claims created % supporter rows', v_count;
  end if;

  begin
    perform public.resolve_public_supporter_identity(jsonb_build_object(
      'name', 'Invalid', 'email', 'invalid-' || v_email, 'language', null, 'source', null
    ));
    raise exception 'NULL language/source were accepted';
  exception when sqlstate '22023' then null;
  end;
end
$$;

rollback;
