-- Forward repair: production table defaults grant service_role ALL privileges.
-- These three tables are read-only to the service client; guarded owner RPCs
-- continue to perform their normal writes. Preserve every existing row and RPC.
-- Precreate an empty duplicate archive so later separately approved owner-only
-- archival/deduplication can reuse it without inheriting mutable service grants.
create table if not exists public.recipient_notification_draft_duplicate_archive (
  like public.recipient_notification_draft including defaults,
  kept_id uuid not null,
  archived_at timestamptz not null default clock_timestamp()
);
alter table public.recipient_notification_draft_duplicate_archive enable row level security;

do $$
declare
  v_relation regclass;
  v_columns text;
begin
  foreach v_relation in array array[
    'public.recipient_notification_draft_duplicate_archive'::regclass,
    'public.crm_export_job'::regclass,
    'public.sponsorship_payment_instruction_snapshot'::regclass
  ] loop
    -- Table REVOKE alone does not remove independently granted column rights.
    execute pg_catalog.format(
      'revoke all privileges on table %s from public, anon, authenticated, service_role',
      v_relation
    );
    select pg_catalog.string_agg(pg_catalog.quote_ident(a.attname), ',' order by a.attnum)
      into v_columns
      from pg_catalog.pg_attribute a
      where a.attrelid = v_relation and a.attnum > 0 and not a.attisdropped;
    if v_columns is not null then
      execute pg_catalog.format(
        'revoke all privileges (%s) on table %s from public, anon, authenticated, service_role',
        v_columns, v_relation
      );
    end if;
    execute pg_catalog.format('grant select on table %s to service_role', v_relation);
  end loop;
end;
$$;
