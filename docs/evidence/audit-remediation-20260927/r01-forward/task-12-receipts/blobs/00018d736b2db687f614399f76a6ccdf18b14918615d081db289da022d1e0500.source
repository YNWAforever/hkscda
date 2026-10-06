-- A public pledge is complete only when its preferences, optional proof, and
-- bearer status token all commit together. A lost HTTP/RPC response can then
-- be recovered by looking up the already committed token.
create function public.create_public_sponsorship_pledge(
  p_pledge_id uuid,
  p_pledge jsonb,
  p_preferences jsonb,
  p_proof jsonb,
  p_token jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.sponsorship_pledge (
    id, supporter_id, monthly_tier, amount_cents, currency, language, notes,
    contact_submission, status, consent_email_requested, consent_whatsapp_requested
  ) values (
    p_pledge_id,
    (p_pledge->>'supporter_id')::uuid,
    p_pledge->>'monthly_tier',
    (p_pledge->>'amount_cents')::integer,
    p_pledge->>'currency',
    p_pledge->>'language',
    p_pledge->>'notes',
    p_pledge->'contact_submission',
    p_pledge->>'status',
    (p_pledge->>'consent_email_requested')::boolean,
    (p_pledge->>'consent_whatsapp_requested')::boolean
  );

  insert into public.sponsorship_preference (
    pledge_id, sponsor_animal_id, rank, animal_name_snapshot, animal_type_snapshot
  )
  select
    p_pledge_id, preference.sponsor_animal_id, preference.rank,
    preference.animal_name_snapshot, preference.animal_type_snapshot
  from pg_catalog.jsonb_to_recordset(p_preferences) as preference (
    sponsor_animal_id uuid,
    rank integer,
    animal_name_snapshot text,
    animal_type_snapshot text
  );

  if p_proof is not null then
    insert into public.sponsorship_payment_proof (
      pledge_id, storage_path, file_name, file_type, file_size, payment_method,
      reference, amount_cents, payment_date, review_status
    ) values (
      p_pledge_id,
      p_proof->>'storage_path',
      p_proof->>'file_name',
      p_proof->>'file_type',
      (p_proof->>'file_size')::integer,
      p_proof->>'payment_method',
      p_proof->>'reference',
      (p_proof->>'amount_cents')::integer,
      (p_proof->>'payment_date')::date,
      'pending'
    );
  end if;

  insert into public.public_status_token (
    token_hash, entity_type, entity_id, expires_at, submission_fingerprint
  ) values (
    p_token->>'token_hash',
    'sponsorship_pledge',
    p_pledge_id,
    (p_token->>'expires_at')::timestamptz,
    p_token->>'submission_fingerprint'
  );
end;
$$;

revoke all on function public.create_public_sponsorship_pledge(uuid, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_public_sponsorship_pledge(uuid, jsonb, jsonb, jsonb, jsonb)
  to service_role;
