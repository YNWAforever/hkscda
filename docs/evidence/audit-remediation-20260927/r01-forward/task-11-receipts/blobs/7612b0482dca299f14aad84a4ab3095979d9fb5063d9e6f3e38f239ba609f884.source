-- Verified additive prerequisites for the production catalog captured 2026-09-13.
-- This is a new migration, not a replay/repair of the historical 33-row ledger.
-- Preserves public.animals.source_url, existing facts and sponsorship definitions.
-- Aborts on unexpected definitions; re-inspect drift before changing this candidate.
set local search_path=public,extensions;
do $compatibility$ begin
if exists (
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('log_animal_mutation','update_animal_status_with_audit','upsert_animal_internal_profile_with_audit')
 and (
  (p.proname='log_animal_mutation' and pg_get_function_identity_arguments(p.oid)='' and pg_get_function_result(p.oid)='trigger' and p.prosecdef and p.proconfig=array['search_path=public, pg_temp'])
  or (p.proname='update_animal_status_with_audit' and pg_get_function_identity_arguments(p.oid)='p_actor_user_id uuid, p_animal_id uuid, p_status text, p_updated_at timestamp with time zone' and pg_get_function_result(p.oid)='SETOF animals' and not p.prosecdef and p.proconfig=array['search_path=""'])
  or (p.proname='upsert_animal_internal_profile_with_audit' and pg_get_function_identity_arguments(p.oid)='p_actor_user_id uuid, p_animal_id uuid, p_values jsonb' and pg_get_function_result(p.oid)='SETOF animal_profile_internal' and not p.prosecdef and p.proconfig=array['search_path=""'])
 ) is not true
) then raise exception 'Unreviewed animal command signature or security configuration'; end if;
if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='log_animal_mutation' and md5(p.prosrc) not in ('9c09ace1add74ee81a5b3c8cb2e9d5f1','5425f530476791dc6126f71dd41ead22')) then raise exception 'Unreviewed definition: log_animal_mutation'; end if;
if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_animal_status_with_audit' and md5(p.prosrc) not in ('5b9da373339bbaba23580ceec6c43612')) then raise exception 'Unreviewed definition: update_animal_status_with_audit'; end if;
if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='upsert_animal_internal_profile_with_audit' and md5(p.prosrc) not in ('06af6d27c79ddc62ea2c0495f22348ed')) then raise exception 'Unreviewed definition: upsert_animal_internal_profile_with_audit'; end if;
if exists(select 1 from (select pg_get_constraintdef(oid,true) value from pg_constraint where conrelid='public.donation'::regclass and conname='donation_acquisition_context_check') observed where value not in ('CHECK (acquisition_context IS NULL OR (acquisition_context = ANY (ARRAY[''general''::text, ''story''::text, ''animal''::text, ''sponsor''::text, ''transparency''::text, ''community''::text])))')) then raise exception 'Unreviewed definition: donation.donation_acquisition_context_check'; end if;
if exists(select 1 from (select pg_get_constraintdef(oid,true) value from pg_constraint where conrelid='public.donation'::regclass and conname='donation_acquisition_placement_check') observed where value not in ('CHECK (acquisition_placement IS NULL OR (acquisition_placement = ANY (ARRAY[''mobile-bottom''::text, ''desktop-left''::text])))')) then raise exception 'Unreviewed definition: donation.donation_acquisition_placement_check'; end if;
if exists(select 1 from (select pg_get_constraintdef(oid,true) value from pg_constraint where conrelid='public.donation'::regclass and conname='donation_acquisition_source_check') observed where value not in ('CHECK (acquisition_source IS NULL OR acquisition_source = ''contextual-cta''::text)')) then raise exception 'Unreviewed definition: donation.donation_acquisition_source_check'; end if;
if exists(select 1 from (select pg_get_constraintdef(oid,true) value from pg_constraint where conrelid='public.donation'::regclass and conname='donation_acquisition_trigger_check') observed where value not in ('CHECK (acquisition_trigger IS NULL OR (acquisition_trigger = ANY (ARRAY[''scroll''::text, ''timer''::text])))')) then raise exception 'Unreviewed definition: donation.donation_acquisition_trigger_check'; end if;
if exists(select 1 from (select pg_get_constraintdef(oid,true) value from pg_constraint where conrelid='public.donation'::regclass and conname='donation_method_check') observed where value not in ('CHECK (method = ANY (ARRAY[''stripe''::text, ''payme''::text, ''fps''::text, ''paypal''::text, ''manual''::text, ''alipayhk''::text]))','CHECK (method = ANY (ARRAY[''stripe''::text, ''payme''::text, ''fps''::text, ''paypal''::text, ''manual''::text]))')) then raise exception 'Unreviewed definition: donation.donation_method_check'; end if;
if exists(select 1 from (select pg_get_constraintdef(oid,true) value from pg_constraint where conrelid='public.payment'::regclass and conname='payment_provider_check') observed where value not in ('CHECK (provider = ANY (ARRAY[''stripe''::text, ''payme''::text, ''fps''::text, ''paypal''::text, ''manual''::text, ''cod''::text]))','CHECK (provider = ANY (ARRAY[''stripe''::text, ''payme''::text, ''fps''::text, ''paypal''::text, ''manual''::text]))')) then raise exception 'Unreviewed definition: payment.payment_provider_check'; end if;
if exists(select 1 from (select pg_get_constraintdef(oid,true) value from pg_constraint where conrelid='public.webhook_event'::regclass and conname='webhook_event_provider_check') observed where value not in ('CHECK (provider = ANY (ARRAY[''stripe''::text, ''paypal''::text, ''payme''::text, ''fps''::text, ''resend''::text, ''whatsapp''::text, ''cod''::text]))','CHECK (provider = ANY (ARRAY[''stripe''::text, ''paypal''::text, ''payme''::text, ''fps''::text, ''resend''::text, ''whatsapp''::text]))')) then raise exception 'Unreviewed definition: webhook_event.webhook_event_provider_check'; end if;
if exists(select 1 from (select jsonb_build_array(permissive,roles,cmd,qual,with_check)::text value from pg_policies where schemaname='public' and tablename='adoption_applications' and policyname='staff can delete adoption applications') observed where value not in ('["PERMISSIVE", ["authenticated"], "DELETE", "private.has_admin_role(ARRAY[''staff''::text, ''admin''::text])", null]')) then raise exception 'Unreviewed definition: adoption_applications.staff can delete adoption applications'; end if;
if exists(select 1 from (select jsonb_build_array(permissive,roles,cmd,qual,with_check)::text value from pg_policies where schemaname='public' and tablename='adoption_applications' and policyname='staff can read adoption applications') observed where value not in ('["PERMISSIVE", ["authenticated"], "SELECT", "private.has_admin_role(ARRAY[''staff''::text, ''admin''::text])", null]')) then raise exception 'Unreviewed definition: adoption_applications.staff can read adoption applications'; end if;
if exists(select 1 from (select jsonb_build_array(permissive,roles,cmd,qual,with_check)::text value from pg_policies where schemaname='public' and tablename='adoption_applications' and policyname='staff can update adoption applications') observed where value not in ('["PERMISSIVE", ["authenticated"], "UPDATE", "private.has_admin_role(ARRAY[''staff''::text, ''admin''::text])", "private.has_admin_role(ARRAY[''staff''::text, ''admin''::text])"]')) then raise exception 'Unreviewed definition: adoption_applications.staff can update adoption applications'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.admin_user'::regclass and tgname='audit_admin_user') observed where value not in ('CREATE TRIGGER audit_admin_user AFTER INSERT OR DELETE OR UPDATE ON admin_user FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: admin_user.audit_admin_user'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.adopter_profile'::regclass and tgname='audit_adopter_profile') observed where value not in ('CREATE TRIGGER audit_adopter_profile AFTER INSERT OR DELETE OR UPDATE ON adopter_profile FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: adopter_profile.audit_adopter_profile'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.adoption_applications'::regclass and tgname='audit_adoption_applications') observed where value not in ('CREATE TRIGGER audit_adoption_applications AFTER INSERT OR DELETE OR UPDATE ON adoption_applications FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: adoption_applications.audit_adoption_applications'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.adoption_attachment'::regclass and tgname='audit_adoption_attachment') observed where value not in ('CREATE TRIGGER audit_adoption_attachment AFTER INSERT OR DELETE OR UPDATE ON adoption_attachment FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: adoption_attachment.audit_adoption_attachment'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.adoption_case'::regclass and tgname='audit_adoption_case') observed where value not in ('CREATE TRIGGER audit_adoption_case AFTER INSERT OR DELETE OR UPDATE ON adoption_case FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: adoption_case.audit_adoption_case'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.adoption_fee'::regclass and tgname='audit_adoption_fee') observed where value not in ('CREATE TRIGGER audit_adoption_fee AFTER INSERT OR DELETE OR UPDATE ON adoption_fee FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: adoption_fee.audit_adoption_fee'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.adoption_followup'::regclass and tgname='audit_adoption_followup') observed where value not in ('CREATE TRIGGER audit_adoption_followup AFTER INSERT OR DELETE OR UPDATE ON adoption_followup FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: adoption_followup.audit_adoption_followup'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.animal_position'::regclass and tgname='audit_animal_position') observed where value not in ('CREATE TRIGGER audit_animal_position AFTER INSERT OR DELETE OR UPDATE ON animal_position FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: animal_position.audit_animal_position'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.arrival_source'::regclass and tgname='audit_arrival_source') observed where value not in ('CREATE TRIGGER audit_arrival_source AFTER INSERT OR DELETE OR UPDATE ON arrival_source FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: arrival_source.audit_arrival_source'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.consent'::regclass and tgname='audit_consent') observed where value not in ('CREATE TRIGGER audit_consent AFTER INSERT OR DELETE OR UPDATE ON consent FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: consent.audit_consent'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.coordinator_status'::regclass and tgname='audit_coordinator_status') observed where value not in ('CREATE TRIGGER audit_coordinator_status AFTER INSERT OR DELETE OR UPDATE ON coordinator_status FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: coordinator_status.audit_coordinator_status'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.coordinator_status_history'::regclass and tgname='audit_coordinator_status_history') observed where value not in ('CREATE TRIGGER audit_coordinator_status_history AFTER INSERT OR DELETE OR UPDATE ON coordinator_status_history FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: coordinator_status_history.audit_coordinator_status_history'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.donation'::regclass and tgname='audit_donation') observed where value not in ('CREATE TRIGGER audit_donation AFTER INSERT OR DELETE OR UPDATE ON donation FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: donation.audit_donation'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.living_area'::regclass and tgname='audit_living_area') observed where value not in ('CREATE TRIGGER audit_living_area AFTER INSERT OR DELETE OR UPDATE ON living_area FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: living_area.audit_living_area'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.message_template'::regclass and tgname='audit_message_template') observed where value not in ('CREATE TRIGGER audit_message_template AFTER INSERT OR DELETE OR UPDATE ON message_template FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: message_template.audit_message_template'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.payment'::regclass and tgname='audit_payment') observed where value not in ('CREATE TRIGGER audit_payment AFTER INSERT OR DELETE OR UPDATE ON payment FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: payment.audit_payment'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.receipt'::regclass and tgname='audit_receipt') observed where value not in ('CREATE TRIGGER audit_receipt AFTER INSERT OR DELETE OR UPDATE ON receipt FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: receipt.audit_receipt'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.successful_adoption'::regclass and tgname='audit_successful_adoption') observed where value not in ('CREATE TRIGGER audit_successful_adoption AFTER INSERT OR DELETE OR UPDATE ON successful_adoption FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: successful_adoption.audit_successful_adoption'; end if;
if exists(select 1 from (select pg_get_triggerdef(oid,true) value from pg_trigger where tgrelid='public.supporter'::regclass and tgname='audit_supporter') observed where value not in ('CREATE TRIGGER audit_supporter AFTER INSERT OR DELETE OR UPDATE ON supporter FOR EACH ROW EXECUTE FUNCTION log_animal_mutation()')) then raise exception 'Unreviewed definition: supporter.audit_supporter'; end if;
if exists(select 1 from pg_policies where schemaname='public' and tablename='adoption_applications' and policyname='admin only' and jsonb_build_array(permissive,roles,cmd,qual,with_check)::text <> '["PERMISSIVE", ["public"], "ALL", "(auth.role() = ''authenticated''::text)", null]') then raise exception 'Unreviewed legacy adoption policy'; end if;
if exists(select 1 from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.donation'::regclass and a.attname='acquisition_context' and not a.attisdropped and (format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) <> 'text notnull=false default=') then raise exception 'Unreviewed column: donation.acquisition_context'; end if;
if exists(select 1 from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.donation'::regclass and a.attname='acquisition_placement' and not a.attisdropped and (format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) <> 'text notnull=false default=') then raise exception 'Unreviewed column: donation.acquisition_placement'; end if;
if exists(select 1 from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.donation'::regclass and a.attname='acquisition_source' and not a.attisdropped and (format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) <> 'text notnull=false default=') then raise exception 'Unreviewed column: donation.acquisition_source'; end if;
if exists(select 1 from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.donation'::regclass and a.attname='acquisition_trigger' and not a.attisdropped and (format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) <> 'text notnull=false default=') then raise exception 'Unreviewed column: donation.acquisition_trigger'; end if;
if exists(select 1 from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.payment'::regclass and a.attname='provider_order_ref' and not a.attisdropped and (format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) <> 'text notnull=false default=') then raise exception 'Unreviewed column: payment.provider_order_ref'; end if;
if exists(select 1 from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.webhook_event'::regclass and a.attname='processing_expires_at' and not a.attisdropped and (format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) <> 'timestamp with time zone notnull=false default=') then raise exception 'Unreviewed column: webhook_event.processing_expires_at'; end if;
if exists(select 1 from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.webhook_event'::regclass and a.attname='processing_owner' and not a.attisdropped and (format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) <> 'text notnull=false default=') then raise exception 'Unreviewed column: webhook_event.processing_owner'; end if;
if exists(select 1 from pg_attribute a left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where a.attrelid='public.webhook_event'::regclass and a.attname='processing_started_at' and not a.attisdropped and (format_type(a.atttypid,a.atttypmod)||' notnull='||a.attnotnull||' default='||coalesce(pg_get_expr(ad.adbin,ad.adrelid),'')) <> 'timestamp with time zone notnull=false default=') then raise exception 'Unreviewed column: webhook_event.processing_started_at'; end if;
if exists(select 1 from pg_indexes where schemaname='public' and tablename='payment' and indexname='payment_provider_order_ref_idx' and indexdef <> 'CREATE UNIQUE INDEX payment_provider_order_ref_idx ON public.payment USING btree (provider, provider_order_ref) WHERE (provider_order_ref IS NOT NULL)') then raise exception 'Unreviewed index: payment.payment_provider_order_ref_idx'; end if;
if exists(select 1 from pg_indexes where schemaname='public' and tablename='webhook_event' and indexname='webhook_event_processing_idx' and indexdef <> 'CREATE INDEX webhook_event_processing_idx ON public.webhook_event USING btree (provider, provider_event_id, processed_at, processing_expires_at)') then raise exception 'Unreviewed index: webhook_event.webhook_event_processing_idx'; end if;
end $compatibility$;

-- Reviewed missing/different objects derived from 20260626201620_secure_adoption_applications_policy.sql.
drop policy if exists "admin only" on public.adoption_applications;
drop policy if exists "staff can read adoption applications" on public.adoption_applications;
drop policy if exists "staff can update adoption applications" on public.adoption_applications;
drop policy if exists "staff can delete adoption applications" on public.adoption_applications;

create policy "staff can read adoption applications"
  on public.adoption_applications for select
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));

create policy "staff can update adoption applications"
  on public.adoption_applications for update
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']))
  with check (private.has_admin_role(array['staff', 'admin']));

create policy "staff can delete adoption applications"
  on public.adoption_applications for delete
  to authenticated
  using (private.has_admin_role(array['staff', 'admin']));


-- Reviewed missing/different objects derived from 20260626202523_harden_webhook_event_processing.sql.
alter table public.webhook_event
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_expires_at timestamptz,
  add column if not exists processing_owner text;

create index if not exists webhook_event_processing_idx
  on public.webhook_event (provider, provider_event_id, processed_at, processing_expires_at);


-- Reviewed missing/different objects derived from 20260716120000_contextual_donation_attribution.sql.
alter table public.donation
  add column if not exists acquisition_source text,
  add column if not exists acquisition_context text,
  add column if not exists acquisition_placement text,
  add column if not exists acquisition_trigger text;

alter table public.donation drop constraint if exists donation_acquisition_source_check;
alter table public.donation add constraint donation_acquisition_source_check
  check (acquisition_source is null or acquisition_source = 'contextual-cta');
alter table public.donation drop constraint if exists donation_acquisition_context_check;
alter table public.donation add constraint donation_acquisition_context_check
  check (acquisition_context is null or acquisition_context in ('general','story','animal','sponsor','transparency','community'));
alter table public.donation drop constraint if exists donation_acquisition_placement_check;
alter table public.donation add constraint donation_acquisition_placement_check
  check (acquisition_placement is null or acquisition_placement in ('mobile-bottom','desktop-left'));
alter table public.donation drop constraint if exists donation_acquisition_trigger_check;
alter table public.donation add constraint donation_acquisition_trigger_check
  check (acquisition_trigger is null or acquisition_trigger in ('scroll','timer'));


-- Reviewed missing/different objects derived from 20260720100000_cod_alipayhk_payment_support.sql.
-- Add the donor-facing AlipayHK method while storing its COD processor separately.
-- This migration only widens existing check constraints; it does not modify rows.

alter table public.donation drop constraint if exists donation_method_check;
alter table public.donation add constraint donation_method_check check
  (method in ('stripe', 'payme', 'fps', 'paypal', 'manual', 'alipayhk'));

alter table public.payment drop constraint if exists payment_provider_check;
alter table public.payment add constraint payment_provider_check check
  (provider in ('stripe', 'payme', 'fps', 'paypal', 'manual', 'cod'));

alter table public.webhook_event drop constraint if exists webhook_event_provider_check;
alter table public.webhook_event add constraint webhook_event_provider_check check
  (provider in ('stripe', 'paypal', 'payme', 'fps', 'resend', 'whatsapp', 'cod'));


-- Reviewed missing/different objects derived from 20260805120000_animal_mutation_audit_atomicity.sql.
create or replace function public.log_animal_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity text := tg_table_name;
  v_entity_id text;
  v_detail jsonb;
  -- audit_log has its own, wider reader set than these tables: it admits every
  -- treasurer, while these hold staff-only notes or applicant/adopter personal
  -- data. Copying their values here would relay that content across the role
  -- boundary the source table draws, so only column names cross into audit_log.
  v_redacted boolean := tg_table_name in (
    'animal_profile_internal', 'adoption_applications', 'adopter_profile'
  );
begin
  if auth.uid() is null then
    return null; -- ignored for AFTER triggers; see the scope note in 20260803120000.
  end if;

  -- animal_profile_internal has no `id` column — its primary key is
  -- animal_id (references public.animals(id)). Every other audited table
  -- keys off `id`. Pick the right column per table rather than assuming `id`
  -- everywhere.
  if tg_table_name = 'animal_profile_internal' then
    v_entity_id := coalesce(new.animal_id, old.animal_id)::text;
  else
    v_entity_id := coalesce(new.id, old.id)::text;
  end if;

  if tg_op = 'DELETE' then
    v_detail := case
      when v_redacted then jsonb_build_object(
        'columns',
        (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_each(to_jsonb(old)) as row_columns(key, value)
          where value <> 'null'::jsonb
        )
      )
      else jsonb_build_object('old', to_jsonb(old))
    end;
  elsif tg_op = 'UPDATE' then
    -- Store only the columns that actually changed; whole-row snapshots on every
    -- edit would bloat audit_log for no diagnostic gain.
    v_detail := jsonb_build_object(
      'changed',
      (
        select coalesce(
          case
            when v_redacted then jsonb_agg(key order by key)
            else jsonb_object_agg(key, jsonb_build_object('from', old_row.value, 'to', new_row.value))
          end,
          case when v_redacted then '[]'::jsonb else '{}'::jsonb end
        )
        from jsonb_each(to_jsonb(old)) as old_row(key, value)
        join jsonb_each(to_jsonb(new)) as new_row(key, value) using (key)
        where old_row.value is distinct from new_row.value
      )
    );
  else
    v_detail := case
      when v_redacted then jsonb_build_object(
        'columns',
        (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_each(to_jsonb(new)) as row_columns(key, value)
          where value <> 'null'::jsonb
        )
      )
      else jsonb_build_object('new', to_jsonb(new))
    end;
  end if;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    auth.uid(),
    v_entity || '.' || lower(tg_op),
    v_entity,
    v_entity_id,
    v_detail
  );

  return null; -- ignored for AFTER row-level triggers regardless of value.
end;
$$;

comment on function public.log_animal_mutation() is
  'Writes an audit_log row for direct-from-browser (anon/authenticated JWT) writes to the tables that grant authenticated writes and gate them on an admin role. Service-role writes are skipped — those paths already write their own actor-attributed audit_log row. Values are redacted to column names for tables audit_log is readable by a wider role than the table itself.';

-- Every remaining table that pairs `grant ... to authenticated` with an RLS
-- policy that lets an `authenticated` JWT write it. An admin session in the
-- browser reaches all of these over PostgREST directly, which is exactly the
-- precondition that left public.animals unaudited. "No component writes it
-- today" is a property of our UI, not of the privilege, so it was never a safe
-- reason to leave the trigger off — the tables whose authenticated policy is
-- select-only (supporter_role, message, webhook_event, audit_log) are the only
-- ones where the grant really is inert.
--
-- Every one of these keys off `id`, so log_animal_mutation() needs no new
-- special case. Service-role writes — which is all of production's write
-- traffic here — still short-circuit on the auth.uid() guard, so this is a
-- no-op for the webhook, repository, and RPC paths.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'coordinator_status', 'living_area', 'arrival_source', 'animal_position',
    'admin_user', 'adoption_applications',
    'supporter', 'consent', 'donation', 'payment', 'receipt', 'message_template',
    'adopter_profile', 'adoption_case', 'adoption_fee', 'adoption_followup',
    'adoption_attachment', 'successful_adoption', 'coordinator_status_history'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || v_table, v_table);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.log_animal_mutation()',
      'audit_' || v_table,
      v_table
    );
  end loop;
end;
$$;

-- Atomic mutation + audit for the two service-role animal routes. security
-- invoker + a pinned empty search_path matches mutate_document_asset_with_audit;
-- the caller is the service role, which bypasses RLS.
create or replace function public.update_animal_status_with_audit(
  p_actor_user_id uuid,
  p_animal_id uuid,
  p_status text,
  p_updated_at timestamptz
)
returns setof public.animals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_status text;
  v_row public.animals;
begin
  select status into v_old_status
  from public.animals
  where id = p_animal_id
  for update;

  if not found then
    return; -- empty result; the caller turns that into a 404.
  end if;

  update public.animals
  set status = p_status,
      updated_at = p_updated_at
  where id = p_animal_id
  returning * into v_row;

  insert into public.audit_log (actor_user_id, action, entity, entity_id, "timestamp", detail)
  values (
    p_actor_user_id,
    'animals.update',
    'animals',
    p_animal_id::text,
    p_updated_at,
    jsonb_build_object(
      'changed',
      jsonb_build_object('status', jsonb_build_object('from', v_old_status, 'to', p_status))
    )
  );

  return next v_row;
end;
$$;

create or replace function public.upsert_animal_internal_profile_with_audit(
  p_actor_user_id uuid,
  p_animal_id uuid,
  p_values jsonb
)
returns setof public.animal_profile_internal
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old jsonb;
  v_input public.animal_profile_internal;
  v_row public.animal_profile_internal;
begin
  select to_jsonb(existing) into v_old
  from public.animal_profile_internal as existing
  where existing.animal_id = p_animal_id
  for update;

  v_input := jsonb_populate_record(null::public.animal_profile_internal, p_values);

  insert into public.animal_profile_internal (
    animal_id, internal_code, arrival_date, arrival_source_id, current_position_id,
    cage, has_chip, chip_remarks, is_desexed, desexed_at, desex_remarks,
    is_adoptable, is_inside_support_pool, adopted_at, deceased_at, internal_remarks
  )
  values (
    p_animal_id, v_input.internal_code, v_input.arrival_date, v_input.arrival_source_id,
    v_input.current_position_id, v_input.cage, v_input.has_chip, v_input.chip_remarks,
    v_input.is_desexed, v_input.desexed_at, v_input.desex_remarks, v_input.is_adoptable,
    v_input.is_inside_support_pool, v_input.adopted_at, v_input.deceased_at,
    v_input.internal_remarks
  )
  on conflict (animal_id) do update set
    internal_code = excluded.internal_code,
    arrival_date = excluded.arrival_date,
    arrival_source_id = excluded.arrival_source_id,
    current_position_id = excluded.current_position_id,
    cage = excluded.cage,
    has_chip = excluded.has_chip,
    chip_remarks = excluded.chip_remarks,
    is_desexed = excluded.is_desexed,
    desexed_at = excluded.desexed_at,
    desex_remarks = excluded.desex_remarks,
    is_adoptable = excluded.is_adoptable,
    is_inside_support_pool = excluded.is_inside_support_pool,
    adopted_at = excluded.adopted_at,
    deceased_at = excluded.deceased_at,
    internal_remarks = excluded.internal_remarks
  returning * into v_row;

  -- Column names only: audit_log is readable by treasurer, this table is not.
  insert into public.audit_log (actor_user_id, action, entity, entity_id, detail)
  values (
    p_actor_user_id,
    case when v_old is null then 'animal_profile_internal.insert' else 'animal_profile_internal.update' end,
    'animal_profile_internal',
    p_animal_id::text,
    case
      when v_old is null then jsonb_build_object(
        'columns',
        (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_each(to_jsonb(v_row)) as row_columns(key, value)
          where value <> 'null'::jsonb
        )
      )
      else jsonb_build_object(
        'changed',
        (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_each(v_old) as old_row(key, value)
          join jsonb_each(to_jsonb(v_row)) as new_row(key, value) using (key)
          where old_row.value is distinct from new_row.value
        )
      )
    end
  );

  return next v_row;
end;
$$;

grant execute on function public.update_animal_status_with_audit(uuid, uuid, text, timestamptz)
  to service_role;
grant execute on function public.upsert_animal_internal_profile_with_audit(uuid, uuid, jsonb)
  to service_role;


-- Reviewed missing/different objects derived from 20260816120000_cod_payment_order_reference.sql.
-- Persist COD's merchant order_ref. The API documents this as the supported
-- key for order_details; transaction_details does not support out_trade_no.

alter table public.payment
  add column if not exists provider_order_ref text;

create unique index if not exists payment_provider_order_ref_idx
  on public.payment(provider, provider_order_ref)
  where provider_order_ref is not null;


-- These commands rely on server-authenticated actors; browsers cannot supply them.
revoke execute on function public.update_animal_status_with_audit(uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke execute on function public.upsert_animal_internal_profile_with_audit(uuid,uuid,jsonb) from public,anon,authenticated;
revoke execute on function public.log_animal_mutation() from public,anon,authenticated;
